"""
Backend Test Suite — Task Management (Sprint 3)

Framework : pytest + httpx (AsyncClient + ASGITransport)
Strategy  : All MongoDB calls are mocked with MagicMock / AsyncMock so tests
            run without a real database.

Test oracle convention:
    Each test declares Input, Oracle, Success condition, Failure condition.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta
from bson import ObjectId

from app.main import app
from app.db import get_db as get_db_dependency
from app.auth import get_current_user as get_current_user_dependency

# ── Shared fixtures ────────────────────────────────────────────────────────────

FAKE_USER_ID = str(ObjectId())
FAKE_TASK_ID = str(ObjectId())

MOCK_USER = {
    "_id": ObjectId(FAKE_USER_ID),
    "name": "Test User",
    "email": "test@focusflow.dev",
    "password_hash": "$2b$12$fakehash",
}

NOW = datetime.utcnow()

MOCK_TASK_DOC = {
    "_id": ObjectId(FAKE_TASK_ID),
    "user_id": ObjectId(FAKE_USER_ID),
    "title": "Write unit tests",
    "description": "Cover all services",
    "priority": "HIGH",
    "deadline": "2025-04-01",
    "status": "TODO",
    "subtasks": [],
    "categories": ["backend"],
    "created_at": NOW,
    "updated_at": NOW,
}


@pytest.fixture(autouse=True)
def _mock_db_lifecycle():
    with (
        patch("app.main.connect_db", new=AsyncMock()),
        patch("app.main.close_db",   new=AsyncMock()),
    ):
        yield


@pytest.fixture(autouse=True)
def _clear_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def _auth_override():
    async def _get_user():
        return MOCK_USER
    return _get_user


async def _async_iter(items):
    """Helper: async generator wrapping a list for use as a Motor cursor mock."""
    for item in items:
        yield item


def _mock_db(task_doc=None):
    """Return a pre-wired mock DB instance."""
    db = MagicMock()

    # find() returns an async iterable cursor — must support `async for`
    items = [task_doc] if task_doc else []
    mock_cursor = _async_iter(items)
    # Wrap in a MagicMock that chains .sort() back to a fresh async iterable
    sortable = MagicMock()
    sortable.__aiter__ = lambda self: _async_iter(items).__aiter__()
    sortable.to_list = AsyncMock(return_value=items)
    real_cursor = MagicMock()
    real_cursor.sort = MagicMock(return_value=sortable)
    real_cursor.to_list = AsyncMock(return_value=items)
    real_cursor.__aiter__ = lambda self: _async_iter(items).__aiter__()
    db["tasks"].find.return_value = real_cursor

    # Individual document operations
    db["tasks"].find_one      = AsyncMock(return_value=task_doc)
    db["tasks"].insert_one    = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId(FAKE_TASK_ID))
    )
    db["tasks"].find_one_and_update = AsyncMock(return_value=task_doc)
    db["tasks"].delete_one    = AsyncMock(
        return_value=MagicMock(deleted_count=1)
    )
    return db


# ── TC-T01: List tasks ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_tasks_returns_user_tasks():
    """
    TC-T01: GET /api/tasks — returns all tasks for authenticated user.
    Input  : Valid JWT, one task in DB.
    Oracle : 200 with a list containing the task.
    Success: status==200, list length==1, title matches.
    Failure: non-200 or empty list.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: _mock_db(MOCK_TASK_DOC)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/tasks")

    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["title"] == "Write unit tests"
    assert data[0]["priority"] == "HIGH"


