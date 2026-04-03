"""
Notifications Test Suite — FocusFlow

Tests the notification router endpoints and deadline scanner logic.
Framework: pytest + httpx + AsyncMock

Test IDs: TC-N01 through TC-N12
"""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
from bson import ObjectId

from app.main import app
from app.db import get_db as get_db_dependency
from app.auth import get_current_user as get_current_user_dependency


@pytest.fixture(autouse=True)
def _mock_db_lifecycle():
    with patch("app.main.connect_db", new=AsyncMock()), \
         patch("app.main.close_db", new=AsyncMock()), \
         patch("app.main.scan_deadlines", new=AsyncMock()), \
         patch("app.main.start_deadline_scanner", return_value=MagicMock(shutdown=MagicMock())):
        yield


@pytest.fixture(autouse=True)
def _clear_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


FAKE_USER_ID = str(ObjectId())
FAKE_NOTIF_ID = str(ObjectId())

MOCK_USER = {
    "_id": ObjectId(FAKE_USER_ID),
    "name": "Test User",
    "email": "test@focusflow.dev",
    "password_hash": "$2b$12$fakehash",
}


def _override_user():
    async def _get():
        return MOCK_USER
    return _get


def get_auth_header():
    from app.auth import create_access_token
    token = create_access_token({"sub": FAKE_USER_ID})
    return {"Authorization": f"Bearer {token}"}


def _make_notif(read=False, ntype="DEADLINE_24H", task_title="Test Task"):
    return {
        "_id": ObjectId(),
        "user_id": FAKE_USER_ID,
        "task_id": str(ObjectId()),
        "task_title": task_title,
        "type": ntype,
        "message": f'"{task_title}" — Due in 24 hours',
        "read": read,
        "created_at": datetime.utcnow(),
    }


# ── TC-N01: List notifications ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_notifications():
    """
    TC-N01: GET /notifications/ returns notifications for the user.
    Oracle: 200 with a list of notifications
    """
    notifs = [_make_notif(), _make_notif(read=True, ntype="OVERDUE")]

    mock_db = MagicMock()

    class MockCursor:
        def sort(self, *a, **kw): return self
        def limit(self, *a, **kw): return self
        async def __aiter__(self_inner):
            for n in notifs:
                yield n

    mock_db["notifications"].find = MagicMock(return_value=MockCursor())

    app.dependency_overrides[get_current_user_dependency] = _override_user()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/notifications/", headers=get_auth_header())

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


# ── TC-N02: Unread count ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unread_count():
    """
    TC-N02: GET /notifications/count returns unread count.
    Oracle: 200 with {"count": N}
    """
    mock_db = MagicMock()
    mock_db["notifications"].count_documents = AsyncMock(return_value=3)

    app.dependency_overrides[get_current_user_dependency] = _override_user()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/notifications/count", headers=get_auth_header())

    assert resp.status_code == 200
    assert resp.json()["count"] == 3


# ── TC-N03: Mark single notification read ────────────────────────────────────

@pytest.mark.asyncio
async def test_mark_read():
    """
    TC-N03: PATCH /notifications/{id}/read marks it as read.
    Oracle: 200 with {"status": "read"}
    """
    mock_db = MagicMock()
    mock_db["notifications"].update_one = AsyncMock(
        return_value=MagicMock(modified_count=1)
    )

    app.dependency_overrides[get_current_user_dependency] = _override_user()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.patch(
            f"/api/notifications/{FAKE_NOTIF_ID}/read",
            headers=get_auth_header(),
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "read"


# ── TC-N04: Mark read — not found ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_mark_read_not_found():
    """
    TC-N04: PATCH /notifications/{id}/read for nonexistent ID.
    Oracle: 404
    """
    mock_db = MagicMock()
    mock_db["notifications"].update_one = AsyncMock(
        return_value=MagicMock(modified_count=0)
    )

    app.dependency_overrides[get_current_user_dependency] = _override_user()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.patch(
            f"/api/notifications/{FAKE_NOTIF_ID}/read",
            headers=get_auth_header(),
        )

    assert resp.status_code == 404


# ── TC-N05: Mark all read ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mark_all_read():
    """
    TC-N05: PATCH /notifications/read-all marks all as read.
    Oracle: 200 with {"updated": N}
    """
    mock_db = MagicMock()
    mock_db["notifications"].update_many = AsyncMock(
        return_value=MagicMock(modified_count=5)
    )

    app.dependency_overrides[get_current_user_dependency] = _override_user()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.patch("/api/notifications/read-all", headers=get_auth_header())

    assert resp.status_code == 200
    assert resp.json()["updated"] == 5


# ── TC-N06: Delete notification ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_notification():
    """
    TC-N06: DELETE /notifications/{id} removes it.
    Oracle: 204 No Content
    """
    mock_db = MagicMock()
    mock_db["notifications"].delete_one = AsyncMock(
        return_value=MagicMock(deleted_count=1)
    )

    app.dependency_overrides[get_current_user_dependency] = _override_user()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete(
            f"/api/notifications/{FAKE_NOTIF_ID}",
            headers=get_auth_header(),
        )

    assert resp.status_code == 204


# ── TC-N07: Delete notification — not found ──────────────────────────────────

@pytest.mark.asyncio
async def test_delete_not_found():
    """
    TC-N07: DELETE /notifications/{id} for nonexistent ID.
    Oracle: 404
    """
    mock_db = MagicMock()
    mock_db["notifications"].delete_one = AsyncMock(
        return_value=MagicMock(deleted_count=0)
    )

    app.dependency_overrides[get_current_user_dependency] = _override_user()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete(
            f"/api/notifications/{FAKE_NOTIF_ID}",
            headers=get_auth_header(),
        )

    assert resp.status_code == 404


# ── TC-N08: Unauthenticated returns 401 ─────────────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_returns_401():
    """
    TC-N08: Notifications endpoints without auth token.
    Oracle: 401
    """
    mock_db = MagicMock()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/notifications/")

    assert resp.status_code == 401


# ── TC-N09: Scanner creates 24h notification ─────────────────────────────────

@pytest.mark.asyncio
async def test_scanner_creates_24h_notification():
    """
    TC-N09: Deadline scanner creates a DEADLINE_24H notification
    for a task due in 12 hours.
    """
    from app.notifications.scanner import scan_deadlines

    now = datetime.utcnow()
    deadline = now + timedelta(hours=12)

    task = {
        "_id": ObjectId(),
        "user_id": FAKE_USER_ID,
        "title": "Submit report",
        "status": "TODO",
        "deadline": deadline.strftime("%Y-%m-%d"),
        "due_time": deadline.strftime("%H:%M"),
    }

    mock_db = MagicMock()

    # Mock tasks cursor
    async def async_tasks():
        yield task
    mock_db["tasks"].find = MagicMock(return_value=async_tasks())

    # Mock notifications collection
    mock_db["notifications"].find_one = AsyncMock(return_value=None)  # no existing
    mock_db["notifications"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId())
    )

    with patch("app.notifications.scanner.ws_manager") as mock_ws:
        mock_ws.send_to_user = AsyncMock()
        await scan_deadlines(mock_db)

    # Should have inserted a notification
    mock_db["notifications"].insert_one.assert_called()
    call_args = mock_db["notifications"].insert_one.call_args[0][0]
    assert call_args["type"] == "DEADLINE_24H"
    assert call_args["user_id"] == FAKE_USER_ID


