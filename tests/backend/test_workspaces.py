"""
Backend Test Suite — Workspaces (Issue #42)

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
MEMBER_ID = str(ObjectId())
OTHER_USER_ID = str(ObjectId())
FAKE_WORKSPACE_ID = str(ObjectId())

NOW = datetime.utcnow()

MOCK_OWNER = {
    "_id": ObjectId(OWNER_ID),
    "name": "Workspace Owner",
    "email": "owner@focusflow.dev",
}

MOCK_MEMBER = {
    "_id": ObjectId(MEMBER_ID),
    "name": "Team Member",
    "email": "member@focusflow.dev",
}

MOCK_OTHER_USER = {
    "_id": ObjectId(OTHER_USER_ID),
    "name": "Other User",
    "email": "other@focusflow.dev",
}

MOCK_WORKSPACE_DOC = {
    "_id": ObjectId(FAKE_WORKSPACE_ID),
    "name": "Sprint 1",
    "description": "Sprint 1 tasks",
    "owner_id": OWNER_ID,
    "owner_name": "Workspace Owner",
    "created_at": NOW,
    "updated_at": NOW,
}

MOCK_OWNER_MEMBER_DOC = {
    "workspace_id": FAKE_WORKSPACE_ID,
    "user_id": OWNER_ID,
    "user_name": "Workspace Owner",
    "email": "owner@focusflow.dev",
    "role": "OWNER",
    "joined_at": NOW,
}

MOCK_MEMBER_DOC = {
    "workspace_id": FAKE_WORKSPACE_ID,
    "user_id": MEMBER_ID,
    "user_name": "Team Member",
    "email": "member@focusflow.dev",
    "role": "MEMBER",
    "joined_at": NOW,
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
    workspace_doc=None,
    workspace_find_one_and_update=None,
    member_docs=None,
    member_find_one=None,
    user_find_one=None,
):
    """Return a pre-wired mock DB with separate collection mocks."""
    workspaces_col = MagicMock()
    members_col = MagicMock()
    users_col = MagicMock()

    # ── workspaces collection ──
    workspaces_col.find_one = AsyncMock(return_value=workspace_doc)
    workspaces_col.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId(FAKE_WORKSPACE_ID))
    )
    workspaces_col.find_one_and_update = AsyncMock(
        return_value=workspace_find_one_and_update or workspace_doc
    )
    workspaces_col.delete_one = AsyncMock(
        return_value=MagicMock(deleted_count=1)
    )

    # ── workspace_members collection ──
    members = member_docs or []
    sortable = MagicMock()
    sortable.__aiter__ = lambda self: _async_iter(members).__aiter__()
    real_cursor = MagicMock()
    real_cursor.sort = MagicMock(return_value=sortable)
    real_cursor.__aiter__ = lambda self: _async_iter(members).__aiter__()
    members_col.find = MagicMock(return_value=real_cursor)

    members_col.find_one = AsyncMock(return_value=member_find_one)
    members_col.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId())
    )
    members_col.delete_one = AsyncMock(
        return_value=MagicMock(deleted_count=1)
    )
    members_col.delete_many = AsyncMock(
        return_value=MagicMock(deleted_count=1)
    )

    # ── users collection ──
    users_col.find_one = AsyncMock(return_value=user_find_one)

    collections = {
        "workspaces": workspaces_col,
        "workspace_members": members_col,
        "users": users_col,
    }
    db = MagicMock()
    db.__getitem__ = MagicMock(side_effect=lambda key: collections[key])
    return db


# ── TC-W01: Create workspace ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_workspace():
    """
    TC-W01: POST /api/workspaces — owner creates a workspace.
    Input  : Owner JWT, workspace name and description.
    Oracle : 201 with workspace response including owner as member.
    Success: status==201, name matches, owner_id matches.
    Failure: non-201 or missing fields.
    """
    db = _mock_db(member_docs=[MOCK_OWNER_MEMBER_DOC])
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/workspaces", json={
            "name": "Sprint 1",
            "description": "Sprint 1 tasks",
        })

    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Sprint 1"
    assert body["owner_id"] == OWNER_ID
    assert body["owner_name"] == "Workspace Owner"
    assert len(body["members"]) == 1
    assert body["members"][0]["role"] == "OWNER"


# ── TC-W02: List workspaces ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_workspaces():
    """
    TC-W02: GET /api/workspaces — list workspaces user is member of.
    Input  : Owner JWT with one workspace.
    Oracle : 200 with list of 1 workspace.
    Success: status==200, length==1.
    Failure: empty list or 404.
    """
    db = _mock_db(
        workspace_doc=MOCK_WORKSPACE_DOC,
        member_docs=[MOCK_OWNER_MEMBER_DOC],
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/workspaces")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["name"] == "Sprint 1"


# ── TC-W03: Get workspace details ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_workspace():
    """
    TC-W03: GET /api/workspaces/{id} — fetch workspace by ID.
    Input  : Owner JWT, valid workspace ID.
    Oracle : 200 with workspace details.
    Success: status==200, name matches.
    Failure: 404.
    """
    db = _mock_db(
        workspace_doc=MOCK_WORKSPACE_DOC,
        member_docs=[MOCK_OWNER_MEMBER_DOC],
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/workspaces/{FAKE_WORKSPACE_ID}")

    assert r.status_code == 200
    assert r.json()["name"] == "Sprint 1"


# ── TC-W04: Get workspace — no access → 404 ────────────────────────────────

@pytest.mark.asyncio
async def test_get_workspace_no_access_returns_404():
    """
    TC-W04: GET /api/workspaces/{id} — non-member access.
    Input  : Other user JWT, valid workspace ID.
    Oracle : 404.
    Success: status==404.
    Failure: 200.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC, member_find_one=None)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OTHER_USER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/workspaces/{FAKE_WORKSPACE_ID}")

    assert r.status_code == 404


