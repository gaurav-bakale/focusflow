"""
Activity Feed — Pydantic models (DTOs / Schemas).

An activity entry represents a single event in the collaboration timeline,
e.g. a task was shared, a comment was added, or a workspace member joined.

Models
------
ActivityAction  — enum of possible actions (TASK_SHARED, COMMENT_ADDED, …)
ActivityCreate  — internal model used by services to log an activity
ActivityResponse — full activity entry returned to clients
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# DTO / Schema   — Pydantic models act as Data Transfer Objects between the
#                  HTTP layer and the service layer.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ActivityAction(str, Enum):
    """Possible activity actions tracked in the feed."""
    TASK_CREATED = "TASK_CREATED"
    TASK_UPDATED = "TASK_UPDATED"
    TASK_COMPLETED = "TASK_COMPLETED"
    TASK_SHARED = "TASK_SHARED"
    COMMENT_ADDED = "COMMENT_ADDED"
    COMMENT_UPDATED = "COMMENT_UPDATED"
    COMMENT_DELETED = "COMMENT_DELETED"
    WORKSPACE_CREATED = "WORKSPACE_CREATED"
    MEMBER_ADDED = "MEMBER_ADDED"
    MEMBER_REMOVED = "MEMBER_REMOVED"


class ActivityCreate(BaseModel):
    """Internal model — used by other services to log an activity event."""
    action: ActivityAction
    actor_id: str
    actor_name: str
    target_type: str = Field(..., description="e.g. 'task', 'comment', 'workspace'")
    target_id: str
    target_title: Optional[str] = None
    detail: Optional[str] = Field(None, max_length=500)
    task_id: Optional[str] = None
    workspace_id: Optional[str] = None


class ActivityResponse(BaseModel):
    """Full activity entry returned to clients."""
    id: str
    action: ActivityAction
    actor_id: str
    actor_name: str
    target_type: str
    target_id: str
    target_title: Optional[str] = None
    detail: Optional[str] = None
    task_id: Optional[str] = None
    workspace_id: Optional[str] = None
    created_at: datetime
