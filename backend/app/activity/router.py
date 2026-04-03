"""
Activity Feed Router  —  /api/activity

Thin HTTP layer: validates inputs, delegates all logic to ActivityService,
returns the result. No database code lives here.

Endpoints:
  GET  /me                          — personal activity feed
  GET  /task/{task_id}              — activity feed for a task
  GET  /workspace/{workspace_id}    — activity feed for a workspace
  POST /log                         — log an activity event (internal use)
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Facade          — this router is a thin facade over ActivityService.
#
# Dependency Inj. — `get_current_user` and `get_db` are resolved by FastAPI's
#                   Depends() mechanism at request time.
#
# Factory         — `_svc` constructs an ActivityService for each request.
# ─────────────────────────────────────────────────────────────────────────────

from typing import List

from fastapi import APIRouter, Depends, Query, status

from app.auth import get_current_user
from app.db import get_db
from app.activity.models import ActivityCreate, ActivityResponse
from app.activity.service import ActivityService

router = APIRouter()


def _svc(db=Depends(get_db)) -> ActivityService:
    """
    Factory pattern — constructs an ActivityService for each request.

    FastAPI resolves `db` via Depends(get_db) (Dependency Injection) before
    calling this function.
    """
    return ActivityService(db)


# ── Personal activity feed ──────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=List[ActivityResponse],
    summary="My activity feed",
)
async def get_my_activity(
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    svc: ActivityService = Depends(_svc),
):
    """Return the caller's own activity history, newest first."""
    return await svc.get_my_activity(user, limit)


# ── Task activity feed ──────────────────────────────────────────────────────

@router.get(
    "/task/{task_id}",
    response_model=List[ActivityResponse],
    summary="Task activity feed",
)
async def get_task_activity(
    task_id: str,
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    svc: ActivityService = Depends(_svc),
):
    """Return activity entries for a task — requires task access."""
    return await svc.get_task_activity(user, task_id, limit)


# ── Workspace activity feed ─────────────────────────────────────────────────

@router.get(
    "/workspace/{workspace_id}",
    response_model=List[ActivityResponse],
    summary="Workspace activity feed",
)
async def get_workspace_activity(
    workspace_id: str,
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    svc: ActivityService = Depends(_svc),
):
    """Return activity entries for a workspace — requires membership."""
    return await svc.get_workspace_activity(user, workspace_id, limit)


# ── Log activity (internal) ─────────────────────────────────────────────────

@router.post(
    "/log",
    response_model=ActivityResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Log an activity event",
)
async def log_activity(
    data: ActivityCreate,
    user=Depends(get_current_user),
    svc: ActivityService = Depends(_svc),
):
    """Log an activity event — used by the frontend or other services."""
    return await svc.log_activity(data)
