"""
Sharing Router  —  /api/sharing

Thin HTTP layer: validates inputs, delegates all logic to SharingService,
returns the result. No database code lives here.

Endpoints:
  POST   /                      — share a task with another user
  GET    /shared-with-me        — list tasks shared with the current user
  GET    /task/{task_id}        — list all shares for a task (owner only)
  PUT    /{share_id}            — update permission on a share
  DELETE /{share_id}            — revoke a share
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Facade          — this router is a thin facade over SharingService.
#
# Dependency Inj. — `get_current_user` and `get_db` are resolved by FastAPI's
#                   Depends() mechanism at request time.
#
# Factory         — `_svc` constructs a SharingService for each request.
# ─────────────────────────────────────────────────────────────────────────────

from typing import List

from fastapi import APIRouter, Depends, status

from app.auth import get_current_user
from app.db import get_db
from app.sharing.models import (
    ShareCreate,
    ShareResponse,
    ShareUpdate,
    SharedTaskInfo,
)
from app.sharing.service import SharingService

router = APIRouter()


def _svc(db=Depends(get_db)) -> SharingService:
    """
    Factory pattern — constructs a SharingService for each request.

    FastAPI resolves `db` via Depends(get_db) (Dependency Injection) before
    calling this function.
    """
    return SharingService(db)


# ── Share a task ─────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=ShareResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Share a task",
)
async def share_task(
    data: ShareCreate,
    user=Depends(get_current_user),
    svc: SharingService = Depends(_svc),
):
    """Share a task with another user by email."""
    return await svc.share_task(user, data)


# ── Shared with me — must be registered BEFORE /{share_id} ──────────────────

@router.get(
    "/shared-with-me",
    response_model=List[SharedTaskInfo],
    summary="Tasks shared with me",
)
async def get_shared_with_me(
    user=Depends(get_current_user),
    svc: SharingService = Depends(_svc),
):
    """Return all tasks that have been shared with the current user."""
    return await svc.get_shared_with_me(user)


# ── List shares for a task ───────────────────────────────────────────────────

@router.get(
    "/task/{task_id}",
    response_model=List[ShareResponse],
    summary="List shares for a task",
)
async def list_shares_for_task(
    task_id: str,
    user=Depends(get_current_user),
    svc: SharingService = Depends(_svc),
):
    """Return all shares for a specific task — owner only."""
    return await svc.list_shares_for_task(user, task_id)


# ── Update permission ────────────────────────────────────────────────────────

@router.put(
    "/{share_id}",
    response_model=ShareResponse,
    summary="Update share permission",
)
async def update_share_permission(
    share_id: str,
    data: ShareUpdate,
    user=Depends(get_current_user),
    svc: SharingService = Depends(_svc),
):
    """Change the permission level on an existing share — owner only."""
    return await svc.update_share_permission(user, share_id, data)


# ── Revoke share ─────────────────────────────────────────────────────────────

@router.delete(
    "/{share_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a share",
)
async def revoke_share(
    share_id: str,
    user=Depends(get_current_user),
    svc: SharingService = Depends(_svc),
):
    """Remove a share — only the task owner can revoke."""
    await svc.revoke_share(user, share_id)
