"""
Authentication Pydantic Models

Defines all request / response shapes for the authentication and
onboarding flow.  These models are kept separate from the global
app/models.py so the authentication package is self-contained.
"""

import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


# ── Request models ────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator('password')
    @classmethod
    def password_strength(cls, v: str) -> str:
        errors = []
        if len(v) < 8:
            errors.append('at least 8 characters')
        if not re.search(r'[A-Z]', v):
            errors.append('one uppercase letter')
        if not re.search(r'[0-9]', v):
            errors.append('one number')
        if not re.search(r'[^A-Za-z0-9]', v):
            errors.append('one special character (!@#$%^&* etc.)')
        if errors:
            raise ValueError('Password must contain: ' + ', '.join(errors))
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class OnboardingPreferences(BaseModel):
    """Sent by the client to complete the onboarding step."""
    pomodoro_duration: int = Field(25, ge=5, le=60)
    short_break: int = Field(5, ge=1, le=30)
    long_break: int = Field(15, ge=5, le=60)
    timezone: str = "UTC"
    theme: str = Field("light", pattern="^(light|dark)$")


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)


class ApiKeyUpdate(BaseModel):
    """Request model for saving a user's Gemini API key."""
    gemini_api_key: str = Field(..., min_length=1)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


# ── Response models ───────────────────────────────────────────────────────────

class UserProfile(BaseModel):
    """Full user profile returned from /me — never exposes password_hash."""
    id: str
    name: str
    email: str
    onboarding_completed: bool
    preferences: dict
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


class MessageResponse(BaseModel):
    message: str
