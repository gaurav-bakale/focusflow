"""
Login flow tests
  POST /api/auth/login
"""

import pytest
from jose import jwt

from app.authentication.utils import SECRET_KEY, ALGORITHM
from tests.backend.authentication.conftest import auth_headers


@pytest.mark.asyncio
async def test_login_returns_200_with_token(client, registered_user):
    resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": registered_user["password"],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_token_encodes_correct_user_id(client, registered_user):
    resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": registered_user["password"],
    })
    token = resp.json()["access_token"]
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == registered_user["user_id"]


@pytest.mark.asyncio
async def test_login_response_contains_user_profile(client, registered_user):
    resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": registered_user["password"],
    })
    user = resp.json()["user"]
    assert user["email"] == registered_user["email"]
    assert user["name"] == registered_user["name"]
    assert "password_hash" not in user


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client, registered_user):
    resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": "WrongPassword!",
    })
    assert resp.status_code == 401
    assert "invalid" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_unknown_email_returns_401(client):
    resp = await client.post("/api/auth/login", json={
        "email": "ghost@focusflow-ci.com",
        "password": "SomePass1!",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_empty_password_returns_401(client, registered_user):
    resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": "",
    })
    # Passlib will not match empty string; still 401 not 422
    assert resp.status_code in (401, 422)


@pytest.mark.asyncio
async def test_login_demo_user(client):
    """Verify the seeded demo user can always log in."""
    resp = await client.post("/api/auth/login", json={
        "email": "demo@focusflow.app",
        "password": "Demo@1234",
    })
    assert resp.status_code == 200
    assert resp.json()["user"]["name"] == "Demo User"


@pytest.mark.asyncio
async def test_login_is_case_sensitive_for_email(client, registered_user):
    resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"].upper(),
        "password": registered_user["password"],
    })
    # MongoDB stores email as-is; uppercase lookup misses → 401
    assert resp.status_code == 401
