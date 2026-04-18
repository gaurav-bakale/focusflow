"""
Notification emit tests — verifies that feature code paths (task lifecycle,
workspace membership, AI frog, Pomodoro sessions) correctly emit the new
notification types introduced by the notifications overhaul.

These are focused on the *side-effect contract*: given an action by user A,
does the right notification land in user B's inbox (or user A's own inbox
for solo events)?  We stub out the WebSocket manager so tests don't require
a running loop, and mock the AI and auth paths where needed.

Scope:
  N-E01  complete_task → TASK_COMPLETED for the owner
  N-E02  complete_task in a workspace → WORKSPACE_TASK_COMPLETED for peers
  N-E03  create_task in a workspace → WORKSPACE_TASK_ADDED for peers
  N-E04  add_member → WORKSPACE_INVITED for the invitee
  N-E05  update_task with every subtask DONE → ALL_SUBTASKS_DONE for owner
  N-E06  emit_to_workspace_peers does NOT notify the actor themselves
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId
from fastapi import HTTPException  # noqa: F401 (kept for future negative tests)

from app.notifications.models import NotificationType
from app.notifications.service import NotificationService
from app.tasks.models import TaskCreate, TaskUpdate
from app.tasks.service import TaskService
from app.workspaces.models import MemberAdd, WorkspaceRole
from app.workspaces.service import WorkspaceService


NOW = datetime.utcnow()
USER_A = {"_id": ObjectId(), "name": "Alice", "email": "alice@x.com"}
USER_B = {"_id": ObjectId(), "name": "Bob",   "email": "bob@x.com"}
USER_C = {"_id": ObjectId(), "name": "Carol", "email": "carol@x.com"}


# ── Async cursor shim for Motor-style iteration ─────────────────────────────

class _AsyncCursor:
    def __init__(self, items):
        self._items = list(items)
        self._i = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._i >= len(self._items):
            raise StopAsyncIteration
        item = self._items[self._i]
        self._i += 1
        return item

    def sort(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self


def _make_db(tasks=None, members=None, workspaces=None):
    """
    Build a fake DB with per-collection mocks.

    Each collection needs its own MagicMock because MagicMock's default
    __getitem__ returns the same child mock for every key.
    """
    tasks = tasks or []
    members = members or []
    workspaces = workspaces or []

    # ── tasks
    tasks_col = MagicMock()
    tasks_col.find.return_value = _AsyncCursor(tasks)

    async def _tasks_find_one(query):
        if "_id" in query:
            for d in tasks:
                if d["_id"] == query["_id"]:
                    return d
        return None

    tasks_col.find_one = _tasks_find_one
    tasks_col.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))
    tasks_col.find_one_and_update = AsyncMock(
        return_value=(tasks[0] if tasks else None)
    )
    tasks_col.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
    tasks_col.update_many = AsyncMock(return_value=MagicMock(modified_count=0))

    # ── workspace_members
    members_col = MagicMock()

    def _members_find(query):
        matches = members
        if "user_id" in query:
            matches = [m for m in matches if m["user_id"] == query["user_id"]]
        if "workspace_id" in query:
            matches = [m for m in matches if m["workspace_id"] == query["workspace_id"]]
        return _AsyncCursor(matches)

    members_col.find.side_effect = _members_find

    async def _members_find_one(query):
        for m in members:
            if (
                m.get("workspace_id") == query.get("workspace_id")
                and m.get("user_id") == query.get("user_id")
            ):
                return m
        return None

    members_col.find_one = _members_find_one
    members_col.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))
    members_col.delete_many = AsyncMock(return_value=MagicMock(deleted_count=0))

    # ── workspaces
    workspaces_col = MagicMock()

    async def _ws_find_one(query):
        if "_id" in query:
            for w in workspaces:
                if w["_id"] == query["_id"]:
                    return w
        return None

    workspaces_col.find_one = _ws_find_one

    def _ws_find(query):
        ids = query.get("_id", {}).get("$in", [])
        return _AsyncCursor([w for w in workspaces if w["_id"] in ids])

    workspaces_col.find.side_effect = _ws_find

    # ── users (for the add_member path that looks up target by email)
    users_col = MagicMock()

    async def _users_find_one(query):
        email = query.get("email")
        for u in (USER_A, USER_B, USER_C):
            if u.get("email") == email:
                return u
        return None

    users_col.find_one = _users_find_one

    # ── notifications — this is where we record what was emitted
    notif_col = MagicMock()
    emitted = []

    async def _notif_insert(doc):
        emitted.append(doc)
        m = MagicMock()
        m.inserted_id = ObjectId()
        return m

    notif_col.insert_one = _notif_insert

    async def _notif_find_one(query):
        # Used for the dedup check in the frog endpoint — return None so
        # tests don't need to set up prior state.
        return None

    notif_col.find_one = _notif_find_one
    notif_col.count_documents = AsyncMock(return_value=0)
    notif_col.find.return_value = _AsyncCursor([])

    # ── task_shares (empty)
    shares_col = MagicMock()
    shares_col.find_one = AsyncMock(return_value=None)

    collections = {
        "tasks": tasks_col,
        "workspace_members": members_col,
        "workspaces": workspaces_col,
        "users": users_col,
        "notifications": notif_col,
        "task_shares": shares_col,
    }

    db = MagicMock()
    db.__getitem__ = MagicMock(
        side_effect=lambda k: collections.setdefault(k, MagicMock()),
    )
    # Expose the emitted list so tests can make assertions.
    db._emitted_notifications = emitted
    return db


def _task_doc(title, owner, ws_id=None, subtasks=None, status="TODO", task_id=None):
    return {
        "_id": task_id or ObjectId(),
        "user_id": owner,
        "title": title,
        "description": None,
        "priority": "MEDIUM",
        "deadline": None,
        "due_time": None,
        "recurrence": "NONE",
        "estimated_minutes": None,
        "status": status,
        "subtasks": subtasks or [],
        "categories": [],
        "workspace_id": ws_id,
        "created_at": NOW,
        "updated_at": NOW,
    }


def _member(workspace_id, user, role="MEMBER"):
    return {
        "workspace_id": workspace_id,
        "user_id": str(user["_id"]),
        "user_name": user["name"],
        "email": user["email"],
        "role": role,
        "joined_at": NOW,
    }


# Silence the real WebSocket push across every test in this file so we don't
# depend on a running ConnectionManager or an active event loop.
@pytest.fixture(autouse=True)
def _mute_ws():
    with patch("app.ws.manager.send_to_user", new=AsyncMock()):
        yield


# ══════════════════════════════════════════════════════════════════════════════
# N-E01  complete_task emits TASK_COMPLETED for the owner
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_complete_task_emits_task_completed_for_owner():
    task = _task_doc("Finish report", USER_A["_id"])
    db = _make_db(tasks=[task])
    # find_one_and_update returns the same doc with status DONE.
    db["tasks"].find_one_and_update = AsyncMock(
        return_value={**task, "status": "DONE"}
    )

    svc = TaskService(db)
    await svc.complete_task(USER_A, str(task["_id"]))

    types = [n["type"] for n in db._emitted_notifications]
    assert NotificationType.TASK_COMPLETED.value in types

    target = next(
        n for n in db._emitted_notifications
        if n["type"] == NotificationType.TASK_COMPLETED.value
    )
    assert target["user_id"] == str(USER_A["_id"])
    assert "Finish report" in target["message"]


# ══════════════════════════════════════════════════════════════════════════════
# N-E02  Workspace task complete → peers get WORKSPACE_TASK_COMPLETED
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_complete_workspace_task_notifies_peers_not_actor():
    ws_id = str(ObjectId())
    ws_doc = {
        "_id": ObjectId(ws_id),
        "owner_id": str(USER_A["_id"]),
        "name": "Sprint Alpha",
        "created_at": NOW, "updated_at": NOW,
    }
    task = _task_doc("Deploy beta", USER_A["_id"], ws_id=ws_id)
    db = _make_db(
        tasks=[task],
        workspaces=[ws_doc],
        members=[
            _member(ws_id, USER_A, role="OWNER"),
            _member(ws_id, USER_B),
            _member(ws_id, USER_C),
        ],
    )
    db["tasks"].find_one_and_update = AsyncMock(
        return_value={**task, "status": "DONE"}
    )

    svc = TaskService(db)
    await svc.complete_task(USER_A, str(task["_id"]))

    peer_notifs = [
        n for n in db._emitted_notifications
        if n["type"] == NotificationType.WORKSPACE_TASK_COMPLETED.value
    ]
    peer_recipients = {n["user_id"] for n in peer_notifs}

    assert str(USER_B["_id"]) in peer_recipients
    assert str(USER_C["_id"]) in peer_recipients
    # The actor should NOT receive their own peer notification — noise.
    assert str(USER_A["_id"]) not in peer_recipients


# ══════════════════════════════════════════════════════════════════════════════
# N-E03  Workspace task create → peers get WORKSPACE_TASK_ADDED
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_task_in_workspace_notifies_peers():
    ws_id = str(ObjectId())
    ws_doc = {
        "_id": ObjectId(ws_id),
        "owner_id": str(USER_A["_id"]),
        "name": "Sprint Alpha",
        "created_at": NOW, "updated_at": NOW,
    }
    db = _make_db(
        workspaces=[ws_doc],
        members=[
            _member(ws_id, USER_A, role="OWNER"),
            _member(ws_id, USER_B),
        ],
    )
    svc = TaskService(db)

    await svc.create_task(
        USER_A,
        TaskCreate(title="Write docs", workspace_id=ws_id),
    )

    added = [
        n for n in db._emitted_notifications
        if n["type"] == NotificationType.WORKSPACE_TASK_ADDED.value
    ]
    recipients = {n["user_id"] for n in added}
    assert str(USER_B["_id"]) in recipients
    assert str(USER_A["_id"]) not in recipients
    assert any("Write docs" in n["message"] for n in added)


# ══════════════════════════════════════════════════════════════════════════════
# N-E04  add_member → invitee gets WORKSPACE_INVITED
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_add_member_notifies_invitee():
    ws_id = str(ObjectId())
    ws_doc = {
        "_id": ObjectId(ws_id),
        "owner_id": str(USER_A["_id"]),
        "owner_name": USER_A["name"],
        "name": "Study Group",
        "created_at": NOW, "updated_at": NOW,
    }
    db = _make_db(
        workspaces=[ws_doc],
        members=[_member(ws_id, USER_A, role="OWNER")],
    )
    svc = WorkspaceService(db)

    await svc.add_member(
        USER_A,
        ws_id,
        MemberAdd(email=USER_B["email"], role=WorkspaceRole.MEMBER),
    )

    invited = [
        n for n in db._emitted_notifications
        if n["type"] == NotificationType.WORKSPACE_INVITED.value
    ]
    assert len(invited) == 1
    assert invited[0]["user_id"] == str(USER_B["_id"])
    assert "Study Group" in invited[0]["message"]


# ══════════════════════════════════════════════════════════════════════════════
# N-E05  update_task with every subtask DONE → owner gets ALL_SUBTASKS_DONE
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_update_task_all_subtasks_done_emits_nudge():
    subtasks = [
        {"title": "s1", "status": "DONE"},
        {"title": "s2", "status": "TODO"},
    ]
    task = _task_doc("Prep demo", USER_A["_id"], subtasks=subtasks)
    db = _make_db(tasks=[task])
    # Simulate the completed state after the update.
    updated_subtasks = [
        {"title": "s1", "status": "DONE"},
        {"title": "s2", "status": "DONE"},
    ]
    db["tasks"].find_one_and_update = AsyncMock(
        return_value={**task, "subtasks": updated_subtasks}
    )

    svc = TaskService(db)
    await svc.update_task(
        USER_A,
        str(task["_id"]),
        TaskUpdate(subtasks=[
            {"title": "s1", "status": "DONE"},
            {"title": "s2", "status": "DONE"},
        ]),
    )

    nudges = [
        n for n in db._emitted_notifications
        if n["type"] == NotificationType.ALL_SUBTASKS_DONE.value
    ]
    assert len(nudges) == 1
    assert nudges[0]["user_id"] == str(USER_A["_id"])
    assert "Prep demo" in nudges[0]["message"]


# ══════════════════════════════════════════════════════════════════════════════
# N-E06  emit_to_workspace_peers never notifies the actor
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_emit_to_workspace_peers_excludes_actor():
    ws_id = str(ObjectId())
    db = _make_db(members=[
        _member(ws_id, USER_A),
        _member(ws_id, USER_B),
        _member(ws_id, USER_C),
    ])
    svc = NotificationService(db)

    sent = await svc.emit_to_workspace_peers(
        workspace_id=ws_id,
        actor_user_id=str(USER_A["_id"]),
        ntype=NotificationType.WORKSPACE_TASK_ADDED,
        message="hello",
    )

    assert sent == 2
    recipients = {n["user_id"] for n in db._emitted_notifications}
    assert str(USER_A["_id"]) not in recipients
    assert {str(USER_B["_id"]), str(USER_C["_id"])} <= recipients
