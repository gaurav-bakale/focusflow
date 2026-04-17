"""
Workspaces Router  —  /api/workspaces

Thin HTTP layer: validates inputs, delegates all logic to WorkspaceService,
returns the result. No database code lives here.

Endpoints:
  POST   /                             — create a new workspace
  GET    /                             — list user's workspaces
  GET    /{workspace_id}               — get workspace details
  PUT    /{workspace_id}               — update workspace metadata (owner only)
  DELETE /{workspace_id}               — delete workspace (owner only)
  POST   /{workspace_id}/members       — add a member (owner only)
  GET    /{workspace_id}/members       — list workspace members
  DELETE /{workspace_id}/members/{member_user_id} — remove a member
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Facade          — this router is a thin facade over WorkspaceService.
#
# Dependency Inj. — `get_current_user` and `get_db` are resolved by FastAPI's
#                   Depends() mechanism at request time.
#
# Factory         — `_svc` constructs a WorkspaceService for each request.
# ─────────────────────────────────────────────────────────────────────────────

from typing import List

from fastapi import APIRouter, Depends, status

from app.auth import get_current_user
from app.db import get_db
from app.tasks.models import TaskResponse
from app.workspaces.models import (
    MemberAdd,
    MemberResponse,
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from app.workspaces.service import WorkspaceService

router = APIRouter()


def _svc(db=Depends(get_db)) -> WorkspaceService:
    """
    Factory pattern — constructs a WorkspaceService for each request.

    FastAPI resolves `db` via Depends(get_db) (Dependency Injection) before
    calling this function.
    """
    return WorkspaceService(db)


# ── Create workspace ────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a workspace",
)
async def create_workspace(
    data: WorkspaceCreate,
    user=Depends(get_current_user),
    svc: WorkspaceService = Depends(_svc),
):
    """Create a new workspace — the caller becomes the owner."""
    return await svc.create_workspace(user, data)


# ── List workspaces ─────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=List[WorkspaceResponse],
    summary="List workspaces",
)
async def list_workspaces(
    user=Depends(get_current_user),
    svc: WorkspaceService = Depends(_svc),
):
    """Return all workspaces where the caller is a member or owner."""
    return await svc.list_workspaces(user)


# ── Get workspace ───────────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}",
    response_model=WorkspaceResponse,
    summary="Get workspace details",
)
async def get_workspace(
    workspace_id: str,
    user=Depends(get_current_user),
    svc: WorkspaceService = Depends(_svc),
):
    """Fetch a single workspace — requires membership or ownership."""
    return await svc.get_workspace(user, workspace_id)


# ── Update workspace ────────────────────────────────────────────────────────

@router.put(
    "/{workspace_id}",
    response_model=WorkspaceResponse,
    summary="Update workspace",
)
async def update_workspace(
    workspace_id: str,
    data: WorkspaceUpdate,
    user=Depends(get_current_user),
    svc: WorkspaceService = Depends(_svc),
):
    """Update workspace metadata — owner only."""
    return await svc.update_workspace(user, workspace_id, data)


# ── Delete workspace ────────────────────────────────────────────────────────

@router.delete(
    "/{workspace_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete workspace",
)
async def delete_workspace(
    workspace_id: str,
    user=Depends(get_current_user),
    svc: WorkspaceService = Depends(_svc),
):
    """Delete a workspace and all memberships — owner only."""
    await svc.delete_workspace(user, workspace_id)


# ── Add member ──────────────────────────────────────────────────────────────

@router.post(
    "/{workspace_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a member",
)
async def add_member(
    workspace_id: str,
    data: MemberAdd,
    user=Depends(get_current_user),
    svc: WorkspaceService = Depends(_svc),
):
    """Invite a user to the workspace by email — owner only."""
    return await svc.add_member(user, workspace_id, data)


# ── List members ────────────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/members",
    response_model=List[MemberResponse],
    summary="List members",
)
async def list_members(
    workspace_id: str,
    user=Depends(get_current_user),
    svc: WorkspaceService = Depends(_svc),
):
    """List all members of a workspace — requires membership or ownership."""
    return await svc.list_members(user, workspace_id)


# ── Remove member ───────────────────────────────────────────────────────────

@router.delete(
    "/{workspace_id}/members/{member_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member",
)
async def remove_member(
    workspace_id: str,
    member_user_id: str,
    user=Depends(get_current_user),
    svc: WorkspaceService = Depends(_svc),
):
    """Remove a member — owner can remove anyone, members can leave."""
    await svc.remove_member(user, workspace_id, member_user_id)


# ── List workspace tasks ────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/tasks",
    response_model=List[TaskResponse],
    summary="List tasks in a workspace",
)
async def list_workspace_tasks(
    workspace_id: str,
    user=Depends(get_current_user),
    svc: WorkspaceService = Depends(_svc),
):
    """
    List every task assigned to this workspace.

    Requires the caller to be a member (or owner) of the workspace.
    All workspace members can see and edit every task in the workspace.
    """
    return await svc.list_workspace_tasks(user, workspace_id)
