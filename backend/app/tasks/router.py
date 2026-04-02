"""
Tasks Router  —  /api/tasks

Thin HTTP layer: validates inputs, delegates all logic to TaskService,
returns the result. No database code lives here.

Endpoints:
  GET    /              — list all tasks for the user
  POST   /              — create a task
  GET    /analytics     — aggregate analytics (registered BEFORE /{task_id})
  GET    /{task_id}     — fetch a single task
  PUT    /{task_id}     — partial update
  PATCH  /{task_id}/complete — mark as DONE
  DELETE /{task_id}     — remove permanently
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Facade          — this router is a thin facade over TaskService.  Each
#                   endpoint handler contains at most one line of logic: a
#                   single call to the appropriate service method.  HTTP
#                   concerns (status codes, request parsing) are handled here;
#                   business logic is not.
#
# Dependency Inj. — `get_current_user` and `get_db` are resolved by FastAPI's
#                   Depends() mechanism at request time, keeping handlers free
#                   of setup boilerplate and making them easy to test by
#                   overriding app.dependency_overrides in the test suite.
#
# Factory         — `_svc` is a factory/provider function: given a DB handle
#                   (itself injected), it constructs and returns a fresh
#                   TaskService instance for each request.  This keeps object
#                   creation centralised and makes the service swappable.
# ─────────────────────────────────────────────────────────────────────────────

from typing import List

from fastapi import APIRouter, Depends, status

from app.auth import get_current_user
from app.db import get_db
from app.models import CompleteTaskResponse
from app.tasks.models import TaskCreate, TaskResponse, TaskUpdate
from app.tasks.service import TaskService

router = APIRouter()


def _svc(db=Depends(get_db)) -> TaskService:
    """
    Factory pattern — constructs a TaskService for each request.

    FastAPI resolves `db` via Depends(get_db) (Dependency Injection) before
    calling this function.  The resulting TaskService instance is then injected
    into the route handler, again via Depends(_svc).
    """
    return TaskService(db)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[TaskResponse], summary="List all tasks")
async def list_tasks(
    user=Depends(get_current_user),
    svc: TaskService = Depends(_svc),
):
    """Return all tasks for the authenticated user, sorted newest first."""
    return await svc.list_tasks(user)


# ── Create ────────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a task",
)
async def create_task(
    data: TaskCreate,
    user=Depends(get_current_user),
    svc: TaskService = Depends(_svc),
):
    """Create a new task for the authenticated user."""
    return await svc.create_task(user, data)


# ── Analytics — must be registered BEFORE /{task_id} ─────────────────────────

@router.get("/analytics", summary="Aggregate task analytics")
async def get_analytics(
    user=Depends(get_current_user),
    svc: TaskService = Depends(_svc),
):
    """
    Return aggregate statistics for the current user's tasks.

    Counts by status, by priority, overdue tasks, completion rate,
    and tasks completed today / this week.
    """
    return await svc.get_analytics(user)


# ── Read ──────────────────────────────────────────────────────────────────────

@router.get("/{task_id}", response_model=TaskResponse, summary="Get a task")
async def get_task(
    task_id: str,
    user=Depends(get_current_user),
    svc: TaskService = Depends(_svc),
):
    """Fetch a single task by id — 404 if not found."""
    return await svc.get_task(user, task_id)


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/{task_id}", response_model=TaskResponse, summary="Update a task")
async def update_task(
    task_id: str,
    data: TaskUpdate,
    user=Depends(get_current_user),
    svc: TaskService = Depends(_svc),
):
    """
    Partially update a task — only supplied (non-null) fields are changed.

    Returns 400 if no fields are provided, 404 if task not found.
    """
    return await svc.update_task(user, task_id, data)


# ── Complete ──────────────────────────────────────────────────────────────────

@router.patch(
    "/{task_id}/complete",
    response_model=CompleteTaskResponse,
    summary="Mark a task as complete",
)
async def complete_task(
    task_id: str,
    user=Depends(get_current_user),
    svc: TaskService = Depends(_svc),
):
    """
    Set task status to DONE.

    Returns { completed: TaskResponse, next_task: TaskResponse | null }.
    next_task is populated when the completed task has a recurrence pattern —
    the frontend uses it to auto-schedule a calendar block for the next occurrence.
    """
    return await svc.complete_task(user, task_id)


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a task",
)
async def delete_task(
    task_id: str,
    user=Depends(get_current_user),
    svc: TaskService = Depends(_svc),
):
    """Permanently delete a task — 404 if not found."""
    await svc.delete_task(user, task_id)
