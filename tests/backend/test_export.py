"""
Export Router Test Suite — FocusFlow

Tests all four export endpoints in JSON and CSV formats.
Framework: pytest + httpx + AsyncMock

Test IDs: TC-EX01 through TC-EX14

Design patterns exercised:
  Strategy  — JSON and CSV strategies tested independently.
  Facade    — endpoints tested as thin wrappers; data logic verified via output.
"""

import json
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from bson import ObjectId

from app.main import app
from app.db import get_db as get_db_dependency
from app.auth import get_current_user as get_current_user_dependency


# ── Shared fixtures ────────────────────────────────────────────────────────────

FAKE_USER_ID = str(ObjectId())
FAKE_TASK_ID = str(ObjectId())
FAKE_SESSION_ID = str(ObjectId())
FAKE_BLOCK_ID = str(ObjectId())
NOW = datetime.utcnow()

MOCK_USER = {
    "_id": ObjectId(FAKE_USER_ID),
    "name": "Export Tester",
    "email": "export@focusflow.dev",
    "password_hash": "$2b$12$fakehash",
}

MOCK_TASK_DOC = {
    "_id": ObjectId(FAKE_TASK_ID),
    "user_id": ObjectId(FAKE_USER_ID),
    "title": "Write export tests",
    "description": "Cover all endpoints",
    "priority": "HIGH",
    "deadline": "2026-04-01",
    "due_time": "09:00",
    "recurrence": "NONE",
    "estimated_minutes": 60,
    "status": "TODO",
    "subtasks": [{"title": "Draft test plan", "status": "TODO"}],
    "categories": ["backend", "testing"],
    "created_at": NOW,
    "updated_at": NOW,
}

MOCK_SESSION_DOC = {
    "_id": ObjectId(FAKE_SESSION_ID),
    "user_id": ObjectId(FAKE_USER_ID),
    "task_id": ObjectId(FAKE_TASK_ID),
    "phase": "FOCUS",
    "duration_minutes": 25,
    "completed_at": NOW,
}

MOCK_BLOCK_DOC = {
    "_id": ObjectId(FAKE_BLOCK_ID),
    "user_id": ObjectId(FAKE_USER_ID),
    "title": "Deep Work",
    "start_time": "2026-04-01T09:00",
    "end_time": "2026-04-01T10:40",
    "task_id": ObjectId(FAKE_TASK_ID),
    "color": "#6366f1",
    "recurrence": "NONE",
    "recurrence_group_id": None,
}


@pytest.fixture(autouse=True)
def _mock_db_lifecycle():
    with (
        patch("app.main.connect_db", new=AsyncMock()),
        patch("app.main.close_db",   new=AsyncMock()),
        patch("app.main.scan_deadlines", new=AsyncMock()),
        patch("app.main.start_deadline_scanner", return_value=MagicMock(shutdown=MagicMock())),
    ):
        yield


@pytest.fixture(autouse=True)
def _clear_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def _auth():
    async def _get():
        return MOCK_USER
    return _get


async def _async_iter(items):
    for item in items:
        yield item


def _make_cursor(items):
    """Build a mock Motor cursor that supports async-for and .sort()."""
    sortable = MagicMock()
    sortable.__aiter__ = lambda self: _async_iter(items).__aiter__()
    cursor = MagicMock()
    cursor.sort = MagicMock(return_value=sortable)
    cursor.__aiter__ = lambda self: _async_iter(items).__aiter__()
    return cursor


def _make_db(tasks=None, sessions=None, blocks=None):
    db = MagicMock()
    db["tasks"].find.return_value     = _make_cursor(tasks    or [])
    db["sessions"].find.return_value  = _make_cursor(sessions or [])
    db["time_blocks"].find.return_value = _make_cursor(blocks or [])
    return db


