"""
Notifications — Pydantic models (DTOs / Schemas).

A notification represents an alert for a user about a meaningful event —
approaching deadlines, teammates' activity in a workspace, productivity
milestones, and so on.

Models
------
NotificationType     — enum of all notification triggers
NOTIFICATION_MESSAGES — default human-readable label for each type
NotificationCreate   — internal model used by the service to emit a notification
NotificationResponse — full notification entry returned to clients
UnreadCountResponse  — GET /notifications/count response shape
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class NotificationType(str, Enum):
    """All notification trigger types.

    The string value is persisted to Mongo as-is so a single DB can outlive
    multiple code refactors. Add new members at the bottom to keep the
    wire format stable.
    """

    # ── Deadline-driven (emitted by the background scanner) ───────────────
    DEADLINE_24H = "DEADLINE_24H"
    DEADLINE_1H = "DEADLINE_1H"
    OVERDUE = "OVERDUE"

    # ── Task events (own actions) ─────────────────────────────────────────
    TASK_COMPLETED = "TASK_COMPLETED"
    ALL_SUBTASKS_DONE = "ALL_SUBTASKS_DONE"

    # ── Productivity / motivation ─────────────────────────────────────────
    POMODORO_COMPLETE = "POMODORO_COMPLETE"
    STREAK_MILESTONE = "STREAK_MILESTONE"
    FROG_IDENTIFIED = "FROG_IDENTIFIED"

    # ── Collaboration (emitted to other members, not the actor) ───────────
    WORKSPACE_INVITED = "WORKSPACE_INVITED"
    WORKSPACE_TASK_ADDED = "WORKSPACE_TASK_ADDED"
    WORKSPACE_TASK_COMPLETED = "WORKSPACE_TASK_COMPLETED"


NOTIFICATION_MESSAGES = {
    NotificationType.DEADLINE_24H: "Due in 24 hours",
    NotificationType.DEADLINE_1H: "Due in 1 hour",
    NotificationType.OVERDUE: "Overdue",
    NotificationType.TASK_COMPLETED: "Task completed",
    NotificationType.ALL_SUBTASKS_DONE: "All subtasks done — ready to finish?",
    NotificationType.POMODORO_COMPLETE: "Pomodoro complete — take a break",
    NotificationType.STREAK_MILESTONE: "Streak milestone",
    NotificationType.FROG_IDENTIFIED: "Today's frog — start with this",
    NotificationType.WORKSPACE_INVITED: "You were added to a workspace",
    NotificationType.WORKSPACE_TASK_ADDED: "New task in your workspace",
    NotificationType.WORKSPACE_TASK_COMPLETED: "Task completed in your workspace",
}


class NotificationCreate(BaseModel):
    """Internal model — used by emitters to create a notification.

    ``task_id`` / ``task_title`` are optional now so that notifications not
    tied to a specific task (e.g. streak milestones, workspace invites) can
    still be emitted through the same pipeline.
    """

    user_id: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    type: NotificationType
    message: str = ""


class NotificationResponse(BaseModel):
    """Full notification returned to clients."""
    id: str
    user_id: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    type: NotificationType
    message: str
    read: bool = False
    created_at: datetime


class UnreadCountResponse(BaseModel):
    """Response with the count of unread notifications."""
    count: int
