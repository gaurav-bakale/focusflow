"""
Backend Test Suite — Task Comments (Issue #42)

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
COMMENTER_ID = str(ObjectId())
OTHER_USER_ID = str(ObjectId())
FAKE_TASK_ID = str(ObjectId())
FAKE_COMMENT_ID = str(ObjectId())

NOW = datetime.utcnow()

MOCK_OWNER = {
    "_id": ObjectId(OWNER_ID),
    "name": "Task Owner",
    "email": "owner@focusflow.dev",
}

MOCK_COMMENTER = {
    "_id": ObjectId(COMMENTER_ID),
    "name": "Commenter",
    "email": "commenter@focusflow.dev",
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

MOCK_COMMENT_DOC = {
    "_id": ObjectId(FAKE_COMMENT_ID),
    "task_id": FAKE_TASK_ID,
    "user_id": COMMENTER_ID,
    "user_name": "Commenter",
    "content": "Looks good so far!",
    "created_at": NOW,
    "updated_at": NOW,
}

MOCK_SHARE_DOC = {
    "task_id": FAKE_TASK_ID,
    "shared_with_id": COMMENTER_ID,
    "permission": "VIEW",
    "status": "ACCEPTED",
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
    comment_docs=None,
    comment_find_one=None,
    share_find_one=None,
):
    """Return a pre-wired mock DB with separate collection mocks."""
    tasks_col = MagicMock()
    comments_col = MagicMock()
    shares_col = MagicMock()

    # ── tasks collection ──
    tasks_col.find_one = AsyncMock(return_value=task_doc)

    # ── task_shares collection ──
    shares_col.find_one = AsyncMock(return_value=share_find_one)

    # ── comments collection ──
    comments = comment_docs or []
    sortable = MagicMock()
    sortable.__aiter__ = lambda self: _async_iter(comments).__aiter__()
    real_cursor = MagicMock()
    real_cursor.sort = MagicMock(return_value=sortable)
    real_cursor.__aiter__ = lambda self: _async_iter(comments).__aiter__()
    comments_col.find.return_value = real_cursor

    comments_col.find_one = AsyncMock(return_value=comment_find_one)
    comments_col.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId(FAKE_COMMENT_ID))
    )
    comments_col.find_one_and_update = AsyncMock(return_value=comment_find_one)
    comments_col.delete_one = AsyncMock(
        return_value=MagicMock(deleted_count=1)
    )

    collections = {
        "tasks": tasks_col,
        "comments": comments_col,
        "task_shares": shares_col,
    }
    db = MagicMock()
    db.__getitem__ = MagicMock(side_effect=lambda key: collections[key])
    return db


# ── TC-C01: Add comment as task owner ────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_comment_as_owner():
    """
    TC-C01: POST /api/tasks/{task_id}/comments — owner adds a comment.
    Input  : Owner JWT, valid task_id, comment content.
    Oracle : 201 with comment response.
    Success: status==201, content matches, user_name matches.
    Failure: non-201 or missing fields.
    """
    db = _mock_db(task_doc=MOCK_TASK_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(f"/api/tasks/{FAKE_TASK_ID}/comments", json={
            "content": "Great progress!",
        })

    assert r.status_code == 201
    body = r.json()
    assert body["content"] == "Great progress!"
    assert body["user_name"] == "Task Owner"
    assert body["task_id"] == FAKE_TASK_ID


# ── TC-C02: Add comment as shared user ───────────────────────────────────────

@pytest.mark.asyncio
async def test_add_comment_as_shared_user():
    """
    TC-C02: POST /api/tasks/{task_id}/comments — shared user adds a comment.
    Input  : Shared user JWT, valid task_id with VIEW share.
    Oracle : 201 with comment response.
    Success: status==201.
    Failure: 404 or 403.
    """
    # Task is not owned by commenter, but a share exists
    db = _mock_db(task_doc=MOCK_TASK_DOC, share_find_one=MOCK_SHARE_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_COMMENTER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(f"/api/tasks/{FAKE_TASK_ID}/comments", json={
            "content": "I can comment too!",
        })

    assert r.status_code == 201
    assert r.json()["user_name"] == "Commenter"


# ── TC-C03: Add comment — no access → 404 ───────────────────────────────────

@pytest.mark.asyncio
async def test_add_comment_no_access_returns_404():
    """
    TC-C03: POST /api/tasks/{task_id}/comments — user with no access.
    Input  : User JWT with no ownership or share.
    Oracle : 404.
    Success: status==404.
    Failure: 201.
    """
    db = _mock_db(task_doc=MOCK_TASK_DOC, share_find_one=None)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OTHER_USER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(f"/api/tasks/{FAKE_TASK_ID}/comments", json={
            "content": "Shouldn't work",
        })

    assert r.status_code == 404


# ── TC-C04: List comments ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_comments():
    """
    TC-C04: GET /api/tasks/{task_id}/comments — returns all comments.
    Input  : Owner JWT, task with one comment.
    Oracle : 200 with list of 1 comment.
    Success: status==200, length==1, content matches.
    Failure: empty list or 404.
    """
    db = _mock_db(
        task_doc=MOCK_TASK_DOC,
        comment_docs=[MOCK_COMMENT_DOC],
    )
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/tasks/{FAKE_TASK_ID}/comments")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["content"] == "Looks good so far!"


# ── TC-C05: Update comment by author ────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_comment_by_author():
    """
    TC-C05: PUT /api/comments/{comment_id} — author edits their comment.
    Input  : Author JWT, comment_id, new content.
    Oracle : 200 with updated content.
    Success: status==200, content updated.
    Failure: 403 or content unchanged.
    """
    updated_doc = {**MOCK_COMMENT_DOC, "content": "Updated comment"}
    db = _mock_db(comment_find_one=MOCK_COMMENT_DOC)
    # Override find_one_and_update to return the updated doc
    db.__getitem__.side_effect = lambda key: {
        "tasks": db.__getitem__("tasks") if key == "tasks" else None,
        "comments": db.__getitem__("comments") if key == "comments" else None,
        "task_shares": db.__getitem__("task_shares") if key == "task_shares" else None,
    }.get(key)

    # Rebuild cleanly to avoid side_effect recursion
    db = _mock_db(comment_find_one=MOCK_COMMENT_DOC)
    comments_col = MagicMock()
    comments_col.find_one = AsyncMock(return_value=MOCK_COMMENT_DOC)
    comments_col.find_one_and_update = AsyncMock(return_value=updated_doc)
    collections = {"tasks": MagicMock(), "comments": comments_col, "task_shares": MagicMock()}
    db = MagicMock()
    db.__getitem__ = MagicMock(side_effect=lambda key: collections[key])

    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_COMMENTER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.put(f"/api/comments/{FAKE_COMMENT_ID}", json={
            "content": "Updated comment",
        })

    assert r.status_code == 200
    assert r.json()["content"] == "Updated comment"


# ── TC-C06: Update comment by non-author → 403 ─────────────────────────────

@pytest.mark.asyncio
async def test_update_comment_non_author_returns_403():
    """
    TC-C06: PUT /api/comments/{comment_id} — non-author tries to edit.
    Input  : Owner JWT (not comment author), comment_id.
    Oracle : 403 Forbidden.
    Success: status==403.
    Failure: 200.
    """
    db = _mock_db(comment_find_one=MOCK_COMMENT_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.put(f"/api/comments/{FAKE_COMMENT_ID}", json={
            "content": "Trying to edit someone else's comment",
        })

    assert r.status_code == 403


# ── TC-C07: Delete comment by author ────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_comment_by_author():
    """
    TC-C07: DELETE /api/comments/{comment_id} — author deletes their comment.
    Input  : Author JWT, comment_id.
    Oracle : 204 No Content.
    Success: status==204.
    Failure: 403 or 404.
    """
    db = _mock_db(task_doc=MOCK_TASK_DOC, comment_find_one=MOCK_COMMENT_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_COMMENTER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/comments/{FAKE_COMMENT_ID}")

    assert r.status_code == 204


# ── TC-C08: Delete comment by task owner ─────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_comment_by_task_owner():
    """
    TC-C08: DELETE /api/comments/{comment_id} — task owner deletes any comment.
    Input  : Owner JWT (not comment author), comment_id.
    Oracle : 204 No Content.
    Success: status==204.
    Failure: 403.
    """
    db = _mock_db(task_doc=MOCK_TASK_DOC, comment_find_one=MOCK_COMMENT_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/comments/{FAKE_COMMENT_ID}")

    assert r.status_code == 204


# ── TC-C09: Delete comment — no permission → 403 ────────────────────────────

@pytest.mark.asyncio
async def test_delete_comment_no_permission_returns_403():
    """
    TC-C09: DELETE /api/comments/{comment_id} — user is neither author nor owner.
    Input  : Other user JWT, comment_id.
    Oracle : 403 Forbidden.
    Success: status==403.
    Failure: 204.
    """
    db = _mock_db(task_doc=MOCK_TASK_DOC, comment_find_one=MOCK_COMMENT_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OTHER_USER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.delete(f"/api/comments/{FAKE_COMMENT_ID}")

    assert r.status_code == 403


# ── TC-C10: Empty content → 422 ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_comment_empty_content_returns_422():
    """
    TC-C10: POST /api/tasks/{task_id}/comments with empty content.
    Input  : Owner JWT, empty string content.
    Oracle : 422 Unprocessable Entity (Pydantic validation).
    Success: status==422.
    Failure: 201.
    """
    db = _mock_db(task_doc=MOCK_TASK_DOC)
    app.dependency_overrides[get_current_user_dependency] = _auth_override(MOCK_OWNER)
    app.dependency_overrides[get_db_dependency] = lambda: db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(f"/api/tasks/{FAKE_TASK_ID}/comments", json={
            "content": "",
        })

    assert r.status_code == 422


# ── TC-C11: Unauthenticated access → 401/403 ───────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_comments_returns_401():
    """
    TC-C11: GET /api/tasks/{task_id}/comments without a token.
    Oracle : 401 or 403.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get(f"/api/tasks/{FAKE_TASK_ID}/comments")

    assert r.status_code in {401, 403}
