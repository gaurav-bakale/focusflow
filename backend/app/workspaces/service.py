"""
Workspaces — Service layer.

WorkspaceService encapsulates all database interactions for workspaces.
The router stays thin: it validates HTTP inputs, calls the service,
and returns the result — no DB logic leaks into the router.

This mirrors the pattern established by app.tasks.service.TaskService
and app.comments.service.CommentService.
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Service Layer   — all DB/business logic lives here; the router stays thin.
#
# Repository      — WorkspaceService wraps the MongoDB 'workspaces' and
#                   'workspace_members' collections.
#
# Dependency Inj. — The `db` handle is passed into __init__ by the FastAPI
#                   Depends() factory in the router.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime
from typing import List

from bson import ObjectId
from fastapi import HTTPException, status

from app.workspaces.models import (
    MemberAdd,
    MemberResponse,
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceRole,
    WorkspaceUpdate,
)


class WorkspaceService:
    """
    All workspace business logic and database operations.

    Design patterns applied
    -----------------------
    Service Layer  : Single authoritative source of workspace business logic.
    Repository     : Acts as a repository for 'workspaces' and
                     'workspace_members' collections.
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

    async def _get_members(self, workspace_id: str) -> List[MemberResponse]:
        """Fetch all members for a workspace, joining with the users collection."""
        members: List[MemberResponse] = []
        cursor = self.db["workspace_members"].find(
            {"workspace_id": workspace_id}
        ).sort("joined_at", 1)
        async for m in cursor:
            members.append(MemberResponse(
                user_id=m["user_id"],
                user_name=m.get("user_name", "Unknown"),
                email=m.get("email", ""),
                role=m["role"],
                joined_at=m.get("joined_at", datetime.utcnow()),
            ))
        return members

    def _doc_to_workspace(
        self, doc: dict, members: List[MemberResponse]
    ) -> WorkspaceResponse:
        """Convert a raw MongoDB document to a WorkspaceResponse model."""
        return WorkspaceResponse(
            id=str(doc["_id"]),
            name=doc["name"],
            description=doc.get("description"),
            owner_id=str(doc["owner_id"]),
            owner_name=doc.get("owner_name", "Unknown"),
            members=members,
            created_at=doc.get("created_at", datetime.utcnow()),
            updated_at=doc.get("updated_at", datetime.utcnow()),
        )

    async def _verify_workspace_owner(
        self, user: dict, workspace_id: str
    ) -> dict:
        """
        Verify the user owns the workspace. Returns the workspace doc.

        Raises 404 if workspace not found or user is not the owner.
        """
        doc = await self.db["workspaces"].find_one(
            {"_id": self._object_id(workspace_id)}
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found",
            )
        if str(doc["owner_id"]) != str(user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the workspace owner can perform this action",
            )
        return doc

    async def _verify_workspace_access(
        self, user: dict, workspace_id: str
    ) -> dict:
        """
        Verify the user can access the workspace (owner or member).

        Raises 404 if workspace not found or user has no access.
        """
        doc = await self.db["workspaces"].find_one(
            {"_id": self._object_id(workspace_id)}
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found",
            )

        # Owner always has access
        if str(doc["owner_id"]) == str(user["_id"]):
            return doc

        # Check membership
        member = await self.db["workspace_members"].find_one({
            "workspace_id": workspace_id,
            "user_id": str(user["_id"]),
        })
        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found",
            )
        return doc

    # ── Create workspace ─────────────────────────────────────────────────────

    async def create_workspace(
        self, user: dict, data: WorkspaceCreate
    ) -> WorkspaceResponse:
        """Create a new workspace. The caller becomes the owner."""
        now = datetime.utcnow()
        doc = {
            "name": data.name,
            "description": data.description,
            "owner_id": str(user["_id"]),
            "owner_name": user.get("name", "Unknown"),
            "created_at": now,
            "updated_at": now,
        }

        result = await self.db["workspaces"].insert_one(doc)
        doc["_id"] = result.inserted_id

        # Add the owner as a member with OWNER role
        owner_member = {
            "workspace_id": str(result.inserted_id),
            "user_id": str(user["_id"]),
            "user_name": user.get("name", "Unknown"),
            "email": user.get("email", ""),
            "role": WorkspaceRole.OWNER.value,
            "joined_at": now,
        }
        await self.db["workspace_members"].insert_one(owner_member)

        members = [MemberResponse(
            user_id=str(user["_id"]),
            user_name=user.get("name", "Unknown"),
            email=user.get("email", ""),
            role=WorkspaceRole.OWNER,
            joined_at=now,
        )]
        return self._doc_to_workspace(doc, members)

    # ── List workspaces ──────────────────────────────────────────────────────

    async def list_workspaces(
        self, user: dict
    ) -> List[WorkspaceResponse]:
        """Return all workspaces where the user is a member (including owned)."""
        # Find all workspace IDs where user is a member
        member_cursor = self.db["workspace_members"].find(
            {"user_id": str(user["_id"])}
        )
        workspace_ids = []
        async for m in member_cursor:
            workspace_ids.append(m["workspace_id"])

        if not workspace_ids:
            return []

        # Fetch workspace documents
        results: List[WorkspaceResponse] = []
        for ws_id in workspace_ids:
            doc = await self.db["workspaces"].find_one(
                {"_id": self._object_id(ws_id)}
            )
            if doc:
                members = await self._get_members(ws_id)
                results.append(self._doc_to_workspace(doc, members))

        return results

    # ── Get workspace ────────────────────────────────────────────────────────

    async def get_workspace(
        self, user: dict, workspace_id: str
    ) -> WorkspaceResponse:
        """Fetch a single workspace by ID. Requires membership or ownership."""
        doc = await self._verify_workspace_access(user, workspace_id)
        members = await self._get_members(workspace_id)
        return self._doc_to_workspace(doc, members)

    # ── Update workspace ─────────────────────────────────────────────────────

    async def update_workspace(
        self, user: dict, workspace_id: str, data: WorkspaceUpdate
    ) -> WorkspaceResponse:
        """
        Update workspace metadata. Only the owner can update.

        Raises 404 if workspace not found.
        Raises 403 if the caller is not the owner.
        """
        await self._verify_workspace_owner(user, workspace_id)

        updates = {}
        if data.name is not None:
            updates["name"] = data.name
        if data.description is not None:
            updates["description"] = data.description

        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update",
            )

        updates["updated_at"] = datetime.utcnow()

        doc = await self.db["workspaces"].find_one_and_update(
            {"_id": self._object_id(workspace_id)},
            {"$set": updates},
            return_document=True,
        )
        members = await self._get_members(workspace_id)
        return self._doc_to_workspace(doc, members)

    # ── Delete workspace ─────────────────────────────────────────────────────

    async def delete_workspace(
        self, user: dict, workspace_id: str
    ) -> None:
        """
        Delete a workspace and all its memberships. Owner only.

        Cascade behaviour — tasks in this workspace are **preserved**. Their
        ``workspace_id`` is cleared (set to None), which makes them personal
        tasks owned by whichever user created each one. This is the safest
        default: no user loses their own work when a workspace is deleted.

        Raises 404 if workspace not found.
        Raises 403 if the caller is not the owner.
        """
        await self._verify_workspace_owner(user, workspace_id)

        # Cascade — reset workspace_id on tasks before deleting the workspace.
        await self.db["tasks"].update_many(
            {"workspace_id": workspace_id},
            {"$set": {"workspace_id": None, "updated_at": datetime.utcnow()}},
        )

        await self.db["workspace_members"].delete_many(
            {"workspace_id": workspace_id}
        )
        await self.db["workspaces"].delete_one(
            {"_id": self._object_id(workspace_id)}
        )

    # ── List tasks in a workspace ────────────────────────────────────────────

    async def list_workspace_tasks(
        self, user: dict, workspace_id: str
    ) -> list:
        """
        Return every task scoped to this workspace, newest first.

        Requires the caller to be a workspace member (owner or member).
        Delegates to TaskService to keep task serialization consistent.
        """
        from app.tasks.service import TaskService

        await self._verify_workspace_access(user, workspace_id)
        task_svc = TaskService(self.db)
        return await task_svc.list_tasks(user, workspace_id=workspace_id)

    # ── Add member ───────────────────────────────────────────────────────────

    async def add_member(
        self, user: dict, workspace_id: str, data: MemberAdd
    ) -> MemberResponse:
        """
        Add a member to a workspace. Only the owner can add members.

        Raises 404 if workspace not found.
        Raises 403 if the caller is not the owner.
        Raises 400 if trying to add self or if user is already a member.
        Raises 404 if the target user is not registered.
        """
        await self._verify_workspace_owner(user, workspace_id)

        # Prevent adding self
        if data.email == user.get("email"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are already the workspace owner",
            )

        # Look up target user
        target = await self.db["users"].find_one({"email": data.email})
        if not target:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found — they must register first",
            )

        target_id = str(target["_id"])

        # Check for existing membership
        existing = await self.db["workspace_members"].find_one({
            "workspace_id": workspace_id,
            "user_id": target_id,
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this workspace",
            )

        now = datetime.utcnow()
        member_doc = {
            "workspace_id": workspace_id,
            "user_id": target_id,
            "user_name": target.get("name", "Unknown"),
            "email": data.email,
            "role": data.role.value,
            "joined_at": now,
        }
        await self.db["workspace_members"].insert_one(member_doc)

        # Welcome the new member with a notification. Best-effort — if the
        # notification subsystem errors, the invite itself must still succeed.
        try:
            from app.notifications.models import NotificationType
            from app.notifications.service import NotificationService
            workspace = await self.db["workspaces"].find_one(
                {"_id": self._object_id(workspace_id)}
            )
            ws_name = workspace.get("name", "a workspace") if workspace else "a workspace"
            inviter_name = user.get("name") or user.get("email") or "A teammate"
            await NotificationService(self.db).emit(
                user_id=target_id,
                ntype=NotificationType.WORKSPACE_INVITED,
                message=f"👥 {inviter_name} added you to {ws_name}",
            )
        except Exception:
            # Don't let notification failure break the invite flow.
            pass

        return MemberResponse(
            user_id=target_id,
            user_name=target.get("name", "Unknown"),
            email=data.email,
            role=data.role,
            joined_at=now,
        )

    # ── List members ─────────────────────────────────────────────────────────

    async def list_members(
        self, user: dict, workspace_id: str
    ) -> List[MemberResponse]:
        """List all members of a workspace. Requires membership or ownership."""
        await self._verify_workspace_access(user, workspace_id)
        return await self._get_members(workspace_id)

    # ── Remove member ────────────────────────────────────────────────────────

    async def remove_member(
        self, user: dict, workspace_id: str, member_user_id: str
    ) -> None:
        """
        Remove a member from a workspace. Owner can remove anyone;
        members can remove themselves (leave).

        Raises 404 if workspace not found.
        Raises 403 if caller lacks permission.
        Raises 400 if owner tries to remove themselves.
        """
        doc = await self.db["workspaces"].find_one(
            {"_id": self._object_id(workspace_id)}
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found",
            )

        is_owner = str(doc["owner_id"]) == str(user["_id"])
        is_self = str(user["_id"]) == member_user_id

        # Owner cannot remove themselves (must delete workspace instead)
        if is_owner and is_self:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Owner cannot leave — delete the workspace instead",
            )

        # Only owner or the member themselves can remove
        if not is_owner and not is_self:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the workspace owner can remove members",
            )

        result = await self.db["workspace_members"].delete_one({
            "workspace_id": workspace_id,
            "user_id": member_user_id,
        })
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found in this workspace",
            )
