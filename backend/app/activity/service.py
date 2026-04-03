"""
Activity Feed — Service layer.

ActivityService encapsulates all database interactions for the activity feed.
The router stays thin: it validates HTTP inputs, calls the service,
and returns the result — no DB logic leaks into the router.

Other services (tasks, comments, sharing, workspaces) call `log_activity`
to record events. The feed endpoints read these entries back for display.
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Service Layer   — all DB/business logic lives here; the router stays thin.
#
# Repository      — ActivityService wraps the MongoDB 'activities' collection.
#
# Observer-like   — other services push events here; the feed reads them back.
#
# Dependency Inj. — The `db` handle is passed into __init__ by the FastAPI
#                   Depends() factory in the router.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime
from typing import List

from bson import ObjectId
from fastapi import HTTPException, status

from app.activity.models import ActivityCreate, ActivityResponse


class ActivityService:
    """
    All activity-feed business logic and database operations.

    Design patterns applied
    -----------------------
    Service Layer  : Single authoritative source of activity-feed logic.
    Repository     : Acts as a repository for the 'activities' collection.
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

    def _doc_to_activity(self, doc: dict) -> ActivityResponse:
        """Convert a raw MongoDB document to an ActivityResponse model."""
        return ActivityResponse(
            id=str(doc["_id"]),
            action=doc["action"],
            actor_id=doc["actor_id"],
            actor_name=doc.get("actor_name", "Unknown"),
            target_type=doc["target_type"],
            target_id=doc["target_id"],
            target_title=doc.get("target_title"),
            detail=doc.get("detail"),
            task_id=doc.get("task_id"),
            workspace_id=doc.get("workspace_id"),
            created_at=doc.get("created_at", datetime.utcnow()),
        )

    # ── Log activity ─────────────────────────────────────────────────────────

    async def log_activity(self, data: ActivityCreate) -> ActivityResponse:
        """
        Record an activity event. Called internally by other services.

        This is the write side of the activity feed.
        """
        now = datetime.utcnow()
        doc = {
            "action": data.action.value,
            "actor_id": data.actor_id,
            "actor_name": data.actor_name,
            "target_type": data.target_type,
            "target_id": data.target_id,
            "target_title": data.target_title,
            "detail": data.detail,
            "task_id": data.task_id,
            "workspace_id": data.workspace_id,
            "created_at": now,
        }
        result = await self.db["activities"].insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._doc_to_activity(doc)

    # ── Get activity feed for a task ─────────────────────────────────────────

    async def get_task_activity(
        self, user: dict, task_id: str, limit: int = 50
    ) -> List[ActivityResponse]:
        """
        Return activity entries for a specific task, newest first.

        Requires task access (owner or shared-with).
        """
        # Verify access — task must exist and user must have access
        task = await self.db["tasks"].find_one(
            {"_id": self._object_id(task_id)}
        )
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        # Owner check
        if str(task["user_id"]) != str(user["_id"]):
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

        cursor = self.db["activities"].find(
            {"task_id": task_id}
        ).sort("created_at", -1).limit(limit)

        return [self._doc_to_activity(doc) async for doc in cursor]

    # ── Get activity feed for a workspace ────────────────────────────────────

    async def get_workspace_activity(
        self, user: dict, workspace_id: str, limit: int = 50
    ) -> List[ActivityResponse]:
        """
        Return activity entries for a workspace, newest first.

        Requires workspace membership.
        """
        workspace = await self.db["workspaces"].find_one(
            {"_id": self._object_id(workspace_id)}
        )
        if not workspace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found",
            )

        # Check ownership or membership
        if str(workspace["owner_id"]) != str(user["_id"]):
            member = await self.db["workspace_members"].find_one({
                "workspace_id": workspace_id,
                "user_id": str(user["_id"]),
            })
            if not member:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Workspace not found",
                )

        cursor = self.db["activities"].find(
            {"workspace_id": workspace_id}
        ).sort("created_at", -1).limit(limit)

        return [self._doc_to_activity(doc) async for doc in cursor]

    # ── Get personal activity feed ───────────────────────────────────────────

    async def get_my_activity(
        self, user: dict, limit: int = 50
    ) -> List[ActivityResponse]:
        """
        Return activity entries where the user is the actor, newest first.

        This gives a personal history of the user's own actions.
        """
        cursor = self.db["activities"].find(
            {"actor_id": str(user["_id"])}
        ).sort("created_at", -1).limit(limit)

        return [self._doc_to_activity(doc) async for doc in cursor]
