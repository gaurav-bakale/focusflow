"""
Workspaces — Pydantic models (DTOs / Schemas).

A workspace is a shared task list that groups tasks under a common context
(e.g. a project, sprint, or team). Members are invited by email and assigned
a role that controls what they can do inside the workspace.

Models
------
WorkspaceRole   — enum: OWNER, ADMIN, MEMBER
WorkspaceCreate — request body for creating a workspace
WorkspaceUpdate — request body for editing workspace metadata
WorkspaceResponse — full workspace representation returned to clients
MemberAdd       — request body for inviting a member
MemberResponse  — member info returned in workspace detail / member list
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# DTO / Schema   — Pydantic models act as Data Transfer Objects between the
#                  HTTP layer and the service layer.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class WorkspaceRole(str, Enum):
    """Role a member holds inside a workspace."""
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"


class WorkspaceCreate(BaseModel):
    """Request body — create a new workspace."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class WorkspaceUpdate(BaseModel):
    """Request body — update workspace metadata."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class MemberAdd(BaseModel):
    """Request body — invite a member to a workspace."""
    email: EmailStr
    role: WorkspaceRole = WorkspaceRole.MEMBER


class MemberResponse(BaseModel):
    """A single member entry returned to the client."""
    user_id: str
    user_name: str
    email: str
    role: WorkspaceRole
    joined_at: datetime


class WorkspaceResponse(BaseModel):
    """Full workspace representation returned to clients."""
    id: str
    name: str
    description: Optional[str] = None
    owner_id: str
    owner_name: str
    members: List[MemberResponse] = []
    created_at: datetime
    updated_at: datetime
