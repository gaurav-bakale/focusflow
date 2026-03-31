"""
Authentication Router  —  /api/auth

Endpoints follow REST resource semantics:
  POST   /register          — create account (201 Created)
  POST   /login             — obtain token   (200 OK)
  GET    /me                — read profile   (200 OK)
  PUT    /me                — update profile (200 OK)
  PATCH  /me/onboarding     — complete onboarding step (200 OK)
  PATCH  /me/password       — change password (200 OK)
  POST   /logout            — client-side token discard (200 OK)
"""

from fastapi import APIRouter, Depends, status

from app.authentication.models import (
    ApiKeyUpdate,
    MessageResponse,
    OnboardingPreferences,
    PasswordChange,
    ProfileUpdate,
    TokenResponse,
    UserLogin,
    UserProfile,
    UserRegister,
)
from app.authentication.service import AuthService
from app.auth import get_current_user
from app.db import get_db

router = APIRouter()


def _svc(db=Depends(get_db)) -> AuthService:
    return AuthService(db)


# ── Registration ──────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(data: UserRegister, svc: AuthService = Depends(_svc)):
    """
    Create a new FocusFlow account.

    - Password must be at least 8 characters.
    - Returns a JWT access token and the new user's profile.
    - ``onboarding_completed`` will be ``false`` — redirect the client to the
      onboarding screen until ``PATCH /me/onboarding`` is called.
    """
    return await svc.register(data)


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Obtain a JWT access token",
)
async def login(data: UserLogin, svc: AuthService = Depends(_svc)):
    """
    Authenticate with email + password and receive a bearer token.

    Use the returned ``access_token`` in the ``Authorization: Bearer <token>``
    header for all subsequent requests.
    """
    return await svc.login(data)


# ── Profile — /me ─────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserProfile,
    status_code=status.HTTP_200_OK,
    summary="Get the authenticated user's profile",
)
async def get_me(
    current_user=Depends(get_current_user),
    svc: AuthService = Depends(_svc),
):
    """Return the full profile of the currently authenticated user."""
    return await svc.get_profile(current_user)


@router.put(
    "/me",
    response_model=UserProfile,
    status_code=status.HTTP_200_OK,
    summary="Update profile fields",
)
async def update_me(
    data: ProfileUpdate,
    current_user=Depends(get_current_user),
    svc: AuthService = Depends(_svc),
):
    """Update mutable profile fields (currently: ``name``)."""
    return await svc.update_profile(current_user, data)


# ── Onboarding ────────────────────────────────────────────────────────────────

@router.patch(
    "/me/onboarding",
    response_model=UserProfile,
    status_code=status.HTTP_200_OK,
    summary="Complete the onboarding step and set preferences",
)
async def complete_onboarding(
    prefs: OnboardingPreferences,
    current_user=Depends(get_current_user),
    svc: AuthService = Depends(_svc),
):
    """
    Store user preferences and flip ``onboarding_completed`` to ``true``.

    Idempotent — calling it again updates preferences without error.
    """
    return await svc.complete_onboarding(current_user, prefs)


# ── Password ──────────────────────────────────────────────────────────────────

@router.patch(
    "/me/password",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Change the authenticated user's password",
)
async def change_password(
    data: PasswordChange,
    current_user=Depends(get_current_user),
    svc: AuthService = Depends(_svc),
):
    """
    Change password after verifying the current one.

    Returns ``400`` if ``current_password`` is wrong.
    """
    await svc.change_password(current_user, data)
    return MessageResponse(message="Password updated successfully.")


# ── Gemini API Key ────────────────────────────────────────────────────────

@router.patch(
    "/me/apikey",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Save the user's Gemini API key",
)
async def save_api_key(
    data: ApiKeyUpdate,
    current_user=Depends(get_current_user),
    svc: AuthService = Depends(_svc),
):
    """Store the user's Gemini API key in their profile."""
    await svc.save_api_key(current_user, data.gemini_api_key)
    return MessageResponse(message="API key saved successfully.")


@router.get(
    "/me/apikey",
    status_code=status.HTTP_200_OK,
    summary="Check if user has a Gemini API key configured",
)
async def check_api_key(
    current_user=Depends(get_current_user),
):
    """Return whether the user has a Gemini API key saved."""
    has_key = bool(current_user.get("gemini_api_key"))
    return {"has_key": has_key}


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post(
    "/logout",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Invalidate the current session (client-side)",
)
async def logout(_current_user=Depends(get_current_user)):
    """
    Signals the client to discard the token.

    Authentication is stateless (JWT), so no server-side state is cleared.
    The client is responsible for deleting the stored token.
    """
    return MessageResponse(message="Logged out successfully.")
