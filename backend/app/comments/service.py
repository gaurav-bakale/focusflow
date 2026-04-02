"""
Comments — Service layer.

CommentService encapsulates all database interactions for task comments.
The router stays thin: it validates HTTP inputs, calls the service,
and returns the result — no DB logic leaks into the router.

This mirrors the pattern established by app.tasks.service.TaskService.
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Service Layer   — all DB/business logic lives here; the router stays thin.
#
# Repository      — CommentService wraps the MongoDB 'comments' collection,
#                   providing a clean, collection-agnostic API to callers.
#
# Dependency Inj. — The `db` handle is passed into __init__ by the FastAPI
#                   Depends() factory in the router.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime
from typing import List

from bson import ObjectId
from fastapi import HTTPException, status

from app.comments.models import (
    CommentCreate,
    CommentResponse,
    CommentUpdate,
)


class CommentService:
    """
    All task-comment business logic and database operations.

    Design patterns applied
    -----------------------
    Service Layer  : Single authoritative source of comment business logic.
    Repository     : Acts as a repository for the 'comments' collection.
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

    def _doc_to_comment(self, doc: dict) -> CommentResponse:
        """Convert a raw MongoDB document to a CommentResponse model."""
        return CommentResponse(
            id=str(doc["_id"]),
            task_id=str(doc["task_id"]),
            user_id=str(doc["user_id"]),
            user_name=doc.get("user_name", "Unknown"),
            content=doc["content"],
            created_at=doc.get("created_at", datetime.utcnow()),
            updated_at=doc.get("updated_at", datetime.utcnow()),
        )

    async def _verify_task_access(self, user: dict, task_id: str) -> None:
        """
        Verify the user can access the task (owner or shared-with).

        Raises 404 if the task does not exist or the user has no access.
        """
        task = await self.db["tasks"].find_one(
            {"_id": self._object_id(task_id)}
        )
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        # Owner always has access
        if str(task["user_id"]) == str(user["_id"]):
            return

        # Check for an accepted share
        share = await self.db["task_shares"].find_one({
            "task_id": task_id,
            "shared_with_id": str(user["_id"]),
            "status": "ACCEPTED",
        })
        if not share:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

    # ── Add comment ──────────────────────────────────────────────────────────

    async def add_comment(
        self, user: dict, task_id: str, data: CommentCreate
    ) -> CommentResponse:
        """
        Add a comment to a task.

        Both the task owner and shared-with users (VIEW or EDIT) can comment.
        """
        await self._verify_task_access(user, task_id)

        now = datetime.utcnow()
        doc = {
            "task_id": task_id,
            "user_id": str(user["_id"]),
            "user_name": user.get("name", "Unknown"),
            "content": data.content,
            "created_at": now,
            "updated_at": now,
        }

        result = await self.db["comments"].insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._doc_to_comment(doc)

    # ── List comments ────────────────────────────────────────────────────────

    async def list_comments(
        self, user: dict, task_id: str
    ) -> List[CommentResponse]:
        """
        Return all comments for a task, oldest first.

        Requires task access (owner or shared-with).
        """
        await self._verify_task_access(user, task_id)

        cursor = self.db["comments"].find(
            {"task_id": task_id}
        ).sort("created_at", 1)

        return [self._doc_to_comment(doc) async for doc in cursor]

    # ── Update comment ───────────────────────────────────────────────────────

    async def update_comment(
        self, user: dict, comment_id: str, data: CommentUpdate
    ) -> CommentResponse:
        """
        Edit a comment — only the comment author can update.

        Raises 404 if the comment does not exist.
        Raises 403 if the caller is not the author.
        """
        doc = await self.db["comments"].find_one(
            {"_id": self._object_id(comment_id)}
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment not found",
            )

        if doc["user_id"] != str(user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the comment author can edit this comment",
            )

        now = datetime.utcnow()
        result = await self.db["comments"].find_one_and_update(
            {"_id": self._object_id(comment_id)},
            {"$set": {"content": data.content, "updated_at": now}},
            return_document=True,
        )
        return self._doc_to_comment(result)

    # ── Delete comment ───────────────────────────────────────────────────────

    async def delete_comment(self, user: dict, comment_id: str) -> None:
        """
        Delete a comment — the comment author or the task owner can delete.

        Raises 404 if the comment does not exist.
        Raises 403 if the caller is neither the author nor the task owner.
        """
        doc = await self.db["comments"].find_one(
            {"_id": self._object_id(comment_id)}
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment not found",
            )

        # Check if caller is the comment author
        is_author = doc["user_id"] == str(user["_id"])

        # Check if caller is the task owner
        task = await self.db["tasks"].find_one(
            {"_id": self._object_id(doc["task_id"])}
        )
        is_task_owner = task and str(task["user_id"]) == str(user["_id"])

        if not is_author and not is_task_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the comment author or task owner can delete this comment",
            )

        await self.db["comments"].delete_one(
            {"_id": self._object_id(comment_id)}
        )