# ── TC-EX01: Export tasks JSON ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_tasks_json():
    """
    TC-EX01: GET /api/export/tasks?format=json returns JSON file.
    Input  : 1 task in DB, format=json
    Oracle : 200, Content-Type contains application/json,
             Content-Disposition has focusflow_tasks.json,
             parsed body is a list with one task whose title matches.
    Success: all conditions met.
    Failure: wrong status, wrong content type, or wrong data.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db(tasks=[MOCK_TASK_DOC])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/tasks?format=json")

    assert r.status_code == 200
    assert "application/json" in r.headers["content-type"]
    assert "focusflow_tasks.json" in r.headers["content-disposition"]
    body = json.loads(r.text)
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["title"] == "Write export tests"
    assert body[0]["priority"] == "HIGH"
    assert body[0]["categories"] == ["backend", "testing"]


# ── TC-EX02: Export tasks CSV ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_tasks_csv():
    """
    TC-EX02: GET /api/export/tasks?format=csv returns CSV file.
    Input  : 1 task in DB, format=csv
    Oracle : 200, Content-Type contains text/csv,
             Content-Disposition has focusflow_tasks.csv,
             first line is a header row containing 'title'.
    Success: all conditions met.
    Failure: wrong content type or missing header.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db(tasks=[MOCK_TASK_DOC])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/tasks?format=csv")

    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "focusflow_tasks.csv" in r.headers["content-disposition"]
    lines = r.text.strip().split("\n")
    assert len(lines) >= 2          # header + at least 1 data row
    assert "title" in lines[0]
    assert "Write export tests" in r.text


# ── TC-EX03: Export tasks — empty list ───────────────────────────────────────

@pytest.mark.asyncio
async def test_export_tasks_empty():
    """
    TC-EX03: GET /api/export/tasks with no tasks returns empty JSON array.
    Input  : no tasks in DB
    Oracle : 200, body == []
    Success: empty list returned without error.
    Failure: error raised or non-empty body.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db(tasks=[])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/tasks?format=json")

    assert r.status_code == 200
    assert json.loads(r.text) == []


# ── TC-EX04: Export sessions JSON ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_sessions_json():
    """
    TC-EX04: GET /api/export/sessions?format=json returns session list.
    Input  : 1 session in DB
    Oracle : 200, list with one session, phase=FOCUS, duration=25.
    Success: fields match MOCK_SESSION_DOC.
    Failure: wrong status or empty body.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db(sessions=[MOCK_SESSION_DOC])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/sessions?format=json")

    assert r.status_code == 200
    body = json.loads(r.text)
    assert len(body) == 1
    assert body[0]["phase"] == "FOCUS"
    assert body[0]["duration_minutes"] == 25
    assert body[0]["task_id"] == FAKE_TASK_ID


# ── TC-EX05: Export sessions CSV ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_sessions_csv():
    """
    TC-EX05: GET /api/export/sessions?format=csv returns CSV with header row.
    Input  : 1 session in DB, format=csv
    Oracle : header contains 'phase', 'duration_minutes', 'completed_at'.
    Success: all header fields present.
    Failure: missing header or wrong format.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db(sessions=[MOCK_SESSION_DOC])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/sessions?format=csv")

    assert r.status_code == 200
    header = r.text.split("\n")[0]
    assert "phase" in header
    assert "duration_minutes" in header
    assert "completed_at" in header


# ── TC-EX06: Export blocks JSON ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_blocks_json():
    """
    TC-EX06: GET /api/export/blocks?format=json returns block list.
    Input  : 1 block in DB
    Oracle : 200, block title, start_time, end_time present.
    Success: all fields match MOCK_BLOCK_DOC.
    Failure: empty body or wrong fields.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db(blocks=[MOCK_BLOCK_DOC])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/blocks?format=json")

    assert r.status_code == 200
    body = json.loads(r.text)
    assert len(body) == 1
    assert body[0]["title"] == "Deep Work"
    assert body[0]["start_time"] == "2026-04-01T09:00"
    assert body[0]["end_time"]   == "2026-04-01T10:40"
    assert body[0]["task_id"]    == FAKE_TASK_ID


# ── TC-EX07: Export all JSON ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_all_json():
    """
    TC-EX07: GET /api/export/all returns full data dump.
    Input  : 1 task, 1 session, 1 block in DB
    Oracle : 200, JSON with keys exported_at, user, tasks, sessions, blocks.
             Each list has 1 item.
    Success: all top-level keys present and counts match.
    Failure: missing keys or empty lists.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db(
        tasks=[MOCK_TASK_DOC],
        sessions=[MOCK_SESSION_DOC],
        blocks=[MOCK_BLOCK_DOC],
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/all")

    assert r.status_code == 200
    assert "focusflow_export_all.json" in r.headers["content-disposition"]
    body = json.loads(r.text)

    assert "exported_at" in body
    assert body["user"]["email"] == "export@focusflow.dev"
    assert len(body["tasks"])    == 1
    assert len(body["sessions"]) == 1
    assert len(body["blocks"])   == 1


# ── TC-EX08: Export all — empty DB ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_all_empty():
    """
    TC-EX08: GET /api/export/all with no data returns empty lists.
    Input  : no tasks, sessions, or blocks in DB
    Oracle : all three lists are empty; user info still present.
    Success: tasks/sessions/blocks all == [].
    Failure: error or missing keys.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/all")

    assert r.status_code == 200
    body = json.loads(r.text)
    assert body["tasks"]    == []
    assert body["sessions"] == []
    assert body["blocks"]   == []
    assert body["user"]["email"] == "export@focusflow.dev"