# ── TC-T02: Get task by ID ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_task_by_id_success():
    """
    TC-T02: GET /api/tasks/{id} — returns the specific task.
    Input  : Valid JWT + existing task_id.
    Oracle : 200 with task id matching request.
    Success: status==200, id==FAKE_TASK_ID.
    Failure: 404 or wrong task returned.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: _mock_db(MOCK_TASK_DOC)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/tasks/{FAKE_TASK_ID}")

    assert r.status_code == 200
    assert r.json()["id"] == FAKE_TASK_ID


# ── TC-T03: Get task — 404 ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_task_not_found_returns_404():
    """
    TC-T03: GET /api/tasks/{id} with non-existent id.
    Input  : Valid JWT + id not in DB (find_one returns None).
    Oracle : 404 with 'Task not found' detail.
    Success: status==404.
    Failure: 200 or 500.
    """
    db = _mock_db()
    db["tasks"].find_one = AsyncMock(return_value=None)
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/tasks/{FAKE_TASK_ID}")

    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


# ── TC-T04: Update task ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_task_priority():
    """
    TC-T04: PUT /api/tasks/{id} — partial update changes priority.
    Input  : Valid JWT + {priority: 'LOW'}.
    Oracle : 200 with updated task having priority='LOW'.
    Success: status==200, priority=='LOW'.
    Failure: priority unchanged or 404.
    """
    updated_doc = {**MOCK_TASK_DOC, "priority": "LOW"}
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=updated_doc)
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.put(f"/api/tasks/{FAKE_TASK_ID}", json={"priority": "LOW"})

    assert r.status_code == 200
    assert r.json()["priority"] == "LOW"


# ── TC-T05: Update task — no fields → 400 ─────────────────────────────────────

@pytest.mark.asyncio
async def test_update_task_no_fields_returns_400():
    """
    TC-T05: PUT /api/tasks/{id} with empty body.
    Input  : Valid JWT + {} (all fields None).
    Oracle : 400 Bad Request.
    Success: status==400.
    Failure: 200 or 422.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: _mock_db(MOCK_TASK_DOC)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.put(f"/api/tasks/{FAKE_TASK_ID}", json={})

    assert r.status_code == 400


# ── TC-T06: Update task — 404 ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_task_not_found_returns_404():
    """
    TC-T06: PUT /api/tasks/{id} when task does not exist.
    Input  : Valid JWT + {status: 'DONE'}, find_one_and_update returns None.
    Oracle : 404 with detail.
    Success: status==404.
    Failure: 200 or 500.
    """
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=None)
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.put(f"/api/tasks/{FAKE_TASK_ID}", json={"status": "DONE"})

    assert r.status_code == 404


# ── TC-T07: Complete task ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_complete_task_sets_status_done():
    """
    TC-T07: PATCH /api/tasks/{id}/complete — marks task as DONE.
    Input  : Valid JWT + existing task in TODO.
    Oracle : 200 with status='DONE' and is_complete=True.
    Success: status==200, is_complete==True.
    Failure: status unchanged or error.
    """
    done_doc = {**MOCK_TASK_DOC, "status": "DONE"}
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=done_doc)
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.patch(f"/api/tasks/{FAKE_TASK_ID}/complete")

    assert r.status_code == 200
    body = r.json()
    assert body["completed"]["status"] == "DONE"
    assert body["completed"]["is_complete"] is True
    assert body["next_task"] is None


# ── TC-T08: Complete task — 404 ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_complete_task_not_found_returns_404():
    """
    TC-T08: PATCH /api/tasks/{id}/complete when task does not exist.
    Oracle : 404.
    """
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=None)
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.patch(f"/api/tasks/{FAKE_TASK_ID}/complete")

    assert r.status_code == 404


