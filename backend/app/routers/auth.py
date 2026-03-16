"""
Auth Router - /api/auth

Handles user registration and login.
Returns JWT tokens on successful authentication.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from bson import ObjectId

from app.models import UserRegister, UserLogin, TokenResponse, UserResponse
from app.auth import hash_password, verify_password, create_access_token
from app.db import get_db

router = APIRouter()


def _user_to_response(user: dict) -> UserResponse:
    return UserResponse(id=str(user["_id"]), name=user["name"], email=user["email"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db=Depends(get_db)):
    """
    Register a new user account.

    Args:
        data: UserRegister with name, email, and password (min 8 chars).

    Returns:
        TokenResponse containing JWT access token and user info.

    Raises:
        HTTPException 400: If the email is already registered.
    """
    existing = await db["users"].find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "name": data.name,
        "email": data.email,
        "password_hash": hash_password(data.password),
    }
    result = await db["users"].insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    token = create_access_token({"sub": str(result.inserted_id)})
    return TokenResponse(access_token=token, user=_user_to_response(user_doc))


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db=Depends(get_db)):
    """
    Authenticate an existing user.

    Args:
        data: UserLogin with email and password.

    Returns:
        TokenResponse containing JWT access token and user info.

    Raises:
        HTTPException 401: If credentials are invalid.
    """
    user = await db["users"].find_one({"email": data.email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user["_id"])})
    return TokenResponse(access_token=token, user=_user_to_response(user))