# ── TC-W05: Update workspace ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_workspace():
    """
    TC-W05: PUT /api/workspaces/{id} — owner updates metadata.
    Input  : Owner JWT, new name.
    Oracle : 200 with updated name.
    Success: status==200, name updated.
    Failure: 403 or name unchanged.
    """
    updated_doc = {**MOCK_WORKSPACE_DOC, "name": "Sprint 2"}
    db = _mock_db(
        workspace_doc=MOCK_WORKSPACE_DOC,
        workspace_find_one_and_update=updated_doc,
        member_docs=[MOCK_OWNER_MEMBER_DOC],
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.put(f"/api/workspaces/{FAKE_WORKSPACE_ID}", json={
            "name": "Sprint 2",
        })

    assert r.status_code == 200
    assert r.json()["name"] == "Sprint 2"


# ── TC-W06: Update workspace — non-owner → 403 ────────────────────────────

@pytest.mark.asyncio
async def test_update_workspace_non_owner_returns_403():
    """
    TC-W06: PUT /api/workspaces/{id} — non-owner tries to update.
    Input  : Member JWT, workspace ID.
    Oracle : 403.
    Success: status==403.
    Failure: 200.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_MEMBER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.put(f"/api/workspaces/{FAKE_WORKSPACE_ID}", json={
            "name": "Hacked",
        })

    assert r.status_code == 403


# ── TC-W07: Delete workspace ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_workspace():
    """
    TC-W07: DELETE /api/workspaces/{id} — owner deletes workspace.
    Input  : Owner JWT, workspace ID.
    Oracle : 204 No Content.
    Success: status==204.
    Failure: 403 or 404.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/workspaces/{FAKE_WORKSPACE_ID}")

    assert r.status_code == 204


# ── TC-W08: Delete workspace — non-owner → 403 ────────────────────────────

@pytest.mark.asyncio
async def test_delete_workspace_non_owner_returns_403():
    """
    TC-W08: DELETE /api/workspaces/{id} — non-owner tries to delete.
    Input  : Member JWT, workspace ID.
    Oracle : 403.
    Success: status==403.
    Failure: 204.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_MEMBER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/workspaces/{FAKE_WORKSPACE_ID}")

    assert r.status_code == 403


# ── TC-W09: Add member ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_member():
    """
    TC-W09: POST /api/workspaces/{id}/members — owner adds a member.
    Input  : Owner JWT, member email, MEMBER role.
    Oracle : 201 with member response.
    Success: status==201, role==MEMBER, email matches.
    Failure: non-201.
    """
    db = _mock_db(
        workspace_doc=MOCK_WORKSPACE_DOC,
        user_find_one={"_id": ObjectId(MEMBER_ID), "name": "Team Member", "email": "member@focusflow.dev"},
        member_find_one=None,  # not already a member
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(f"/api/workspaces/{FAKE_WORKSPACE_ID}/members", json={
            "email": "member@focusflow.dev",
            "role": "MEMBER",
        })

    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "member@focusflow.dev"
    assert body["role"] == "MEMBER"
    assert body["user_name"] == "Team Member"


# ── TC-W10: Add member — duplicate → 409 ───────────────────────────────────

@pytest.mark.asyncio
async def test_add_member_duplicate_returns_409():
    """
    TC-W10: POST /api/workspaces/{id}/members — member already exists.
    Input  : Owner JWT, email of existing member.
    Oracle : 409 Conflict.
    Success: status==409.
    Failure: 201.
    """
    db = _mock_db(
        workspace_doc=MOCK_WORKSPACE_DOC,
        user_find_one={"_id": ObjectId(MEMBER_ID), "name": "Team Member", "email": "member@focusflow.dev"},
        member_find_one=MOCK_MEMBER_DOC,  # already a member
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(f"/api/workspaces/{FAKE_WORKSPACE_ID}/members", json={
            "email": "member@focusflow.dev",
            "role": "MEMBER",
        })

    assert r.status_code == 409


# ── TC-W11: Add member — self-add → 400 ────────────────────────────────────

@pytest.mark.asyncio
async def test_add_member_self_returns_400():
    """
    TC-W11: POST /api/workspaces/{id}/members — owner tries to add themselves.
    Input  : Owner JWT, owner's own email.
    Oracle : 400 Bad Request.
    Success: status==400.
    Failure: 201.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(f"/api/workspaces/{FAKE_WORKSPACE_ID}/members", json={
            "email": "owner@focusflow.dev",
            "role": "MEMBER",
        })

    assert r.status_code == 400


# ── TC-W12: Add member — non-owner → 403 ───────────────────────────────────

@pytest.mark.asyncio
async def test_add_member_non_owner_returns_403():
    """
    TC-W12: POST /api/workspaces/{id}/members — non-owner tries to add.
    Input  : Member JWT, workspace ID.
    Oracle : 403.
    Success: status==403.
    Failure: 201.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_MEMBER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(f"/api/workspaces/{FAKE_WORKSPACE_ID}/members", json={
            "email": "other@focusflow.dev",
            "role": "MEMBER",
        })

    assert r.status_code == 403


# ── TC-W13: List members ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_members():
    """
    TC-W13: GET /api/workspaces/{id}/members — list workspace members.
    Input  : Owner JWT, workspace with 2 members.
    Oracle : 200 with list of 2 members.
    Success: status==200, length==2.
    Failure: empty list or 404.
    """
    db = _mock_db(
        workspace_doc=MOCK_WORKSPACE_DOC,
        member_docs=[MOCK_OWNER_MEMBER_DOC, MOCK_MEMBER_DOC],
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/workspaces/{FAKE_WORKSPACE_ID}/members")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2


# ── TC-W14: Remove member — owner removes member ───────────────────────────

@pytest.mark.asyncio
async def test_remove_member_by_owner():
    """
    TC-W14: DELETE /api/workspaces/{id}/members/{user_id} — owner removes a member.
    Input  : Owner JWT, member's user_id.
    Oracle : 204 No Content.
    Success: status==204.
    Failure: 403.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/workspaces/{FAKE_WORKSPACE_ID}/members/{MEMBER_ID}")

    assert r.status_code == 204


# ── TC-W15: Remove member — member leaves ──────────────────────────────────

@pytest.mark.asyncio
async def test_member_leaves_workspace():
    """
    TC-W15: DELETE /api/workspaces/{id}/members/{user_id} — member removes self.
    Input  : Member JWT, own user_id.
    Oracle : 204 No Content.
    Success: status==204.
    Failure: 403.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_MEMBER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/workspaces/{FAKE_WORKSPACE_ID}/members/{MEMBER_ID}")

    assert r.status_code == 204


# ── TC-W16: Remove member — no permission → 403 ────────────────────────────

@pytest.mark.asyncio
async def test_remove_member_no_permission_returns_403():
    """
    TC-W16: DELETE /api/workspaces/{id}/members/{user_id} — non-owner removes another member.
    Input  : Member JWT, another member's user_id.
    Oracle : 403.
    Success: status==403.
    Failure: 204.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_MEMBER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/workspaces/{FAKE_WORKSPACE_ID}/members/{OTHER_USER_ID}")

    assert r.status_code == 403


# ── TC-W17: Owner cannot leave → 400 ───────────────────────────────────────

@pytest.mark.asyncio
async def test_owner_cannot_leave_workspace():
    """
    TC-W17: DELETE /api/workspaces/{id}/members/{owner_id} — owner tries to leave.
    Input  : Owner JWT, own user_id.
    Oracle : 400 Bad Request.
    Success: status==400.
    Failure: 204.
    """
    db = _mock_db(workspace_doc=MOCK_WORKSPACE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/workspaces/{FAKE_WORKSPACE_ID}/members/{OWNER_ID}")

    assert r.status_code == 400


# ── TC-W18: Unauthenticated access → 401/403 ──────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_workspaces_returns_401():
    """
    TC-W18: GET /api/workspaces without a token.
    Oracle : 401 or 403.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/workspaces")

    assert r.status_code in {401, 403}


# ── TC-W19: Empty workspace name → 422 ─────────────────────────────────────

@pytest.mark.asyncio
async def test_create_workspace_empty_name_returns_422():
    """
    TC-W19: POST /api/workspaces with empty name.
    Input  : Owner JWT, empty string name.
    Oracle : 422 Unprocessable Entity (Pydantic validation).
    Success: status==422.
    Failure: 201.
    """
    db = _mock_db()
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/workspaces", json={
            "name": "",
        })

    assert r.status_code == 422
