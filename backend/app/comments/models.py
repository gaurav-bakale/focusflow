"""
Comments — Pydantic models.

All task-comment schemas live here so the comments package is self-contained.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Request Models ───────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    """
    Request model for adding a comment to a task.

    Fields:
        content: The comment text — required, 1–2000 characters.
    """
    content: str = Field(..., min_length=1, max_length=2000)


class CommentUpdate(BaseModel):
    """Request model for editing an existing comment."""
    content: str = Field(..., min_length=1, max_length=2000)


# ── Response Models ──────────────────────────────────────────────────────────

class CommentResponse(BaseModel):
    """
    Full comment response model returned from the API.

    Attributes:
        id:         MongoDB document id as a string.
        task_id:    The task this comment belongs to.
        user_id:    Author's user id.
        user_name:  Author's display name.
        content:    Comment text.
        created_at: ISO timestamp of creation.
        updated_at: ISO timestamp of last edit.
    """
    id: str
    task_id: str
    user_id: str
    user_name: str
    content: str
    created_at: datetime
    updated_at: datetime
