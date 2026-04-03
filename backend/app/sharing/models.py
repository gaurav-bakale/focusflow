"""
Sharing — Pydantic models.

All task-sharing schemas live here so the sharing package is self-contained.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ── Enums ─────────────────────────────────────────────────────────────────────

class Permission(str, Enum):
    """Access level granted to a shared-with user."""
    VIEW = "VIEW"
    EDIT = "EDIT"


class ShareStatus(str, Enum):
    """Whether the share invitation has been accepted."""
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"


# ── Request Models ───────────────────────────────────────────────────────────

class ShareCreate(BaseModel):
    """
    Request model for sharing a task with another user.

    Fields:
        task_id:    The task to share (must be owned by the requesting user).
        email:      Email of the user to share with.
        permission: Access level — VIEW (read-only) or EDIT (read + write).
    """
    task_id: str = Field(..., min_length=1)
    email: EmailStr
    permission: Permission = Permission.VIEW


class ShareUpdate(BaseModel):
    """Request model for changing the permission on an existing share."""
    permission: Permission


# ── Response Models ──────────────────────────────────────────────────────────

class ShareResponse(BaseModel):
    """
    Full share response model returned from the API.

    Attributes:
        id:               MongoDB document id as a string.
        task_id:          The shared task's id.
        owner_id:         User id of the task owner who created the share.
        shared_with_email: Email address the task was shared with.
        shared_with_id:   User id of the recipient (None if not yet registered).
        shared_with_name: Display name of the recipient.
        permission:       VIEW or EDIT.
        status:           PENDING or ACCEPTED.
        created_at:       ISO timestamp of when the share was created.
    """
    id: str
    task_id: str
    owner_id: str
    shared_with_email: str
    shared_with_id: Optional[str] = None
    shared_with_name: Optional[str] = None
    permission: Permission
    status: ShareStatus
    created_at: datetime


class SharedTaskInfo(BaseModel):
    """
    A task that has been shared with the current user.

    Extends the basic task data with sharing metadata so the frontend
    can display who shared it and what permission the user has.
    """
    id: str
    task_id: str
    task_title: str
    task_description: Optional[str] = None
    task_priority: str
    task_status: str
    task_deadline: Optional[str] = None
    owner_id: str
    owner_name: Optional[str] = None
    owner_email: str
    permission: Permission
    shared_at: datetime
