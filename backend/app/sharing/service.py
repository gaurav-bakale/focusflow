"""
Sharing — Service layer.

SharingService encapsulates all database interactions for task sharing.
The router stays thin: it validates HTTP inputs, calls the service,
and returns the result — no DB logic leaks into the router.

This mirrors the pattern established by app.tasks.service.TaskService.
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Service Layer   — all DB/business logic lives here; the router stays thin.
#
# Repository      — SharingService wraps the MongoDB 'task_shares' collection,
#                   providing a clean, collection-agnostic API to callers.
#
# Dependency Inj. — The `db` handle is passed into __init__ by the FastAPI
#                   Depends() factory in the router.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime
from typing import List

from bson import ObjectId
from fastapi import HTTPException, status

from app.sharing.models import (
    Permission,
    ShareCreate,
    ShareResponse,
    ShareStatus,
    ShareUpdate,
    SharedTaskInfo,
)


class SharingService:
    """
    All task-sharing business logic and database operations.

    Design patterns applied
    -----------------------
    Service Layer  : Single authoritative source of sharing business logic.
    Repository     : Acts as a repository for the 'task_shares' collection.
    """

    def __init__(self, db):
        self.db = db

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _object_id(self, id_str: str) -> ObjectId:
        """Parse an id string to ObjectId, raising 404 on invalid format."""
        try:
            return ObjectId(id_str)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found",
            )

    def _doc_to_share(self, doc: dict) -> ShareResponse:
        """Convert a raw MongoDB document to a ShareResponse model."""
        return ShareResponse(
            id=str(doc["_id"]),
            task_id=str(doc["task_id"]),
            owner_id=str(doc["owner_id"]),
            shared_with_email=doc["shared_with_email"],
            shared_with_id=str(doc["shared_with_id"]) if doc.get("shared_with_id") else None,
            shared_with_name=doc.get("shared_with_name"),
            permission=doc["permission"],
            status=doc.get("status", ShareStatus.PENDING),
            created_at=doc.get("created_at", datetime.utcnow()),
        )

    async def _verify_task_ownership(self, user: dict, task_id: str) -> dict:
        """
        Verify that the user owns the task.

        Returns the task document if valid, raises 404 otherwise.
        """
        doc = await self.db["tasks"].find_one(
            {"_id": self._object_id(task_id), "user_id": user["_id"]}
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found or not owned by you",
            )
        return doc

    # ── Share a task ─────────────────────────────────────────────────────────

    async def share_task(self, user: dict, data: ShareCreate) -> ShareResponse:
        """
        Share a task with another user by email.

        - Validates the caller owns the task.
        - Prevents sharing with yourself.
        - Prevents duplicate shares to the same email for the same task.
        - If the target email is a registered user, links by user_id and
          sets status to ACCEPTED. Otherwise, stores as PENDING.
        """
        # Verify ownership
        await self._verify_task_ownership(user, data.task_id)

        # Cannot share with yourself
        user_email = user.get("email", "")
        if data.email.lower() == user_email.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot share a task with yourself",
            )

        # Check for duplicate share
        existing = await self.db["task_shares"].find_one({
            "task_id": data.task_id,
            "shared_with_email": data.email.lower(),
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Task is already shared with this user",
            )

        # Look up the target user
        target_user = await self.db["users"].find_one(
            {"email": data.email.lower()}
        )

        now = datetime.utcnow()
        share_doc = {
            "task_id": data.task_id,
            "owner_id": str(user["_id"]),
            "shared_with_email": data.email.lower(),
            "shared_with_id": str(target_user["_id"]) if target_user else None,
            "shared_with_name": target_user.get("name") if target_user else None,
            "permission": data.permission,
            "status": ShareStatus.ACCEPTED if target_user else ShareStatus.PENDING,
            "created_at": now,
        }

        result = await self.db["task_shares"].insert_one(share_doc)
        share_doc["_id"] = result.inserted_id
        return self._doc_to_share(share_doc)

    # ── List shares for a task ───────────────────────────────────────────────

    async def list_shares_for_task(
        self, user: dict, task_id: str
    ) -> List[ShareResponse]:
        """
        Return all shares for a task.

        Only the task owner can see the full share list.
        """
        await self._verify_task_ownership(user, task_id)

        cursor = self.db["task_shares"].find(
            {"task_id": task_id}
        ).sort("created_at", -1)

        return [self._doc_to_share(doc) async for doc in cursor]

    # ── Update permission ────────────────────────────────────────────────────

    async def update_share_permission(
        self, user: dict, share_id: str, data: ShareUpdate
    ) -> ShareResponse:
        """
        Update the permission level on an existing share.

        Only the task owner can change permissions.
        """
        share_doc = await self.db["task_shares"].find_one(
            {"_id": self._object_id(share_id)}
        )
        if not share_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Share not found",
            )

        if share_doc["owner_id"] != str(user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the task owner can update share permissions",
            )

        result = await self.db["task_shares"].find_one_and_update(
            {"_id": self._object_id(share_id)},
            {"$set": {"permission": data.permission}},
            return_document=True,
        )
        return self._doc_to_share(result)

    # ── Revoke share ─────────────────────────────────────────────────────────

    async def revoke_share(self, user: dict, share_id: str) -> None:
        """
        Remove a share — only the task owner can revoke.

        Raises 404 if the share does not exist.
        Raises 403 if the caller is not the task owner.
        """
        share_doc = await self.db["task_shares"].find_one(
            {"_id": self._object_id(share_id)}
        )
        if not share_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Share not found",
            )

        if share_doc["owner_id"] != str(user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the task owner can revoke shares",
            )

        await self.db["task_shares"].delete_one(
            {"_id": self._object_id(share_id)}
        )

    # ── Shared with me ───────────────────────────────────────────────────────

    async def get_shared_with_me(self, user: dict) -> List[SharedTaskInfo]:
        """
        Return all tasks that have been shared with the current user.

        Joins task_shares with tasks and users to build a rich response
        containing task details and owner information.
        """
        user_id_str = str(user["_id"])
        user_email = user.get("email", "").lower()

        # Find shares targeting this user (by id or email)
        cursor = self.db["task_shares"].find({
            "$or": [
                {"shared_with_id": user_id_str},
                {"shared_with_email": user_email},
            ],
            "status": ShareStatus.ACCEPTED,
        }).sort("created_at", -1)

        results = []
        async for share in cursor:
            # Fetch the task
            task = await self.db["tasks"].find_one(
                {"_id": self._object_id(share["task_id"])}
            )
            if not task:
                continue

            # Fetch the owner
            owner = await self.db["users"].find_one(
                {"_id": self._object_id(share["owner_id"])}
            )

            results.append(SharedTaskInfo(
                id=str(share["_id"]),
                task_id=str(task["_id"]),
                task_title=task.get("title", ""),
                task_description=task.get("description"),
                task_priority=task.get("priority", "MEDIUM"),
                task_status=task.get("status", "TODO"),
                task_deadline=task.get("deadline"),
                owner_id=share["owner_id"],
                owner_name=owner.get("name") if owner else None,
                owner_email=owner.get("email", "") if owner else share.get("shared_with_email", ""),
                permission=share["permission"],
                shared_at=share.get("created_at", datetime.utcnow()),
            ))

        return results
