"""
Tasks — Pydantic models.

All task-related schemas live here so the tasks package is self-contained.
Non-task models (Timer, Calendar, AI) remain in app.models.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────────────────

class Priority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class TaskStatus(str, Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"


class Recurrence(str, Enum):
    """How often a recurring task repeats after completion."""
    NONE = "NONE"
    DAILY = "DAILY"
    WEEKDAYS = "WEEKDAYS"   # Mon–Fri only
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"


# ── Subtask ───────────────────────────────────────────────────────────────────

class SubtaskCreate(BaseModel):
    """Schema for creating a subtask inline within a task."""
    title: str = Field(..., min_length=1)
    status: TaskStatus = TaskStatus.TODO


class SubtaskResponse(SubtaskCreate):
    """Response model for a subtask — includes server-assigned id."""
    id: str


# ── Task ──────────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    """
    Request model for creating a new task.

    Fields:
        title:              Required, 1–300 characters.
        description:        Optional free-text detail.
        priority:           Urgency level — LOW | MEDIUM | HIGH (default MEDIUM).
        deadline:           Optional ISO date string (YYYY-MM-DD).
        due_time:           Optional time string (HH:MM, 24-hour). Schedules the task
                            at a specific time on the deadline date.
        recurrence:         How often the task repeats — NONE | DAILY | WEEKDAYS |
                            WEEKLY | MONTHLY. When a recurring task is completed the
                            next occurrence is auto-created.
        estimated_minutes:  How long the task is expected to take. Used for overlap
                            detection and Pomodoro planning.
        status:             Kanban column — TODO | IN_PROGRESS | DONE (default TODO).
        categories:         Optional list of category tags.
    """
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    priority: Priority = Priority.MEDIUM
    deadline: Optional[str] = None
    due_time: Optional[str] = None           # "HH:MM" 24-hour
    recurrence: Recurrence = Recurrence.NONE
    estimated_minutes: Optional[int] = None  # 15, 25, 30, 60, 90, 120 …
    status: TaskStatus = TaskStatus.TODO
    categories: Optional[List[str]] = []
    # If set, the task belongs to a workspace and is visible/editable
    # to all workspace members.
    workspace_id: Optional[str] = None


class TaskUpdate(BaseModel):
    """Request model for partial task updates — all fields optional."""
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[Priority] = None
    deadline: Optional[str] = None
    due_time: Optional[str] = None
    recurrence: Optional[Recurrence] = None
    estimated_minutes: Optional[int] = None
    status: Optional[TaskStatus] = None
    subtasks: Optional[List[SubtaskCreate]] = None
    categories: Optional[List[str]] = None
    # workspace_id: pass "" (empty string) or null to move task to Personal;
    # pass a workspace id to move task to that workspace. Requires membership
    # of the target workspace.
    workspace_id: Optional[str] = None


class TaskResponse(BaseModel):
    """
    Full task response model returned from the API.

    Attributes:
        id:                 MongoDB document id as a string.
        user_id:            Owner's user id.
        due_time:           Scheduled time on the deadline date (HH:MM).
        recurrence:         Repeat cadence for the task.
        estimated_minutes:  Expected duration in minutes.
        is_complete:        True when status is DONE.
        created_at:         ISO timestamp of creation.
        updated_at:         ISO timestamp of last modification.
        categories:         List of category tags.
    """
    id: str
    user_id: str
    title: str
    description: Optional[str]
    priority: Priority
    deadline: Optional[str]
    due_time: Optional[str] = None
    recurrence: str = "NONE"
    estimated_minutes: Optional[int] = None
    status: TaskStatus
    subtasks: List[SubtaskResponse] = []
    is_complete: bool = False
    created_at: datetime
    updated_at: datetime
    categories: List[str] = []
    workspace_id: Optional[str] = None
    workspace_name: Optional[str] = None  # Denormalized for UI convenience.


# ── Complete-task response ────────────────────────────────────────────────────

class CompleteTaskResponse(BaseModel):
    """
    Response returned when a task is marked complete.

    Fields:
        completed:  The task that was just marked DONE.
        next_task:  The newly auto-created next occurrence task (only present when
                    the completed task had a non-NONE recurrence pattern).
    """
    completed: TaskResponse
    next_task: Optional[TaskResponse] = None


# ── Analytics ─────────────────────────────────────────────────────────────────

class TaskAnalytics(BaseModel):
    """Response model for the GET /analytics endpoint."""
    total: int
    by_status: dict  # {TODO: int, IN_PROGRESS: int, DONE: int}
    by_priority: dict  # {LOW: int, MEDIUM: int, HIGH: int}
    overdue: int
    completion_rate: float
    completed_today: int
    completed_this_week: int
