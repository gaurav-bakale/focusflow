"""
Backend Test Suite — Activity Feed (Issue #42)

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
OTHER_USER_ID = str(ObjectId())
FAKE_TASK_ID = str(ObjectId())
FAKE_WORKSPACE_ID = str(ObjectId())
FAKE_ACTIVITY_ID = str(ObjectId())

NOW = datetime.utcnow()

MOCK_OWNER = {
    "_id": ObjectId(OWNER_ID),
    "name": "Task Owner",
    "email": "owner@focusflow.dev",
}

MOCK_SHARED_USER = {
    "_id": ObjectId(SHARED_USER_ID),
    "name": "Shared User",
    "email": "shared@focusflow.dev",
}

MOCK_OTHER_USER = {
    "_id": ObjectId(OTHER_USER_ID),
    "name": "Other User",
    "email": "other@focusflow.dev",
}

MOCK_TASK_DOC = {
    "_id": ObjectId(FAKE_TASK_ID),
    "user_id": ObjectId(OWNER_ID),
    "title": "Design API",
    "status": "TODO",
    "priority": "HIGH",
    "created_at": NOW,
    "updated_at": NOW,
}

MOCK_WORKSPACE_DOC = {
    "_id": ObjectId(FAKE_WORKSPACE_ID),
    "name": "Sprint 1",
    "owner_id": OWNER_ID,
    "owner_name": "Task Owner",
    "created_at": NOW,
    "updated_at": NOW,
}

MOCK_SHARE_DOC = {
    "task_id": FAKE_TASK_ID,
    "shared_with_id": SHARED_USER_ID,
    "permission": "VIEW",
    "status": "ACCEPTED",
}

MOCK_MEMBER_DOC = {
    "workspace_id": FAKE_WORKSPACE_ID,
    "user_id": SHARED_USER_ID,
    "user_name": "Shared User",
    "role": "MEMBER",
    "joined_at": NOW,
}

MOCK_ACTIVITY_DOC = {
    "_id": ObjectId(FAKE_ACTIVITY_ID),
    "action": "TASK_SHARED",
    "actor_id": OWNER_ID,
    "actor_name": "Task Owner",
    "target_type": "task",
    "target_id": FAKE_TASK_ID,
    "target_title": "Design API",
    "detail": "Shared with shared@focusflow.dev",
    "task_id": FAKE_TASK_ID,
    "workspace_id": None,
    "created_at": NOW,
}

MOCK_WORKSPACE_ACTIVITY_DOC = {
    "_id": ObjectId(),
    "action": "MEMBER_ADDED",
    "actor_id": OWNER_ID,
    "actor_name": "Task Owner",
    "target_type": "workspace",
    "target_id": FAKE_WORKSPACE_ID,
    "target_title": "Sprint 1",
    "detail": "Added Shared User",
    "task_id": None,
    "workspace_id": FAKE_WORKSPACE_ID,
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
    u = user or MOCK_OWNER
    async def _get_user():
        return u
    return _get_user


async def _async_iter(items):
    for item in items:
        yield item


def _mock_db(
    task_doc=None,
    workspace_doc=None,
    share_find_one=None,
    member_find_one=None,
    activity_docs=None,
):
    """Return a pre-wired mock DB with separate collection mocks."""
    tasks_col = MagicMock()
    workspaces_col = MagicMock()
    shares_col = MagicMock()
    members_col = MagicMock()
    activities_col = MagicMock()

    # ── tasks collection ──
    tasks_col.find_one = AsyncMock(return_value=task_doc)

    # ── workspaces collection ──
    workspaces_col.find_one = AsyncMock(return_value=workspace_doc)

    # ── task_shares collection ──
    shares_col.find_one = AsyncMock(return_value=share_find_one)

    # ── workspace_members collection ──
    members_col.find_one = AsyncMock(return_value=member_find_one)

    # ── activities collection ──
    items = activity_docs or []
    limitedable = MagicMock()
    limitedable.__aiter__ = lambda self: _async_iter(items).__aiter__()
    sortable = MagicMock()
    sortable.sort = MagicMock(return_value=sortable)
    sortable.limit = MagicMock(return_value=limitedable)
    sortable.__aiter__ = lambda self: _async_iter(items).__aiter__()
    activities_col.find = MagicMock(return_value=sortable)

    activities_col.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId(FAKE_ACTIVITY_ID))
    )

    collections = {
        "tasks": tasks_col,
        "workspaces": workspaces_col,
        "task_shares": shares_col,
        "workspace_members": members_col,
        "activities": activities_col,
    }
    db = MagicMock()
    db.__getitem__ = MagicMock(side_effect=lambda key: collections[key])
    return db


# ── TC-A01: Log activity event ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_log_activity():
    """
    TC-A01: POST /api/activity/log — log an activity event.
    Input  : Owner JWT, activity data.
    Oracle : 201 with activity response.
    Success: status==201, action matches, actor matches.
    Failure: non-201.
    """
    db = _mock_db()
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/activity/log", json={
            "action": "TASK_SHARED",
            "actor_id": OWNER_ID,
            "actor_name": "Task Owner",
            "target_type": "task",
            "target_id": FAKE_TASK_ID,
            "target_title": "Design API",
            "detail": "Shared with shared@focusflow.dev",
            "task_id": FAKE_TASK_ID,
        })

    assert r.status_code == 201
    body = r.json()
    assert body["action"] == "TASK_SHARED"
    assert body["actor_id"] == OWNER_ID
    assert body["target_type"] == "task"


# ── TC-A02: Get task activity — as owner ───────────────────────────────────

@pytest.mark.asyncio
async def test_get_task_activity_as_owner():
    """
    TC-A02: GET /api/activity/task/{task_id} — owner views task feed.
    Input  : Owner JWT, task with 1 activity entry.
    Oracle : 200 with list of 1 activity.
    Success: status==200, length==1, action matches.
    Failure: 404 or empty list.
    """
    db = _mock_db(
        task_doc=MOCK_TASK_DOC,
        activity_docs=[MOCK_ACTIVITY_DOC],
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/activity/task/{FAKE_TASK_ID}")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["action"] == "TASK_SHARED"


# ── TC-A03: Get task activity — as shared user ─────────────────────────────

@pytest.mark.asyncio
async def test_get_task_activity_as_shared_user():
    """
    TC-A03: GET /api/activity/task/{task_id} — shared user views task feed.
    Input  : Shared user JWT, accepted share.
    Oracle : 200.
    Success: status==200.
    Failure: 404.
    """
    db = _mock_db(
        task_doc=MOCK_TASK_DOC,
        share_find_one=MOCK_SHARE_DOC,
        activity_docs=[MOCK_ACTIVITY_DOC],
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_SHARED_USER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/activity/task/{FAKE_TASK_ID}")

    assert r.status_code == 200
    assert len(r.json()) == 1


# ── TC-A04: Get task activity — no access → 404 ───────────────────────────

@pytest.mark.asyncio
async def test_get_task_activity_no_access_returns_404():
    """
    TC-A04: GET /api/activity/task/{task_id} — user with no access.
    Input  : Other user JWT, no share.
    Oracle : 404.
    Success: status==404.
    Failure: 200.
    """
    db = _mock_db(task_doc=MOCK_TASK_DOC, share_find_one=None)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OTHER_USER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/activity/task/{FAKE_TASK_ID}")

    assert r.status_code == 404


# ── TC-A05: Get task activity — task not found → 404 ──────────────────────

@pytest.mark.asyncio
async def test_get_task_activity_task_not_found():
    """
    TC-A05: GET /api/activity/task/{task_id} — task does not exist.
    Input  : Owner JWT, nonexistent task_id.
    Oracle : 404.
    Success: status==404.
    Failure: 200.
    """
    db = _mock_db(task_doc=None)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/activity/task/{FAKE_TASK_ID}")

    assert r.status_code == 404


# ── TC-A06: Get workspace activity — as owner ─────────────────────────────

@pytest.mark.asyncio
async def test_get_workspace_activity_as_owner():
    """
    TC-A06: GET /api/activity/workspace/{id} — owner views workspace feed.
    Input  : Owner JWT, workspace with 1 activity entry.
    Oracle : 200 with list of 1 activity.
    Success: status==200, length==1.
    Failure: 404 or empty list.
    """
    db = _mock_db(
        workspace_doc=MOCK_WORKSPACE_DOC,
        activity_docs=[MOCK_WORKSPACE_ACTIVITY_DOC],
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/activity/workspace/{FAKE_WORKSPACE_ID}")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["action"] == "MEMBER_ADDED"


# ── TC-A07: Get workspace activity — as member ────────────────────────────

@pytest.mark.asyncio
async def test_get_workspace_activity_as_member():
    """
    TC-A07: GET /api/activity/workspace/{id} — member views workspace feed.
    Input  : Member JWT, workspace membership.
    Oracle : 200.
    Success: status==200.
    Failure: 404.
    """
    db = _mock_db(
        workspace_doc=MOCK_WORKSPACE_DOC,
        member_find_one=MOCK_MEMBER_DOC,
        activity_docs=[MOCK_WORKSPACE_ACTIVITY_DOC],
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_SHARED_USER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/activity/workspace/{FAKE_WORKSPACE_ID}")

    assert r.status_code == 200
    assert len(r.json()) == 1


# ── TC-A08: Get workspace activity — no access → 404 ──────────────────────

@pytest.mark.asyncio
async def test_get_workspace_activity_no_access_returns_404():
    """
    TC-A08: GET /api/activity/workspace/{id} — non-member.
    Input  : Other user JWT, no membership.
    Oracle : 404.
    Success: status==404.
    Failure: 200.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC, member_find_one=None)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OTHER_USER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/activity/workspace/{FAKE_WORKSPACE_ID}")

    assert r.status_code == 404


