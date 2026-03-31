"""
Authentication Utilities

JWT creation / verification and bcrypt password hashing.
Single source of truth — app/auth.py re-exports from here for
backward compatibility with existing routers.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt
from passlib.context import CryptContext

SECRET_KEY: str = os.getenv("JWT_SECRET", "fallback-dev-secret")
ALGORITHM: str = "HS256"
EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Return a bcrypt hash of *plain*."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches the stored *hashed* password."""
    return _pwd_context.verify(plain, hashed)


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Encode *data* as a signed JWT.

    Args:
        data: Payload dict; must include ``"sub"`` (user_id as str).
        expires_delta: Override the default expiry window.

    Returns:
        Compact JWT string.
    """
    payload = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=EXPIRE_MINUTES)
    )
    payload["exp"] = expire
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and verify a JWT.

    Returns:
        The decoded payload dict.

    Raises:
        JWTError: If the token is expired, tampered, or otherwise invalid.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
