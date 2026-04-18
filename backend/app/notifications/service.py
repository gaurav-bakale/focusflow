"""
Notifications Service — business logic for all user notifications.

Responsibilities:
  • Create notifications (deadline scanner, task events, collaboration, etc.)
  • List notifications for a user (newest first)
  • Mark individual or all notifications as read
  • Delete a notification
  • Check for duplicate notifications (prevent re-alerting)
  • One-shot ``emit()`` helper that persists a notification AND pushes the
    real-time WebSocket event — used by every feature that fires
    notifications outside the scheduled scanner.

Design Patterns:
  Repository — all MongoDB access is encapsulated here; the router
               never touches the database directly.
  Observer   — `emit()` publishes to subscribed WebSocket clients via
               the ConnectionManager singleton.
"""

import logging
from datetime import datetime
from typing import List, Optional

from bson import ObjectId

from app.notifications.models import (
    NotificationCreate,
    NotificationResponse,
    NotificationType,
)

logger = logging.getLogger("focusflow.notifications")


class NotificationService:
    """Encapsulates all notification persistence and business logic."""

    def __init__(self, db):
        self.db = db
        self.col = db["notifications"]

    async def create(self, data: NotificationCreate) -> NotificationResponse:
        """Insert a new notification and return the created document."""
        doc = {
            "user_id": data.user_id,
            "task_id": data.task_id,
            "task_title": data.task_title,
            "type": data.type.value,
            "message": data.message,
            "read": False,
            "created_at": datetime.utcnow(),
        }
        result = await self.col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._to_response(doc)

    # ── Emit — persist + push via WebSocket in one call ───────────────────

    async def emit(
        self,
        *,
        user_id: str,
        ntype: NotificationType,
        message: str,
        task_id: Optional[str] = None,
        task_title: Optional[str] = None,
    ) -> Optional[NotificationResponse]:
        """
        Persist a notification AND push it to the user in real time.

        All callers outside the scheduled deadline scanner should use this
        method rather than ``create`` directly — it guarantees the WebSocket
        event fires so the bell updates instantly.

        Returns the created notification, or None if the DB insert failed
        (logged, not raised, because a dropped notification must not roll
        back the originating business operation).
        """
        try:
            notification = await self.create(NotificationCreate(
                user_id=user_id,
                task_id=task_id,
                task_title=task_title,
                type=ntype,
                message=message,
            ))
        except Exception as exc:
            logger.warning("emit: failed to persist notification: %s", exc)
            return None

        # Push to WebSocket — import inline to avoid a circular import at
        # module load time (ws.py also imports from the app package).
        try:
            from app.ws import manager as ws_manager
            await ws_manager.send_to_user(user_id, {
                "type": "notification",
                "notification": {
                    "id": notification.id,
                    "task_id": task_id,
                    "task_title": task_title,
                    "notification_type": ntype.value,
                    "message": message,
                },
            })
        except Exception as exc:
            # WebSocket push failure should never break the caller — the
            # notification is already persisted; the client will pick it up
            # on the next poll.
            logger.debug("emit: websocket push failed (non-critical): %s", exc)

        return notification

    async def emit_to_workspace_peers(
        self,
        *,
        workspace_id: str,
        actor_user_id: str,
        ntype: NotificationType,
        message: str,
        task_id: Optional[str] = None,
        task_title: Optional[str] = None,
    ) -> int:
        """
        Emit a notification to every workspace member except the actor.

        Used when a member does something (adds / completes a task) that the
        rest of the team should see in their bell. The actor does not
        receive their own notification — that would be noise.

        Returns the number of notifications successfully persisted.
        """
        sent = 0
        cursor = self.db["workspace_members"].find({"workspace_id": workspace_id})
        async for member in cursor:
            recipient = member.get("user_id")
            if not recipient or recipient == str(actor_user_id):
                continue
            result = await self.emit(
                user_id=recipient,
                ntype=ntype,
                message=message,
                task_id=task_id,
                task_title=task_title,
            )
            if result:
                sent += 1
        return sent

    async def exists(
        self, user_id: str, task_id: str, ntype: NotificationType
    ) -> bool:
        """Check if a notification of this type already exists for this task."""
        doc = await self.col.find_one({
            "user_id": user_id,
            "task_id": task_id,
            "type": ntype.value,
        })
        return doc is not None

    async def list_for_user(
        self, user_id: str, limit: int = 50, unread_only: bool = False
    ) -> List[NotificationResponse]:
        """Return notifications for a user, newest first."""
        query = {"user_id": user_id}
        if unread_only:
            query["read"] = False
        cursor = self.col.find(query).sort("created_at", -1).limit(limit)
        results = []
        async for doc in cursor:
            results.append(self._to_response(doc))
        return results

    async def unread_count(self, user_id: str) -> int:
        """Return the number of unread notifications for a user."""
        return await self.col.count_documents({
            "user_id": user_id,
            "read": False,
        })

    async def mark_read(self, notification_id: str, user_id: str) -> bool:
        """Mark a single notification as read. Returns True if found."""
        result = await self.col.update_one(
            {"_id": ObjectId(notification_id), "user_id": user_id},
            {"$set": {"read": True}},
        )
        return result.modified_count > 0

    async def mark_all_read(self, user_id: str) -> int:
        """Mark all notifications as read for a user. Returns count updated."""
        result = await self.col.update_many(
            {"user_id": user_id, "read": False},
            {"$set": {"read": True}},
        )
        return result.modified_count

    async def delete(self, notification_id: str, user_id: str) -> bool:
        """Delete a notification. Returns True if found and deleted."""
        result = await self.col.delete_one(
            {"_id": ObjectId(notification_id), "user_id": user_id},
        )
        return result.deleted_count > 0

    @staticmethod
    def _to_response(doc: dict) -> NotificationResponse:
        return NotificationResponse(
            id=str(doc["_id"]),
            user_id=doc["user_id"],
            task_id=doc["task_id"],
            task_title=doc["task_title"],
            type=doc["type"],
            message=doc["message"],
            read=doc.get("read", False),
            created_at=doc["created_at"],
        )
