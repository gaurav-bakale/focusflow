"""
Pydantic Data Models for FocusFlow

Defines all request/response schemas and internal database models
used across the application. Pydantic enforces strict validation
at every API boundary.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from enum import Enum


# ── Enums ─────────────────────────────────────────────────────────────────────

class Priority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class TaskStatus(str, Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"


class TimerPhase(str, Enum):
    FOCUS = "FOCUS"
    SHORT_BREAK = "SHORT_BREAK"
    LONG_BREAK = "LONG_BREAK"


# ── Auth Models ───────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    """Request model for user registration."""
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)


class UserLogin(BaseModel):
    """Request model for user login."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """Response model returned after auth — never includes password hash."""
    id: str
    name: str
    email: str


class TokenResponse(BaseModel):
    """JWT token response returned on successful login or registration."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ── Task Models ───────────────────────────────────────────────────────────────

class SubtaskCreate(BaseModel):
    """Schema for creating a subtask inline within a task."""
    title: str = Field(..., min_length=1)
    status: TaskStatus = TaskStatus.TODO


class SubtaskResponse(SubtaskCreate):
    """Response model for a subtask, includes server-assigned id."""
    id: str


class TaskCreate(BaseModel):
    """
    Request model for creating a new task.

    Args:
        title: The task title (required).
        description: Optional detail text.
        priority: Task urgency — LOW, MEDIUM, or HIGH.
        deadline: Optional ISO date string for due date.
        status: Current Kanban column state.
        categories: Optional list of category tags for organization.
    """
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    priority: Priority = Priority.MEDIUM
    deadline: Optional[str] = None
    status: TaskStatus = TaskStatus.TODO
    categories: Optional[List[str]] = []


class TaskUpdate(BaseModel):
    """Request model for partial task updates — all fields optional."""
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[Priority] = None
    deadline: Optional[str] = None
    status: Optional[TaskStatus] = None
    subtasks: Optional[List[SubtaskCreate]] = None
    categories: Optional[List[str]] = None


class TaskResponse(BaseModel):
    """
    Full task response model returned from the API.

    Attributes:
        id: MongoDB document id as string.
        user_id: Owner's user id.
        subtasks: List of AI-generated or manually added subtasks.
        is_complete: True when status is DONE.
        created_at: ISO timestamp of task creation.
        updated_at: ISO timestamp of last modification.
        categories: List of category tags for organization.
    """
    id: str
    user_id: str
    title: str
    description: Optional[str]
    priority: Priority
    deadline: Optional[str]
    status: TaskStatus
    subtasks: List[SubtaskResponse] = []
    is_complete: bool = False
    created_at: datetime
    updated_at: datetime
    categories: List[str] = []


# ── Timer Models ──────────────────────────────────────────────────────────────

class PomodoroSessionCreate(BaseModel):
    """Request model for logging a completed Pomodoro work session."""
    task_id: Optional[str] = None
    phase: TimerPhase = TimerPhase.FOCUS
    duration_minutes: int = Field(25, ge=1, le=60)


class PomodoroSessionResponse(PomodoroSessionCreate):
    """Response model for a logged Pomodoro session."""
    id: str
    user_id: str
    completed_at: datetime


# ── Calendar Models ───────────────────────────────────────────────────────────

class TimeBlockCreate(BaseModel):
    """
    Request model for creating a calendar time block.

    Args:
        title: Label shown on the calendar block.
        start_time: ISO datetime string for block start.
        end_time: ISO datetime string for block end.
        task_id: Optional linked task ID.
    """
    title: str = Field(..., min_length=1)
    start_time: str
    end_time: str
    task_id: Optional[str] = None


class TimeBlockResponse(TimeBlockCreate):
    """Response model for a calendar time block."""
    id: str
    user_id: str


# ── AI Models ─────────────────────────────────────────────────────────────────

class AIBreakdownRequest(BaseModel):
    """Request model for AI task breakdown endpoint."""
    task_id: str
    task_title: str
    task_description: Optional[str] = None


class AIBreakdownResponse(BaseModel):
    """Response model containing AI-generated subtasks."""
    task_id: str
    subtasks: List[str]


class AIPrioritizeRequest(BaseModel):
    """Request model for AI task prioritization endpoint."""
    tasks: List[dict]


class AIPrioritizeResponse(BaseModel):
    """Response model with tasks sorted by AI-assigned priority score."""
    prioritized_tasks: List[dict]
