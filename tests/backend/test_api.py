"""
Backend Test Suite - FocusFlow (Sprint 1 & 2)
Framework: pytest + httpx

Current coverage: Auth and Task creation tests.
More test cases will be added in upcoming sprints.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime
from bson import ObjectId

from app.main import app
from app.db import get_db as get_db_dependency
from app.auth import get_current_user as get_current_user_dependency

@pytest.fixture(autouse=True)
def _mock_db_lifecycle():
    # These API tests mock DB operations per-endpoint; disable real Mongo pings
    # so unit tests don't depend on an external database being available.
    with patch("app.main.connect_db", new=AsyncMock()), patch("app.main.close_db", new=AsyncMock()):
        yield


@pytest.fixture(autouse=True)
def _clear_dependency_overrides():
    # Each test sets overrides for `get_db` to keep them deterministic and isolated.
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()

FAKE_USER_ID = str(ObjectId())
FAKE_TASK_ID = str(ObjectId())

MOCK_USER = {
    "_id": ObjectId(FAKE_USER_ID),
    "name": "Test User",
    "email": "test@focusflow.dev",
    "password_hash": "$2b$12$fakehash",
}

MOCK_TASK = {
    "_id": ObjectId(FAKE_TASK_ID),
    "user_id": ObjectId(FAKE_USER_ID),
    "title": "Write unit tests",
    "description": "Cover all services",
    "priority": "HIGH",
    "deadline": "2025-04-01",
    "status": "TODO",
    "subtasks": [],
    "created_at": datetime.utcnow(),
    "updated_at": datetime.utcnow(),
}


def get_auth_header():
    from app.auth import create_access_token
    token = create_access_token({"sub": FAKE_USER_ID})
    return {"Authorization": f"Bearer {token}"}


# ── Auth Tests ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_new_user():
    """
    TC-B01: Register a new user with valid credentials.
    Input: name, email, password
    Oracle: 201 response with access_token
    Success: status_code == 201 and access_token present
    Failure: non-201 or missing token
    """
    mock_db_inst = MagicMock()
    mock_db_inst["users"].find_one = AsyncMock(return_value=None)
    mock_db_inst["users"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId(FAKE_USER_ID))
    )
    app.dependency_overrides[get_db_dependency] = lambda: mock_db_inst

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/auth/register", json={
            "name": "Alice",
            "email": "alice@focusflow.dev",
            "password": "securepass123"
        })

    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "alice@focusflow.dev"


@pytest.mark.asyncio
async def test_register_duplicate_email():
    """
    TC-B02: Register with an already-used email.
    Input: email that already exists
    Oracle: 409 Conflict error
    Success: status_code == 409
    Failure: User created or 201 returned
    """
    mock_db_inst = MagicMock()
    mock_db_inst["users"].find_one = AsyncMock(return_value=MOCK_USER)
    app.dependency_overrides[get_db_dependency] = lambda: mock_db_inst

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/auth/register", json={
            "name": "Bob",
            "email": "test@focusflow.dev",
            "password": "anotherpass123"
        })

    assert response.status_code == 409
    assert "already registered" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_task_success():
    """
    TC-B04: Create a valid task for authenticated user.
    Input: JWT token + task payload
    Oracle: 201 with task id and title matching input
    Success: status_code == 201 and title matches
    Failure: non-201 or wrong fields

    TODO (Sprint 3): Add tests for task update, complete, and delete.
    """
    async def _override_get_current_user():
        return MOCK_USER

    mock_db_inst = MagicMock()
    mock_db_inst["tasks"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId(FAKE_TASK_ID))
    )
    app.dependency_overrides[get_current_user_dependency] = _override_get_current_user
    app.dependency_overrides[get_db_dependency] = lambda: mock_db_inst

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/tasks",
            json={"title": "Write unit tests", "priority": "HIGH"},
            headers=get_auth_header()
        )

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Write unit tests"
    assert data["priority"] == "HIGH"
