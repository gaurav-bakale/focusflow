"""
Authentication Shim  (backward-compatibility layer)

All JWT / password logic now lives in app.authentication.utils.
This module re-exports everything so existing routers
(tasks, timer, calendar, ai) keep working without changes.
"""

from app.authentication.utils import (   # noqa: F401  re-exports
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    SECRET_KEY,
    ALGORITHM,
    EXPIRE_MINUTES,
)

# ── get_current_user dependency ───────────────────────────────────────────────
# Kept here (not in the authentication package) to avoid circular imports:
# router.py  →  auth.py  →  authentication/utils.py  (no cycle).

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError as JWTError

from app.db import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db=Depends(get_db),
):
    """
    FastAPI dependency: decode the Bearer JWT and return the user document.

    Raises:
        HTTPException 401 — token missing, expired, tampered, or user deleted.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    from bson import ObjectId
    user = await db["users"].find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise credentials_exception
    return user
