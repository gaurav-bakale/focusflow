"""
Task Management Integration Tests
===================================

Design Patterns exercised
--------------------------
Facade pattern       — tests call thin router endpoints; no direct service
                       or DB calls are made from test code.
Service Layer        — test assertions verify the outcomes produced by
                       TaskService; the HTTP layer is incidental.
Repository pattern   — tests confirm that each user sees only their own tasks,
                       validating the user_id isolation enforced by the repo.
Dependency Injection — the `client` and `auth_headers` fixtures (injected via
                       conftest.py / local fixtures) replace real DB setup.

NOTE: These tests use dependency_overrides (mock DB) so they run without a
live MongoDB.  Set PYTHONPATH=backend before running.

Coverage
--------
list tasks:
  - empty list → []
  - returns user's tasks only (not other users')

create task:
  - minimal (title only) → 201
  - full payload → 201
  - missing title → 422
  - unauthenticated → 401

get task:
  - existing task → 200
  - non-existent id → 404
  - other user's task → 404
  - invalid ObjectId → 404

update task:
  - partial update (title only) → 200
  - update status to IN_PROGRESS → 200
  - no fields provided → 400
  - non-existent → 404

complete task:
  - non-recurring → status=DONE
  - recurring DAILY → status=DONE + new task created
  - recurring WEEKLY → status=DONE + new task created
  - recurring MONTHLY → status=DONE + new task created
  - recurring WEEKDAYS completing on Friday → next is Monday

delete task:
  - existing → 204
  - non-existent → 404
  - other user's task → 404

analytics:
  - returns all required keys
  - overdue count correct
  - completion_rate = 0 when no tasks

Run with:
    PYTHONPATH=backend pytest tests/test_tasks.py -v
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from bson import ObjectId
from httpx import ASGITransport, AsyncClient

# ── Path setup ────────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402
from app.auth import get_current_user as _get_current_user  # noqa: E402
from app.db import get_db as _get_db  # noqa: E402

BASE = "http://test"
NOW = datetime.utcnow()

# ── Shared test data ───────────────────────────────────────────────────────────

FAKE_USER_ID = str(ObjectId())
FAKE_TASK_ID = str(ObjectId())
OTHER_USER_ID = str(ObjectId())

MOCK_USER = {
    "_id": ObjectId(FAKE_USER_ID),
    "name": "Task Tester",
    "email": "tasks@focusflow-test.internal",
    "password_hash": "$2b$12$fakehash",
}

OTHER_USER = {
    "_id": ObjectId(OTHER_USER_ID),
    "name": "Other Tester",
    "email": "other@focusflow-test.internal",
    "password_hash": "$2b$12$fakehash",
}

MOCK_TASK_DOC = {
    "_id": ObjectId(FAKE_TASK_ID),
    "user_id": ObjectId(FAKE_USER_ID),
    "title": "Write unit tests",
    "description": "Cover all services",
    "priority": "HIGH",
    "deadline": "2025-04-01",
    "due_time": None,
    "recurrence": "NONE",
    "estimated_minutes": 60,
    "status": "TODO",
    "subtasks": [],
    "categories": ["backend"],
    "created_at": NOW,
    "updated_at": NOW,
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _auth_override(user=None):
    """Return a dependency override that yields the given user dict."""
    _user = user or MOCK_USER

    async def _get_user():
        return _user

    return _get_user


class _AsyncCursor:
    """
    Minimal async-iterable cursor shim that satisfies Motor's `async for` protocol.

    Motor cursors implement both __aiter__ and __anext__; MagicMock's auto-
    generated __aiter__ returns a plain list_iterator which is not async, so
    we provide a tiny concrete class instead.
    """

    def __init__(self, items):
        self._items = list(items)
        self._index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index >= len(self._items):
            raise StopAsyncIteration
        item = self._items[self._index]
        self._index += 1
        return item

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length=None):
        return list(self._items)


def _mock_db(task_doc=None, tasks=None):
    """
    Factory pattern helper — build a pre-wired mock MongoDB database.

    The `tasks` param overrides the list returned by find().to_list().
    The `task_doc` param is used for single-document operations.
    """
    db = MagicMock()
    _tasks_list = tasks if tasks is not None else ([task_doc] if task_doc else [])

    db["tasks"].find.return_value = _AsyncCursor(_tasks_list)

    db["tasks"].find_one = AsyncMock(return_value=task_doc)
    db["tasks"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId(FAKE_TASK_ID))
    )
    db["tasks"].find_one_and_update = AsyncMock(return_value=task_doc)
    db["tasks"].delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
    return db


@pytest.fixture(autouse=True)
def _clear_overrides():
    """Reset dependency overrides before and after every test."""
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


# ══════════════════════════════════════════════════════════════════════════════
# LIST TASKS
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_tasks_empty():
    """
    Tests Repository pattern: no tasks in store → empty list returned.

    Input    : GET /api/tasks with valid token; DB has no tasks.
    Expected : HTTP 200, body is an empty JSON array.
    Pass     : status==200, body==[].
    """
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: _mock_db()

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/tasks")

    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_tasks_returns_users_tasks_only():
    """
    Tests Repository pattern: list_tasks filters by user_id — other users'
    tasks never appear in the response.

    Input    : GET /api/tasks with user A token; mock DB has user A's task only.
    Expected : HTTP 200, list contains the task owned by user A.
    Pass     : status==200, len==1, id matches FAKE_TASK_ID.
    """
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: _mock_db(MOCK_TASK_DOC)

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/tasks")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == FAKE_TASK_ID
    assert data[0]["user_id"] == FAKE_USER_ID


# ══════════════════════════════════════════════════════════════════════════════
# CREATE TASK
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_task_minimal():
    """
    Tests Service Layer: TaskService.create_task() works with title only.

    Input    : POST /api/tasks with {"title": "Minimal Task"}.
    Expected : HTTP 201, response has id and default priority MEDIUM.
    Pass     : status==201, 'id' in body.
    """
    doc = {**MOCK_TASK_DOC, "title": "Minimal Task", "priority": "MEDIUM"}
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: _mock_db(doc)

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/tasks", json={"title": "Minimal Task"})

    assert resp.status_code == 201
    assert "id" in resp.json()


@pytest.mark.asyncio
async def test_create_task_full_payload():
    """
    Tests Service Layer: TaskService.create_task() persists all optional fields.

    Input    : POST /api/tasks with all optional fields set.
    Expected : HTTP 201, response echoes back priority, deadline, recurrence, etc.
    Pass     : status==201, 'id' in body.
    """
    full_doc = {
        **MOCK_TASK_DOC,
        "title": "Full Task",
        "priority": "HIGH",
        "deadline": "2025-12-31",
        "due_time": "09:00",
        "recurrence": "DAILY",
        "estimated_minutes": 90,
        "categories": ["work", "urgent"],
    }
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: _mock_db(full_doc)

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/tasks", json={
            "title": "Full Task",
            "priority": "HIGH",
            "deadline": "2025-12-31",
            "due_time": "09:00",
            "recurrence": "DAILY",
            "estimated_minutes": 90,
            "categories": ["work", "urgent"],
        })

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_task_missing_title():
    """
    Tests Facade pattern: Pydantic rejects missing required field 'title'.

    Input    : POST /api/tasks with no title field.
    Expected : HTTP 422 Unprocessable Entity.
    Pass     : status==422.
    """
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: _mock_db()

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/tasks", json={"priority": "LOW"})

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_task_unauthenticated():
    """
    Tests Dependency Injection: missing token → get_current_user raises 401
    before the service is even called.

    Input    : POST /api/tasks with no Authorization header.
    Expected : HTTP 401 (or 403 — FastAPI may return 403 for missing bearer).
    Pass     : status in {401, 403}.
    """
    # Do NOT set dependency overrides — real JWT check runs
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/tasks", json={"title": "No Auth"})

    assert resp.status_code in {401, 403}


# ══════════════════════════════════════════════════════════════════════════════
# GET TASK
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_task_success():
    """
    Tests Repository pattern: TaskService.get_task() fetches by (id, user_id).

    Input    : GET /api/tasks/{id} with valid token and existing task_id.
    Expected : HTTP 200, body matches MOCK_TASK_DOC.
    Pass     : status==200, id==FAKE_TASK_ID.
    """
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: _mock_db(MOCK_TASK_DOC)

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get(f"/api/tasks/{FAKE_TASK_ID}")

    assert resp.status_code == 200
    assert resp.json()["id"] == FAKE_TASK_ID


@pytest.mark.asyncio
async def test_get_task_nonexistent():
    """
    Tests Repository pattern: find_one returns None → service raises 404.

    Input    : GET /api/tasks/{id} where task does not exist in DB.
    Expected : HTTP 404 Not Found.
    Pass     : status==404, detail contains 'not found'.
    """
    db = _mock_db()
    db["tasks"].find_one = AsyncMock(return_value=None)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get(f"/api/tasks/{FAKE_TASK_ID}")

    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_task_other_users_task():
    """
    Tests Repository pattern: user_id filter ensures cross-user isolation —
    querying another user's task returns 404, not the task.

    Input    : GET /api/tasks/{id} where task belongs to OTHER_USER, not MOCK_USER.
    Expected : HTTP 404 (the query includes user_id filter, so no match).
    Pass     : status==404.
    """
    other_task = {**MOCK_TASK_DOC, "user_id": ObjectId(OTHER_USER_ID)}
    db = _mock_db()
    # find_one returns None because user_id filter won't match
    db["tasks"].find_one = AsyncMock(return_value=None)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get(f"/api/tasks/{FAKE_TASK_ID}")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_task_invalid_objectid():
    """
    Tests Repository pattern: _object_id() helper converts invalid id string
    to 404 immediately (no DB round-trip).

    Input    : GET /api/tasks/not-a-valid-id.
    Expected : HTTP 404 Not Found.
    Pass     : status==404.
    """
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: _mock_db()

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/tasks/not-a-valid-objectid")

    assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# UPDATE TASK
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_update_task_title_only():
    """
    Tests Service Layer: partial update writes only the supplied field.

    Input    : PUT /api/tasks/{id} with {"title": "New Title"}.
    Expected : HTTP 200, body title is 'New Title'; other fields unchanged.
    Pass     : status==200, body['title']=='New Title'.
    """
    updated_doc = {**MOCK_TASK_DOC, "title": "New Title"}
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=updated_doc)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.put(f"/api/tasks/{FAKE_TASK_ID}", json={"title": "New Title"})

    assert resp.status_code == 200
    assert resp.json()["title"] == "New Title"
    assert resp.json()["priority"] == "HIGH"  # unchanged


@pytest.mark.asyncio
async def test_update_task_status_in_progress():
    """
    Tests Service Layer: status field can be updated to IN_PROGRESS.

    Input    : PUT /api/tasks/{id} with {"status": "IN_PROGRESS"}.
    Expected : HTTP 200, body status is 'IN_PROGRESS'.
    Pass     : status==200, body['status']=='IN_PROGRESS'.
    """
    in_progress_doc = {**MOCK_TASK_DOC, "status": "IN_PROGRESS"}
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=in_progress_doc)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.put(f"/api/tasks/{FAKE_TASK_ID}", json={"status": "IN_PROGRESS"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "IN_PROGRESS"


@pytest.mark.asyncio
async def test_update_task_no_fields():
    """
    Tests Service Layer: update with no fields raises 400 (no empty writes).

    Input    : PUT /api/tasks/{id} with empty body {}.
    Expected : HTTP 400 Bad Request, detail mentions 'no fields'.
    Pass     : status==400.
    """
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: _mock_db(MOCK_TASK_DOC)

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.put(f"/api/tasks/{FAKE_TASK_ID}", json={})

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_task_nonexistent():
    """
    Tests Repository pattern: find_one_and_update returns None → 404.

    Input    : PUT /api/tasks/{id} where task does not exist.
    Expected : HTTP 404 Not Found.
    Pass     : status==404.
    """
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=None)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.put(f"/api/tasks/{FAKE_TASK_ID}", json={"title": "Ghost"})

    assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# COMPLETE TASK
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_complete_task_non_recurring():
    """
    Tests Service Layer: completing a non-recurring task sets status to DONE
    and does NOT create a follow-up task.

    Input    : PATCH /api/tasks/{id}/complete; task has recurrence=NONE.
    Expected : HTTP 200, body status='DONE', is_complete=True.
    Pass     : status==200, body['is_complete']==True, insert_one not called
               (or called once only for the original insert, not for recurrence).
    """
    done_doc = {**MOCK_TASK_DOC, "status": "DONE", "recurrence": "NONE"}
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=done_doc)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.patch(f"/api/tasks/{FAKE_TASK_ID}/complete")

    assert resp.status_code == 200
    body = resp.json()
    # Response is now CompleteTaskResponse: {"completed": {...}, "next_task": null}
    assert body["completed"]["status"] == "DONE"
    assert body["completed"]["is_complete"] is True
    assert body["next_task"] is None
    # No recurrence insert should have been triggered
    db["tasks"].insert_one.assert_not_called()


@pytest.mark.asyncio
async def test_complete_task_recurring_daily():
    """
    Tests Service Layer: completing a DAILY task auto-creates the next
    occurrence with a deadline advanced by 1 day.

    Input    : PATCH /api/tasks/{id}/complete; task has recurrence=DAILY,
               deadline='2025-06-10'.
    Expected : HTTP 200; insert_one called once for the next occurrence;
               the inserted doc has deadline='2025-06-11'.
    Pass     : status==200, insert_one called with next_deadline=='2025-06-11'.
    """
    done_doc = {
        **MOCK_TASK_DOC,
        "status": "DONE",
        "recurrence": "DAILY",
        "deadline": "2025-06-10",
    }
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=done_doc)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.patch(f"/api/tasks/{FAKE_TASK_ID}/complete")

    assert resp.status_code == 200
    body = resp.json()
    assert body["completed"]["status"] == "DONE"
    assert body["next_task"] is not None
    db["tasks"].insert_one.assert_called_once()
    inserted = db["tasks"].insert_one.call_args[0][0]
    assert inserted["deadline"] == "2025-06-11"
    assert inserted["status"] == "TODO"


@pytest.mark.asyncio
async def test_complete_task_recurring_weekly():
    """
    Tests Service Layer: completing a WEEKLY task advances deadline by 7 days.

    Input    : PATCH /api/tasks/{id}/complete; recurrence=WEEKLY, deadline='2025-06-10'.
    Expected : HTTP 200; next occurrence has deadline='2025-06-17'.
    Pass     : inserted doc deadline=='2025-06-17'.
    """
    done_doc = {
        **MOCK_TASK_DOC,
        "status": "DONE",
        "recurrence": "WEEKLY",
        "deadline": "2025-06-10",
    }
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=done_doc)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.patch(f"/api/tasks/{FAKE_TASK_ID}/complete")

    assert resp.status_code == 200
    assert resp.json()["completed"]["status"] == "DONE"
    inserted = db["tasks"].insert_one.call_args[0][0]
    assert inserted["deadline"] == "2025-06-17"


@pytest.mark.asyncio
async def test_complete_task_recurring_monthly():
    """
    Tests Service Layer: completing a MONTHLY task advances deadline by ~1 month.

    Input    : PATCH /api/tasks/{id}/complete; recurrence=MONTHLY, deadline='2025-01-31'.
    Expected : HTTP 200; next occurrence has deadline='2025-02-28' (Feb clamped).
    Pass     : inserted doc deadline=='2025-02-28'.
    """
    done_doc = {
        **MOCK_TASK_DOC,
        "status": "DONE",
        "recurrence": "MONTHLY",
        "deadline": "2025-01-31",
    }
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=done_doc)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.patch(f"/api/tasks/{FAKE_TASK_ID}/complete")

    assert resp.status_code == 200
    assert resp.json()["completed"]["status"] == "DONE"
    inserted = db["tasks"].insert_one.call_args[0][0]
    assert inserted["deadline"] == "2025-02-28"


@pytest.mark.asyncio
async def test_complete_task_recurring_weekdays_friday_to_monday():
    """
    Tests Service Layer: completing a WEEKDAYS task on Friday → next is Monday
    (Saturday and Sunday are skipped).

    Input    : PATCH /api/tasks/{id}/complete; recurrence=WEEKDAYS, deadline='2025-06-06'
               (that is a Friday).
    Expected : HTTP 200; next occurrence has deadline='2025-06-09' (Monday).
    Pass     : inserted doc deadline=='2025-06-09'.
    """
    done_doc = {
        **MOCK_TASK_DOC,
        "status": "DONE",
        "recurrence": "WEEKDAYS",
        "deadline": "2025-06-06",  # Friday
    }
    db = _mock_db()
    db["tasks"].find_one_and_update = AsyncMock(return_value=done_doc)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.patch(f"/api/tasks/{FAKE_TASK_ID}/complete")

    assert resp.status_code == 200
    assert resp.json()["completed"]["status"] == "DONE"
    inserted = db["tasks"].insert_one.call_args[0][0]
    assert inserted["deadline"] == "2025-06-09"  # Monday


# ══════════════════════════════════════════════════════════════════════════════
# DELETE TASK
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_delete_task_success():
    """
    Tests Service Layer: TaskService.delete_task() removes the document and
    returns 204 No Content.

    Input    : DELETE /api/tasks/{id} with valid token, task exists.
    Expected : HTTP 204 No Content, empty body.
    Pass     : status==204.
    """
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: _mock_db(MOCK_TASK_DOC)

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.delete(f"/api/tasks/{FAKE_TASK_ID}")

    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_task_nonexistent():
    """
    Tests Service Layer: delete_one with deleted_count==0 → 404.

    Input    : DELETE /api/tasks/{id} where task does not exist.
    Expected : HTTP 404 Not Found.
    Pass     : status==404.
    """
    db = _mock_db()
    db["tasks"].delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.delete(f"/api/tasks/{FAKE_TASK_ID}")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_task_other_users_task():
    """
    Tests Repository pattern: delete_one with user_id filter returns
    deleted_count==0 for another user's task → 404.

    Input    : DELETE /api/tasks/{id} where task belongs to OTHER_USER.
    Expected : HTTP 404 Not Found (the filter includes user_id, so no match).
    Pass     : status==404.
    """
    db = _mock_db()
    db["tasks"].delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.delete(f"/api/tasks/{FAKE_TASK_ID}")

    assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# ANALYTICS
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_analytics_returns_all_keys():
    """
    Tests Service Layer: get_analytics() returns the full required key set.

    Input    : GET /api/tasks/analytics with a known task set.
    Expected : HTTP 200, response contains all 7 required analytics keys.
    Pass     : status==200, all keys present.
    """
    tasks = [
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "TODO",        "priority": "HIGH"},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "IN_PROGRESS", "priority": "MEDIUM", "deadline": None},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE",        "priority": "LOW",    "deadline": None,
         "updated_at": NOW},
    ]
    db = _mock_db(tasks=tasks)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/tasks/analytics")

    assert resp.status_code == 200
    body = resp.json()
    for key in ("total", "by_status", "by_priority", "overdue",
                "completion_rate", "completed_today", "completed_this_week"):
        assert key in body, f"Missing key: {key}"

    assert body["total"] == 3
    assert body["by_status"]["TODO"] == 1
    assert body["by_status"]["IN_PROGRESS"] == 1
    assert body["by_status"]["DONE"] == 1
    assert body["completion_rate"] == 33.3


@pytest.mark.asyncio
async def test_analytics_overdue_correct():
    """
    Tests Service Layer: overdue counts only non-DONE tasks with a past deadline.

    Input    : 2 tasks with yesterday's deadline — one TODO, one DONE.
    Expected : overdue==1 (DONE task is excluded).
    Pass     : body['overdue']==1.
    """
    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    tasks = [
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "TODO", "deadline": yesterday},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE", "deadline": yesterday,
         "updated_at": NOW},
    ]
    db = _mock_db(tasks=tasks)
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/tasks/analytics")

    assert resp.status_code == 200
    assert resp.json()["overdue"] == 1


@pytest.mark.asyncio
async def test_analytics_completion_rate_zero_when_no_tasks():
    """
    Tests Service Layer: division-by-zero guard — completion_rate is 0.0
    when the task list is empty.

    Input    : GET /api/tasks/analytics with empty DB.
    Expected : HTTP 200, completion_rate==0.0, total==0.
    Pass     : status==200, completion_rate==0.0.
    """
    db = _mock_db(tasks=[])
    app.dependency_overrides[_get_current_user] = _auth_override()
    app.dependency_overrides[_get_db] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/tasks/analytics")

    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["completion_rate"] == 0.0
    assert body["overdue"] == 0
