"""
Backend Test Suite — Task Sharing (Issue #42)

Framework : pytest + httpx (AsyncClient + ASGITransport)
Strategy  : All MongoDB calls are mocked with MagicMock / AsyncMock so tests
            run without a real database.

Test oracle convention:
    Each test declares Input, Oracle, Success condition, Failure condition.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from bson import ObjectId

from app.main import app
from app.db import get_db as get_db_dependency
from app.auth import get_current_user as get_current_user_dependency

# ── Shared fixtures ──────────────────────────────────────────────────────────

OWNER_ID = str(ObjectId())
SHARED_USER_ID = str(ObjectId())
FAKE_TASK_ID = str(ObjectId())
FAKE_SHARE_ID = str(ObjectId())

NOW = datetime.utcnow()

MOCK_OWNER = {
    "_id": ObjectId(OWNER_ID),
    "name": "Task Owner",
    "email": "owner@focusflow.dev",
    "password_hash": "$2b$12$fakehash",
}

MOCK_SHARED_USER = {
    "_id": ObjectId(SHARED_USER_ID),
    "name": "Shared User",
    "email": "shared@focusflow.dev",
    "password_hash": "$2b$12$fakehash",
}

MOCK_TASK_DOC = {
    "_id": ObjectId(FAKE_TASK_ID),
    "user_id": ObjectId(OWNER_ID),
    "title": "Design API",
    "description": "Design the REST API",
    "priority": "HIGH",
    "deadline": "2026-05-01",
    "status": "TODO",
    "subtasks": [],
    "categories": ["backend"],
    "created_at": NOW,
    "updated_at": NOW,
}

MOCK_SHARE_DOC = {
    "_id": ObjectId(FAKE_SHARE_ID),
    "task_id": FAKE_TASK_ID,
    "owner_id": OWNER_ID,
    "shared_with_email": "shared@focusflow.dev",
    "shared_with_id": SHARED_USER_ID,
    "shared_with_name": "Shared User",
    "permission": "VIEW",
    "status": "ACCEPTED",
    "created_at": NOW,
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


def _auth_override(user=None):
    """Return a dependency override that injects the given user."""
    u = user or MOCK_OWNER
    async def _get_user():
        return u
    return _get_user


async def _async_iter(items):
    """Helper: async generator wrapping a list for use as a Motor cursor mock."""
    for item in items:
        yield item


def _mock_db(
    task_doc=None,
    share_docs=None,
    target_user=None,
    share_find_one=None,
):
    """Return a pre-wired mock DB instance for sharing tests.

    Uses separate MagicMock objects for each collection to avoid the
    default MagicMock.__getitem__ behaviour where all keys return the
    same child mock.
    """
    tasks_col = MagicMock()
    shares_col = MagicMock()
    users_col = MagicMock()

    # ── tasks collection ──
    tasks_col.find_one = AsyncMock(return_value=task_doc)
    tasks_col.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId(FAKE_TASK_ID))
    )
    tasks_col.find_one_and_update = AsyncMock(return_value=task_doc)

    # ── users collection ──
    users_col.find_one = AsyncMock(return_value=target_user)

    # ── task_shares collection ──
    shares = share_docs or []
    sortable = MagicMock()
    sortable.__aiter__ = lambda self: _async_iter(shares).__aiter__()
    real_cursor = MagicMock()
    real_cursor.sort = MagicMock(return_value=sortable)
    real_cursor.__aiter__ = lambda self: _async_iter(shares).__aiter__()
    shares_col.find.return_value = real_cursor

    shares_col.find_one = AsyncMock(return_value=share_find_one)
    shares_col.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId(FAKE_SHARE_ID))
    )
    shares_col.find_one_and_update = AsyncMock(return_value=share_find_one)
    shares_col.delete_one = AsyncMock(
        return_value=MagicMock(deleted_count=1)
    )

    # Wire collections into db via side_effect so each key gets its own mock
    collections = {"tasks": tasks_col, "task_shares": shares_col, "users": users_col}
    db = MagicMock()
    db.__getitem__ = MagicMock(side_effect=lambda key: collections[key])

    return db


# ── TC-S01: Share a task successfully ────────────────────────────────────────

@pytest.mark.asyncio
async def test_share_task_success():
    """
    TC-S01: POST /api/sharing — share a task with a registered user.
    Input  : Owner JWT, task_id, target email of existing user.
    Oracle : 201 with share response containing correct fields.
    Success: status==201, shared_with_email matches, permission matches.
    Failure: non-201 or missing fields.
    """
    db = _mock_db(
        task_doc=MOCK_TASK_DOC,
        target_user=MOCK_SHARED_USER,
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/sharing", json={
            "task_id": FAKE_TASK_ID,
            "email": "shared@focusflow.dev",
            "permission": "VIEW",
        })

    assert r.status_code == 201
    body = r.json()
    assert body["shared_with_email"] == "shared@focusflow.dev"
    assert body["permission"] == "VIEW"
    assert body["status"] == "ACCEPTED"
    assert body["task_id"] == FAKE_TASK_ID


# ── TC-S02: Share with non-existent email → pending ─────────────────────────

@pytest.mark.asyncio
async def test_share_task_pending_for_unknown_email():
    """
    TC-S02: POST /api/sharing with an email not in the users collection.
    Input  : Owner JWT, valid task_id, unknown email.
    Oracle : 201 with status=PENDING and shared_with_id=None.
    Success: status==201, share status==PENDING.
    Failure: 404 or shared_with_id populated.
    """
    db = _mock_db(
        task_doc=MOCK_TASK_DOC,
        target_user=None,  # email not found
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/sharing", json={
            "task_id": FAKE_TASK_ID,
            "email": "unknown@example.com",
            "permission": "EDIT",
        })

    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "PENDING"
    assert body["shared_with_id"] is None


# ── TC-S03: Cannot share with yourself ───────────────────────────────────────

@pytest.mark.asyncio
async def test_share_task_with_self_returns_400():
    """
    TC-S03: POST /api/sharing with the owner's own email.
    Input  : Owner JWT, own email.
    Oracle : 400 Bad Request.
    Success: status==400.
    Failure: 201 (share created with self).
    """
    db = _mock_db(task_doc=MOCK_TASK_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/sharing", json={
            "task_id": FAKE_TASK_ID,
            "email": "owner@focusflow.dev",
            "permission": "VIEW",
        })

    assert r.status_code == 400
    assert "yourself" in r.json()["detail"].lower()


# ── TC-S04: Duplicate share → 409 ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_share_task_duplicate_returns_409():
    """
    TC-S04: POST /api/sharing when a share already exists for that email+task.
    Input  : Owner JWT, task_id, email that already has a share.
    Oracle : 409 Conflict.
    Success: status==409.
    Failure: 201 (duplicate share created).
    """
    db = _mock_db(
        task_doc=MOCK_TASK_DOC,
        share_find_one=MOCK_SHARE_DOC,  # existing share found
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/sharing", json={
            "task_id": FAKE_TASK_ID,
            "email": "shared@focusflow.dev",
            "permission": "VIEW",
        })

    assert r.status_code == 409
    assert "already shared" in r.json()["detail"].lower()


# ── TC-S05: Share task not owned → 404 ──────────────────────────────────────

@pytest.mark.asyncio
async def test_share_task_not_owned_returns_404():
    """
    TC-S05: POST /api/sharing for a task the user does not own.
    Input  : Non-owner JWT, task_id belonging to another user.
    Oracle : 404 Not Found.
    Success: status==404.
    Failure: 201.
    """
    db = _mock_db(task_doc=None)  # task not found for this user
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_SHARED_USER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/sharing", json={
            "task_id": FAKE_TASK_ID,
            "email": "someone@example.com",
            "permission": "VIEW",
        })

    assert r.status_code == 404


# ── TC-S06: List shares for a task ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_shares_for_task():
    """
    TC-S06: GET /api/sharing/task/{task_id} — owner sees all shares.
    Input  : Owner JWT, task with one share.
    Oracle : 200 with list of 1 share.
    Success: status==200, length==1, email matches.
    Failure: empty list or 404.
    """
    db = _mock_db(
        task_doc=MOCK_TASK_DOC,
        share_docs=[MOCK_SHARE_DOC],
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/sharing/task/{FAKE_TASK_ID}")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["shared_with_email"] == "shared@focusflow.dev"


# ── TC-S07: Shared-with-me returns shared tasks ─────────────────────────────

@pytest.mark.asyncio
async def test_shared_with_me_returns_tasks():
    """
    TC-S07: GET /api/sharing/shared-with-me — returns tasks shared with user.
    Input  : Shared user JWT, one task shared with them.
    Oracle : 200 with list of 1 SharedTaskInfo.
    Success: status==200, length==1, task_title matches.
    Failure: empty list.
    """
    db = _mock_db(
        task_doc=MOCK_TASK_DOC,
        share_docs=[MOCK_SHARE_DOC],
    )
    # Also mock the owner lookup for SharedTaskInfo
    db["users"].find_one = AsyncMock(return_value=MOCK_OWNER)

    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_SHARED_USER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/sharing/shared-with-me")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["task_title"] == "Design API"
    assert data[0]["permission"] == "VIEW"


# ── TC-S08: Revoke share successfully ────────────────────────────────────────

@pytest.mark.asyncio
async def test_revoke_share_success():
    """
    TC-S08: DELETE /api/sharing/{share_id} — owner revokes a share.
    Input  : Owner JWT, existing share_id.
    Oracle : 204 No Content.
    Success: status==204.
    Failure: 404 or 403.
    """
    db = _mock_db(share_find_one=MOCK_SHARE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/sharing/{FAKE_SHARE_ID}")

    assert r.status_code == 204


# ── TC-S09: Non-owner cannot revoke → 403 ───────────────────────────────────

@pytest.mark.asyncio
async def test_revoke_share_non_owner_returns_403():
    """
    TC-S09: DELETE /api/sharing/{share_id} by a non-owner.
    Input  : Shared user JWT (not the task owner), existing share_id.
    Oracle : 403 Forbidden.
    Success: status==403.
    Failure: 204 (share revoked by non-owner).
    """
    db = _mock_db(share_find_one=MOCK_SHARE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_SHARED_USER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/sharing/{FAKE_SHARE_ID}")

    assert r.status_code == 403


# ── TC-S10: Update share permission ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_share_permission():
    """
    TC-S10: PUT /api/sharing/{share_id} — owner changes VIEW to EDIT.
    Input  : Owner JWT, share_id, {permission: EDIT}.
    Oracle : 200 with permission updated to EDIT.
    Success: status==200, permission==EDIT.
    Failure: permission unchanged or 403.
    """
    updated_share = {**MOCK_SHARE_DOC, "permission": "EDIT"}
    db = _mock_db(share_find_one=MOCK_SHARE_DOC)
    db["task_shares"].find_one_and_update = AsyncMock(return_value=updated_share)

    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.put(f"/api/sharing/{FAKE_SHARE_ID}", json={
            "permission": "EDIT",
        })

    assert r.status_code == 200
    assert r.json()["permission"] == "EDIT"


# ── TC-S11: Unauthenticated access → 401/403 ───────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_sharing_returns_401():
    """
    TC-S11: GET /api/sharing/shared-with-me without a token.
    Oracle : 401 or 403.
    Success: status in {401, 403}.
    Failure: 200.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/sharing/shared-with-me")

    assert r.status_code in {401, 403}