# ── TC-EX09: Unsupported format returns 400 ──────────────────────────────────

@pytest.mark.asyncio
async def test_unsupported_format_returns_400():
    """
    TC-EX09: Requesting an unsupported format returns 400.
    Input  : format=xlsx (not supported)
    Oracle : 400 with detail mentioning the bad format.
    Success: status==400, detail contains format name.
    Failure: 200 or 500.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/tasks?format=xlsx")

    assert r.status_code == 400
    assert "xlsx" in r.json()["detail"].lower()


# ── TC-EX10: Unauthenticated export returns 401 ──────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_export_returns_401():
    """
    TC-EX10: Calling export endpoints without auth returns 401.
    Input  : no Authorization header
    Oracle : 401 Unauthorized
    Success: status in {401, 403}.
    Failure: 200.
    """
    # No dependency overrides — real JWT check runs
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/tasks")

    assert r.status_code in {401, 403}


# ── TC-EX11: Invalid date format returns 400 ─────────────────────────────────

@pytest.mark.asyncio
async def test_invalid_date_filter_returns_400():
    """
    TC-EX11: Passing a malformed from_date returns 400.
    Input  : from_date="not-a-date"
    Oracle : 400 with a message about invalid date format.
    Success: status==400.
    Failure: 200 or 500.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/tasks?from_date=not-a-date")

    assert r.status_code == 400
    assert "date" in r.json()["detail"].lower()


# ── TC-EX12: CSV with multiple tasks has correct row count ───────────────────

@pytest.mark.asyncio
async def test_csv_multiple_tasks_row_count():
    """
    TC-EX12: CSV export with 3 tasks produces 4 lines (1 header + 3 data rows).
    Input  : 3 task docs
    Oracle : line count == 4
    Success: len(lines) == 4 (trailing newline accounted for).
    Failure: wrong count.
    """
    task2 = {**MOCK_TASK_DOC, "_id": ObjectId(), "title": "Task 2"}
    task3 = {**MOCK_TASK_DOC, "_id": ObjectId(), "title": "Task 3"}

    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db(
        tasks=[MOCK_TASK_DOC, task2, task3]
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/tasks?format=csv")

    assert r.status_code == 200
    lines = [l for l in r.text.split("\n") if l.strip()]
    assert len(lines) == 4   # 1 header + 3 data rows


# ── TC-EX13: Export all Content-Disposition header ───────────────────────────

@pytest.mark.asyncio
async def test_export_all_content_disposition():
    """
    TC-EX13: GET /api/export/all sets correct Content-Disposition filename.
    Oracle : filename == focusflow_export_all.json
    Success: header present with correct filename.
    Failure: missing header.
    """
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: _make_db()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/all")

    assert r.status_code == 200
    cd = r.headers.get("content-disposition", "")
    assert "focusflow_export_all.json" in cd


# ── TC-EX14: Category filter limits tasks ────────────────────────────────────

@pytest.mark.asyncio
async def test_export_tasks_category_filter_passes_query():
    """
    TC-EX14: GET /api/export/tasks?category=backend calls DB with category filter.
    Input  : category=backend
    Oracle : db["tasks"].find called with query containing categories filter.
    Success: find called with correct query.
    Failure: find called without category filter.
    """
    mock_db = _make_db(tasks=[MOCK_TASK_DOC])
    app.dependency_overrides[get_current_user_dependency] = _auth()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/export/tasks?category=backend")

    assert r.status_code == 200
    # Verify the find() call included the categories filter
    call_args = mock_db["tasks"].find.call_args
    assert call_args is not None
    query = call_args[0][0]
    assert "categories" in query
