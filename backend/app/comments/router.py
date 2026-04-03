"""
Comments Router  —  /api/tasks/{task_id}/comments  +  /api/comments/{comment_id}

Thin HTTP layer: validates inputs, delegates all logic to CommentService,
returns the result. No database code lives here.

Endpoints:
  POST   /tasks/{task_id}/comments      — add a comment to a task
  GET    /tasks/{task_id}/comments      — list all comments for a task
  PUT    /comments/{comment_id}         — edit a comment (author only)
  DELETE /comments/{comment_id}         — delete a comment (author or task owner)
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Facade          — this router is a thin facade over CommentService.
#
# Dependency Inj. — `get_current_user` and `get_db` are resolved by FastAPI's
#                   Depends() mechanism at request time.
#
# Factory         — `_svc` constructs a CommentService for each request.
# ─────────────────────────────────────────────────────────────────────────────

from typing import List

from fastapi import APIRouter, Depends, status

from app.auth import get_current_user
from app.db import get_db
from app.comments.models import (
    CommentCreate,
    CommentResponse,
    CommentUpdate,
)
from app.comments.service import CommentService

router = APIRouter()


def _svc(db=Depends(get_db)) -> CommentService:
    """
    Factory pattern — constructs a CommentService for each request.

    FastAPI resolves `db` via Depends(get_db) (Dependency Injection) before
    calling this function.
    """
    return CommentService(db)


# ── Add comment ──────────────────────────────────────────────────────────────

@router.post(
    "/tasks/{task_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment",
)
async def add_comment(
    task_id: str,
    data: CommentCreate,
    user=Depends(get_current_user),
    svc: CommentService = Depends(_svc),
):
    """Add a comment to a task — requires task access (owner or shared-with)."""
    return await svc.add_comment(user, task_id, data)


# ── List comments ────────────────────────────────────────────────────────────

@router.get(
    "/tasks/{task_id}/comments",
    response_model=List[CommentResponse],
    summary="List comments",
)
async def list_comments(
    task_id: str,
    user=Depends(get_current_user),
    svc: CommentService = Depends(_svc),
):
    """Return all comments for a task, oldest first."""
    return await svc.list_comments(user, task_id)


# ── Update comment ───────────────────────────────────────────────────────────

@router.put(
    "/comments/{comment_id}",
    response_model=CommentResponse,
    summary="Edit a comment",
)
async def update_comment(
    comment_id: str,
    data: CommentUpdate,
    user=Depends(get_current_user),
    svc: CommentService = Depends(_svc),
):
    """Edit a comment — only the comment author can update."""
    return await svc.update_comment(user, comment_id, data)


# ── Delete comment ───────────────────────────────────────────────────────────

@router.delete(
    "/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a comment",
)
async def delete_comment(
    comment_id: str,
    user=Depends(get_current_user),
    svc: CommentService = Depends(_svc),
):
    """Delete a comment — comment author or task owner can delete."""
    await svc.delete_comment(user, comment_id)