# ── TC-N10: Scanner creates overdue notification ─────────────────────────────

@pytest.mark.asyncio
async def test_scanner_creates_overdue_notification():
    """
    TC-N10: Deadline scanner creates an OVERDUE notification
    for a task past its deadline.
    """
    from app.notifications.scanner import scan_deadlines

    yesterday = datetime.utcnow() - timedelta(days=1)

    task = {
        "_id": ObjectId(),
        "user_id": FAKE_USER_ID,
        "title": "Overdue task",
        "status": "IN_PROGRESS",
        "deadline": yesterday.strftime("%Y-%m-%d"),
    }

    mock_db = MagicMock()

    async def async_tasks():
        yield task
    mock_db["tasks"].find = MagicMock(return_value=async_tasks())
    mock_db["notifications"].find_one = AsyncMock(return_value=None)
    mock_db["notifications"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId())
    )

    with patch("app.notifications.scanner.ws_manager") as mock_ws:
        mock_ws.send_to_user = AsyncMock()
        await scan_deadlines(mock_db)

    mock_db["notifications"].insert_one.assert_called()
    call_args = mock_db["notifications"].insert_one.call_args[0][0]
    assert call_args["type"] == "OVERDUE"


# ── TC-N11: Scanner skips completed tasks ────────────────────────────────────

@pytest.mark.asyncio
async def test_scanner_skips_done_tasks():
    """
    TC-N11: Scanner query filters out DONE tasks.
    The mock cursor returns no tasks, so no notifications are created.
    """
    from app.notifications.scanner import scan_deadlines

    mock_db = MagicMock()

    async def empty_cursor():
        return
        yield  # make it an async generator

    mock_db["tasks"].find = MagicMock(return_value=empty_cursor())
    mock_db["notifications"].insert_one = AsyncMock()

    with patch("app.notifications.scanner.ws_manager") as mock_ws:
        mock_ws.send_to_user = AsyncMock()
        await scan_deadlines(mock_db)

    mock_db["notifications"].insert_one.assert_not_called()


# ── TC-N12: Scanner dedup — skips existing notification ──────────────────────

@pytest.mark.asyncio
async def test_scanner_dedup_skips_existing():
    """
    TC-N12: Scanner does not create a duplicate notification when one
    already exists for the same (user_id, task_id, type).
    """
    from app.notifications.scanner import scan_deadlines

    now = datetime.utcnow()
    deadline = now + timedelta(hours=6)

    task = {
        "_id": ObjectId(),
        "user_id": FAKE_USER_ID,
        "title": "Already notified",
        "status": "TODO",
        "deadline": deadline.strftime("%Y-%m-%d"),
        "due_time": deadline.strftime("%H:%M"),
    }

    mock_db = MagicMock()

    async def async_tasks():
        yield task
    mock_db["tasks"].find = MagicMock(return_value=async_tasks())

    # Simulate existing notification — find_one returns a doc
    mock_db["notifications"].find_one = AsyncMock(return_value={"_id": ObjectId()})
    mock_db["notifications"].insert_one = AsyncMock()

    with patch("app.notifications.scanner.ws_manager") as mock_ws:
        mock_ws.send_to_user = AsyncMock()
        await scan_deadlines(mock_db)

    # Should NOT have inserted a new notification
    mock_db["notifications"].insert_one.assert_not_called()
