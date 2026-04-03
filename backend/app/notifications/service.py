"""
Notifications Service — business logic for deadline notifications.

Responsibilities:
  • Create notifications (used by the background deadline scanner)
  • List notifications for a user (newest first)
  • Mark individual or all notifications as read
  • Delete a notification
  • Check for duplicate notifications (prevent re-alerting)

Design Patterns:
  Repository — all MongoDB access is encapsulated here; the router
               never touches the database directly.
"""

from datetime import datetime
from typing import List

from bson import ObjectId

from app.notifications.models import (
    NotificationCreate,
    NotificationResponse,
    NotificationType,
)


class NotificationService:
    """Encapsulates all notification persistence and business logic."""

    def __init__(self, db):
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
