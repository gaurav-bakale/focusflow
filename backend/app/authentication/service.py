"""
AuthService

All business logic for the authentication / onboarding flow lives here.
Handlers in router.py are thin — they validate input, call a service
method, and return the shaped response.
"""

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.authentication.models import (
    OnboardingPreferences,
    PasswordChange,
    ProfileUpdate,
    TokenResponse,
    UserLogin,
    UserProfile,
    UserRegister,
)
from app.authentication.utils import (
    create_access_token,
    hash_password,
    verify_password,
)

_DEFAULT_PREFERENCES = {
    "pomodoro_duration": 25,
    "short_break": 5,
    "long_break": 15,
    "timezone": "UTC",
    "theme": "light",
}


def _doc_to_profile(doc: dict) -> UserProfile:
    return UserProfile(
        id=str(doc["_id"]),
        name=doc["name"],
        email=doc["email"],
        onboarding_completed=doc.get("onboarding_completed", False),
        preferences=doc.get("preferences", _DEFAULT_PREFERENCES.copy()),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
    )


class AuthService:
    """Encapsulates all user-account operations against the *users* collection."""

    def __init__(self, db):
        self._db = db

    # ── Registration ──────────────────────────────────────────────────────────

    async def register(self, data: UserRegister) -> TokenResponse:
        """
        Create a new user account.

        Raises:
            409 Conflict — if the email is already registered.
        """
        if await self._db["users"].find_one({"email": data.email}):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered.",
            )

        doc = {
            "name": data.name,
            "email": data.email,
            "password_hash": hash_password(data.password),
            "onboarding_completed": False,
            "preferences": _DEFAULT_PREFERENCES.copy(),
            "created_at": datetime.now(timezone.utc),
        }
        result = await self._db["users"].insert_one(doc)
        doc["_id"] = result.inserted_id

        token = create_access_token({"sub": str(result.inserted_id)})
        return TokenResponse(access_token=token, user=_doc_to_profile(doc))

    # ── Login ─────────────────────────────────────────────────────────────────

    async def login(self, data: UserLogin) -> TokenResponse:
        """
        Authenticate a user by email + password.

        Raises:
            401 Unauthorized — on any credential mismatch (generic message to
            avoid user-enumeration).
        """
        user = await self._db["users"].find_one({"email": data.email})
        if not user or not verify_password(data.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = create_access_token({"sub": str(user["_id"])})
        return TokenResponse(access_token=token, user=_doc_to_profile(user))

    # ── Profile ───────────────────────────────────────────────────────────────

    async def get_profile(self, user_doc: dict) -> UserProfile:
        return _doc_to_profile(user_doc)

    async def update_profile(
        self, user_doc: dict, data: ProfileUpdate
    ) -> UserProfile:
        """
        Partially update the user's profile (name only for now).

        Raises:
            400 Bad Request — if no fields are provided.
        """
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update.",
            )

        updated = await self._db["users"].find_one_and_update(
            {"_id": user_doc["_id"]},
            {"$set": updates},
            return_document=True,
        )
        return _doc_to_profile(updated)

    # ── Onboarding ────────────────────────────────────────────────────────────

    async def complete_onboarding(
        self, user_doc: dict, prefs: OnboardingPreferences
    ) -> UserProfile:
        """
        Mark the user's onboarding as complete and store their preferences.
        Idempotent — calling it again updates preferences without error.
        """
        updated = await self._db["users"].find_one_and_update(
            {"_id": user_doc["_id"]},
            {
                "$set": {
                    "onboarding_completed": True,
                    "preferences": prefs.model_dump(),
                }
            },
            return_document=True,
        )
        return _doc_to_profile(updated)

    # ── Password ──────────────────────────────────────────────────────────────

    async def change_password(
        self, user_doc: dict, data: PasswordChange
    ) -> None:
        """
        Change the user's password after verifying the current one.

        Raises:
            400 Bad Request — if current_password is wrong.
        """
        if not verify_password(data.current_password, user_doc["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )

        await self._db["users"].update_one(
            {"_id": user_doc["_id"]},
            {"$set": {"password_hash": hash_password(data.new_password)}},
        )

    # ── API Key ───────────────────────────────────────────────────────────────

    async def save_api_key(self, user_doc: dict, api_key: str) -> None:
        """Store the user's Gemini API key."""
        await self._db["users"].update_one(
            {"_id": user_doc["_id"]},
            {"$set": {"gemini_api_key": api_key}},
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def get_by_id(self, user_id: str) -> Optional[dict]:
        """Fetch a raw user document by ObjectId string. Returns None if not found."""
        try:
            oid = ObjectId(user_id)
        except Exception:
            return None
        return await self._db["users"].find_one({"_id": oid})