# ── TC-A09: Get personal activity feed ─────────────────────────────────────

@pytest.mark.asyncio
async def test_get_my_activity():
    """
    TC-A09: GET /api/activity/me — personal activity feed.
    Input  : Owner JWT with 1 activity entry.
    Oracle : 200 with list of 1 activity.
    Success: status==200, length==1.
    Failure: empty list.
    """
    db = _mock_db(activity_docs=[MOCK_ACTIVITY_DOC])
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/activity/me")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["actor_id"] == OWNER_ID


# ── TC-A10: Activity feed with limit parameter ────────────────────────────

@pytest.mark.asyncio
async def test_activity_feed_with_limit():
    """
    TC-A10: GET /api/activity/me?limit=10 — respects limit parameter.
    Input  : Owner JWT, limit=10.
    Oracle : 200.
    Success: status==200.
    Failure: 422.
    """
    db = _mock_db(activity_docs=[])
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/activity/me?limit=10")

    assert r.status_code == 200


# ── TC-A11: Unauthenticated access → 401/403 ──────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_activity_returns_401():
    """
    TC-A11: GET /api/activity/me without a token.
    Oracle : 401 or 403.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/activity/me")

    assert r.status_code in {401, 403}


# ── TC-A12: Invalid action in log → 422 ───────────────────────────────────

@pytest.mark.asyncio
async def test_log_activity_invalid_action_returns_422():
    """
    TC-A12: POST /api/activity/log with invalid action value.
    Input  : Owner JWT, action="INVALID_ACTION".
    Oracle : 422 Unprocessable Entity.
    Success: status==422.
    Failure: 201.
    """
    db = _mock_db()
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/activity/log", json={
            "action": "INVALID_ACTION",
            "actor_id": OWNER_ID,
            "actor_name": "Task Owner",
            "target_type": "task",
            "target_id": FAKE_TASK_ID,
        })

    assert r.status_code == 422
