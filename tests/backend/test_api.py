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
            "password": "SecurePass1!"
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
            "password": "AnotherPass1!"
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


# ── Sprint 3 Tests — added by Sheshu Vrathan Tadaka (Testing/Integration) ─────

@pytest.mark.asyncio
async def test_update_task_success():
    """
    TC-B05: Update an existing task's title and priority.
    Input:  JWT token + task_id + updated fields
    Oracle: 200 response with updated fields reflected
    Success: status_code == 200 and fields match update payload
    Failure: non-200 or fields unchanged
    """
    async def _override_get_current_user():
        return MOCK_USER

    updated_task = {**MOCK_TASK, "title": "Updated title", "priority": "LOW"}

    mock_db_inst = MagicMock()
    mock_db_inst["tasks"].find_one = AsyncMock(return_value=updated_task)
    mock_db_inst["tasks"].find_one_and_update = AsyncMock(return_value=updated_task)
    mock_db_inst["tasks"].update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    app.dependency_overrides[get_current_user_dependency] = _override_get_current_user
    app.dependency_overrides[get_db_dependency] = lambda: mock_db_inst

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.put(
            f"/api/tasks/{FAKE_TASK_ID}",
            json={"title": "Updated title", "priority": "LOW"},
            headers=get_auth_header()
        )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated title"
    assert data["priority"] == "LOW"


@pytest.mark.asyncio
async def test_complete_task_success():
    """
    TC-B06: Mark an existing task as DONE.
    Input:  JWT token + task_id
    Oracle: 200 response with completed task returned
    Success: status_code == 200
    Failure: non-200 or task not marked done
    """
    async def _override_get_current_user():
        return MOCK_USER

    completed_task = {**MOCK_TASK, "status": "DONE", "is_complete": True}

    mock_db_inst = MagicMock()
    mock_db_inst["tasks"].find_one = AsyncMock(return_value=completed_task)
    mock_db_inst["tasks"].find_one_and_update = AsyncMock(return_value=completed_task)
    mock_db_inst["tasks"].update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    app.dependency_overrides[get_current_user_dependency] = _override_get_current_user
    app.dependency_overrides[get_db_dependency] = lambda: mock_db_inst

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch(
            f"/api/tasks/{FAKE_TASK_ID}/complete",
            headers=get_auth_header()
        )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_delete_task_success():
    """
    TC-B07: Delete an existing task.
    Input:  JWT token + task_id
    Oracle: 204 No Content
    Success: status_code == 204
    Failure: non-204 or task still exists
    """
    async def _override_get_current_user():
        return MOCK_USER

    mock_db_inst = MagicMock()
    mock_db_inst["tasks"].find_one = AsyncMock(return_value=MOCK_TASK)
    mock_db_inst["tasks"].delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
    app.dependency_overrides[get_current_user_dependency] = _override_get_current_user
    app.dependency_overrides[get_db_dependency] = lambda: mock_db_inst

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.delete(
            f"/api/tasks/{FAKE_TASK_ID}",
            headers=get_auth_header()
        )

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_task_not_found():
    """
    TC-B08: Attempt to delete a task that does not exist.
    Input:  JWT token + non-existent task_id
    Oracle: 404 Not Found
    Success: status_code == 404
    Failure: non-404 returned
    """
    async def _override_get_current_user():
        return MOCK_USER

    delete_result = MagicMock()
    delete_result.deleted_count = 0
    mock_db_inst = MagicMock()
    mock_db_inst["tasks"].delete_one = AsyncMock(return_value=delete_result)
    app.dependency_overrides[get_current_user_dependency] = _override_get_current_user
    app.dependency_overrides[get_db_dependency] = lambda: mock_db_inst

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.delete(
            f"/api/tasks/{FAKE_TASK_ID}",
            headers=get_auth_header()
        )

    assert response.status_code == 404
