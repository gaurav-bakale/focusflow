"""
Authentication & Authorization Integration Tests

Tests the full auth flow against the real FastAPI app + Atlas MongoDB:
  - Registration (success, duplicate email, weak password)
  - Login (success, wrong password, unknown email)
  - JWT token validation (valid, missing, expired, tampered)
  - Protected route access (authorized, unauthorized)
  - Authorization: users can only access their own resources
  - Demo user login verification

Run with:
    PYTHONPATH=backend python3 -m pytest tests/backend/test_auth.py -v
"""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import pytest_asyncio
from dotenv import load_dotenv
from httpx import AsyncClient, ASGITransport

load_dotenv(Path(__file__).parent.parent.parent / "backend" / ".env")

from app.main import app  # noqa: E402
from app.db import connect_db, close_db, get_db  # noqa: E402
from app.auth import create_access_token  # noqa: E402

BASE = "http://test"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(loop_scope="function")
async def db():
    await connect_db()
    yield get_db()
    await close_db()


@pytest_asyncio.fixture(loop_scope="function")
async def client(db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as ac:
        yield ac


@pytest_asyncio.fixture(loop_scope="function")
async def registered_user(client, db):
    """Create a fresh test user and return (token, user_id, email, password)."""
    payload = {
        "name": "Auth Tester",
        "email": "auth_tester@focusflow-ci.com",
        "password": "SecurePass1!",
    }
    resp = await client.post("/api/auth/register", json=payload)
    # If already exists from a previous run, login instead
    if resp.status_code == 400:
        resp = await client.post("/api/auth/login", json={
            "email": payload["email"],
            "password": payload["password"],
        })
    data = resp.json()
    yield {
        "token": data["access_token"],
        "user_id": data["user"]["id"],
        "email": payload["email"],
        "password": payload["password"],
    }
    await db["users"].delete_many({"email": payload["email"]})
    await db["tasks"].delete_many({"user_id": {"$exists": True}})


@pytest_asyncio.fixture(loop_scope="function")
async def second_user(client, db):
    """A second independent user for cross-user authorization tests."""
    payload = {
        "name": "Other User",
        "email": "other_user@focusflow-ci.com",
        "password": "OtherPass1!",
    }
    resp = await client.post("/api/auth/register", json=payload)
    if resp.status_code == 400:
        resp = await client.post("/api/auth/login", json={
            "email": payload["email"],
            "password": payload["password"],
        })
    data = resp.json()
    yield {
        "token": data["access_token"],
        "user_id": data["user"]["id"],
        "email": payload["email"],
    }
    await db["users"].delete_many({"email": payload["email"]})


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Registration ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_success(client, db):
    resp = await client.post("/api/auth/register", json={
        "name": "New User",
        "email": "new_register@focusflow-ci.com",
        "password": "ValidPass1!",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "new_register@focusflow-ci.com"
    assert "password" not in data["user"]
    await db["users"].delete_many({"email": "new_register@focusflow-ci.com"})


@pytest.mark.asyncio
async def test_register_duplicate_email(client, registered_user):
    resp = await client.post("/api/auth/register", json={
        "name": "Duplicate",
        "email": registered_user["email"],
        "password": "AnotherPass1!",
    })
    assert resp.status_code == 400
    assert "already registered" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_password_too_short(client):
    resp = await client.post("/api/auth/register", json={
        "name": "Short Pass",
        "email": "shortpass@focusflow.test",
        "password": "abc",
    })
    assert resp.status_code == 422  # Pydantic validation error


@pytest.mark.asyncio
async def test_register_invalid_email(client):
    resp = await client.post("/api/auth/register", json={
        "name": "Bad Email",
        "email": "not-an-email",
        "password": "ValidPass1!",
    })
    assert resp.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_success(client, registered_user):
    resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": registered_user["password"],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == registered_user["email"]


@pytest.mark.asyncio
async def test_login_wrong_password(client, registered_user):
    resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": "WrongPassword!",
    })
    assert resp.status_code == 401
    assert "invalid" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_unknown_email(client):
    resp = await client.post("/api/auth/login", json={
        "email": "nobody@focusflow-ci.com",
        "password": "SomePass1!",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_demo_user(client):
    """Verify the seeded demo user can log in."""
    resp = await client.post("/api/auth/login", json={
        "email": "demo@focusflow.app",
        "password": "Demo@1234",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["name"] == "Demo User"
    assert "access_token" in data


# ── JWT Token Validation ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_protected_route_with_valid_token(client, registered_user):
    resp = await client.get("/api/tasks", headers=auth_headers(registered_user["token"]))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_protected_route_without_token(client):
    resp = await client.get("/api/tasks")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_route_with_tampered_token(client, registered_user):
    bad_token = registered_user["token"][:-5] + "XXXXX"
    resp = await client.get("/api/tasks", headers=auth_headers(bad_token))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_route_with_expired_token(client, registered_user):
    expired_token = create_access_token(
        {"sub": registered_user["user_id"]},
        expires_delta=timedelta(seconds=-1),
    )
    resp = await client.get("/api/tasks", headers=auth_headers(expired_token))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_route_with_wrong_secret(client, registered_user):
    from jose import jwt as jose_jwt
    fake_token = jose_jwt.encode(
        {"sub": registered_user["user_id"], "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        "wrong-secret",
        algorithm="HS256",
    )
    resp = await client.get("/api/tasks", headers=auth_headers(fake_token))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_token_with_nonexistent_user_id(client):
    from bson import ObjectId
    ghost_token = create_access_token({"sub": str(ObjectId())})
    resp = await client.get("/api/tasks", headers=auth_headers(ghost_token))
    assert resp.status_code == 401


# ── Authorization: users can only see their own data ─────────────────────────

@pytest.mark.asyncio
async def test_user_only_sees_own_tasks(client, registered_user, second_user):
    # User 1 creates a task
    create_resp = await client.post(
        "/api/tasks",
        json={"title": "User1 private task", "priority": "HIGH"},
        headers=auth_headers(registered_user["token"]),
    )
    assert create_resp.status_code == 201
    task_id = create_resp.json()["id"]

    # User 2 cannot fetch user 1's task by ID
    get_resp = await client.get(
        f"/api/tasks/{task_id}",
        headers=auth_headers(second_user["token"]),
    )
    assert get_resp.status_code == 404

    # User 2's task list does not include user 1's task
    list_resp = await client.get("/api/tasks", headers=auth_headers(second_user["token"]))
    ids = [t["id"] for t in list_resp.json()]
    assert task_id not in ids

    # Cleanup
    await client.delete(f"/api/tasks/{task_id}", headers=auth_headers(registered_user["token"]))


@pytest.mark.asyncio
async def test_user_cannot_update_other_users_task(client, registered_user, second_user):
    create_resp = await client.post(
        "/api/tasks",
        json={"title": "Owner task"},
        headers=auth_headers(registered_user["token"]),
    )
    task_id = create_resp.json()["id"]

    update_resp = await client.put(
        f"/api/tasks/{task_id}",
        json={"title": "Hijacked title"},
        headers=auth_headers(second_user["token"]),
    )
    assert update_resp.status_code == 404

    await client.delete(f"/api/tasks/{task_id}", headers=auth_headers(registered_user["token"]))


@pytest.mark.asyncio
async def test_user_cannot_delete_other_users_task(client, registered_user, second_user):
    create_resp = await client.post(
        "/api/tasks",
        json={"title": "Delete target"},
        headers=auth_headers(registered_user["token"]),
    )
    task_id = create_resp.json()["id"]

    del_resp = await client.delete(
        f"/api/tasks/{task_id}",
        headers=auth_headers(second_user["token"]),
    )
    assert del_resp.status_code == 404

    # Original owner can still delete it
    own_del = await client.delete(
        f"/api/tasks/{task_id}",
        headers=auth_headers(registered_user["token"]),
    )
    assert own_del.status_code == 204
