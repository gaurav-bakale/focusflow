"""
Notifications — Pydantic models (DTOs / Schemas).

A notification represents an alert for a user about an upcoming or
overdue task deadline.

Models
------
NotificationType — enum of trigger types (DEADLINE_24H, DEADLINE_1H, OVERDUE)
NotificationCreate — internal model used by the deadline scanner service
NotificationResponse — full notification entry returned to clients
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class NotificationType(str, Enum):
    """Types of deadline notifications."""
    DEADLINE_24H = "DEADLINE_24H"
    DEADLINE_1H = "DEADLINE_1H"
    OVERDUE = "OVERDUE"


NOTIFICATION_MESSAGES = {
    NotificationType.DEADLINE_24H: "Due in 24 hours",
    NotificationType.DEADLINE_1H: "Due in 1 hour",
    NotificationType.OVERDUE: "Overdue",
}


class NotificationCreate(BaseModel):
    """Internal model — used by the deadline scanner to create a notification."""
    user_id: str
    task_id: str
    task_title: str
    type: NotificationType
    message: str = ""


class NotificationResponse(BaseModel):
    """Full notification returned to clients."""
    id: str
    user_id: str
    task_id: str
    task_title: str
    type: NotificationType
    message: str
    read: bool = False
    created_at: datetime


class UnreadCountResponse(BaseModel):
    """Response with the count of unread notifications."""
    count: int