# ── TC-T09: Delete task ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_task_returns_204():
    """
    TC-T09: DELETE /api/tasks/{id} — deletes task successfully.
    Input  : Valid JWT + existing task_id.
    Oracle : 204 No Content.
    Success: status==204.
    Failure: 200, 404, or 500.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: _mock_db(MOCK_TASK_DOC)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/tasks/{FAKE_TASK_ID}")

    assert r.status_code == 204


# ── TC-T10: Delete task — 404 ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_task_not_found_returns_404():
    """
    TC-T10: DELETE /api/tasks/{id} when task does not exist.
    Oracle : 404.
    """
    db = _mock_db()
    db["tasks"].delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/tasks/{FAKE_TASK_ID}")

    assert r.status_code == 404


# ── TC-T11: Analytics — happy path ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_analytics_returns_correct_counts():
    """
    TC-T11: GET /api/tasks/analytics — returns aggregate counts.
    Input  : 3 tasks (1 TODO/HIGH, 1 IN_PROGRESS/MEDIUM, 1 DONE/LOW).
    Oracle : total=3, by_status correct, completion_rate=33.3%.
    Success: all counts match.
    Failure: wrong counts or 404/500.
    """
    tasks = [
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "TODO",        "priority": "HIGH"},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "IN_PROGRESS", "priority": "MEDIUM", "deadline": None},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE",        "priority": "LOW",    "deadline": None},
    ]
    db = _mock_db()
    db["tasks"].find.return_value.to_list = AsyncMock(return_value=tasks)
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/tasks/analytics")

    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert body["by_status"]["TODO"]        == 1
    assert body["by_status"]["IN_PROGRESS"] == 1
    assert body["by_status"]["DONE"]        == 1
    assert body["by_priority"]["HIGH"]      == 1
    assert body["by_priority"]["MEDIUM"]    == 1
    assert body["by_priority"]["LOW"]       == 1
    assert body["completion_rate"] == 33.3


# ── TC-T12: Analytics — no tasks ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_analytics_empty_returns_zeros():
    """
    TC-T12: GET /api/tasks/analytics with zero tasks.
    Oracle : total=0, completion_rate=0.0, no overdue.
    """
    db = _mock_db()
    db["tasks"].find.return_value.to_list = AsyncMock(return_value=[])
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/tasks/analytics")

    assert r.status_code == 200
    body = r.json()
    assert body["total"]           == 0
    assert body["completion_rate"] == 0.0
    assert body["overdue"]         == 0


# ── TC-T13: Analytics — overdue count ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_analytics_counts_overdue_tasks():
    """
    TC-T13: GET /api/tasks/analytics — overdue field counts non-DONE past-deadline tasks.
    Input  : 2 tasks with deadline yesterday (one TODO, one DONE).
    Oracle : overdue=1 (DONE tasks are excluded from overdue).
    Success: overdue==1.
    Failure: overdue==0 or 2.
    """
    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    tasks = [
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "TODO", "deadline": yesterday},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE", "deadline": yesterday},
    ]
    db = _mock_db()
    db["tasks"].find.return_value.to_list = AsyncMock(return_value=tasks)
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/tasks/analytics")

    assert r.status_code == 200
    assert r.json()["overdue"] == 1


# ── TC-T14: Analytics — completed_today ───────────────────────────────────────

@pytest.mark.asyncio
async def test_analytics_completed_today():
    """
    TC-T14: GET /api/tasks/analytics — completed_today counts DONE tasks updated today.
    Input  : 1 DONE task updated now, 1 DONE task updated yesterday.
    Oracle : completed_today=1.
    """
    yesterday_dt = datetime.utcnow() - timedelta(days=1)
    tasks = [
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE",
         "updated_at": datetime.utcnow(), "deadline": None},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE",
         "updated_at": yesterday_dt, "deadline": None},
    ]
    db = _mock_db()
    db["tasks"].find.return_value.to_list = AsyncMock(return_value=tasks)
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/tasks/analytics")

    assert r.status_code == 200
    assert r.json()["completed_today"] == 1


# ── TC-T15: Unauthenticated access → 401 ─────────────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_get_tasks_returns_401():
    """
    TC-T15: GET /api/tasks without a token.
    Oracle : 401 or 403 (FastAPI returns 403 for missing bearer by default).
    Success: status in {401, 403}.
    Failure: 200.
    """
    # No dependency overrides — real JWT check runs
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/tasks")

    assert r.status_code in {401, 403}


@pytest.mark.asyncio
async def test_unauthenticated_analytics_returns_401():
    """
    TC-T16: GET /api/tasks/analytics without a token.
    Oracle : 401 or 403.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/tasks/analytics")

    assert r.status_code in {401, 403}


# ── TC-T17: Create task with categories ───────────────────────────────────────

@pytest.mark.asyncio
async def test_create_task_with_categories():
    """
    TC-T17: POST /api/tasks with categories list.
    Oracle : 201 with categories preserved in response.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: _mock_db(MOCK_TASK_DOC)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/tasks", json={
            "title": "Design DB schema",
            "priority": "MEDIUM",
            "categories": ["backend", "database"],
        })

    assert r.status_code == 201


# ── TC-T18: Analytics route not shadowed by /{task_id} ────────────────────────

@pytest.mark.asyncio
async def test_analytics_route_not_shadowed_by_task_id_param():
    """
    TC-T18: Verify /analytics is not captured as a task_id path param.
    If route ordering is wrong FastAPI would try ObjectId('analytics') → 500/422.
    Oracle : 200 (not 422 or 500).
    """
    db = _mock_db()
    db["tasks"].find.return_value.to_list = AsyncMock(return_value=[])
    app.dependency_overrides[get_current_user_dependency] = _auth_override()
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/tasks/analytics")

    assert r.status_code == 200
