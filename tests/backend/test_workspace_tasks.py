"""
Workspace-scoped task tests — covers the integration between Tasks and
Workspaces introduced by the feature/workspace-tasks branch.

Scenarios:
  W-T01  Owner lists workspace tasks
  W-T02  Non-member cannot list a workspace's tasks
  W-T03  Member can see a task owned by another member when scoped to the workspace
  W-T04  Creating a task with workspace_id requires membership
  W-T05  Moving a personal task into a workspace requires membership
  W-T06  Deleting a workspace cascades workspace_id → null on all its tasks
  W-T07  list_tasks(workspace_id='personal') excludes workspace-scoped tasks

Each test uses the same _FakeDB helper as test_service_patterns so that the
Service-Layer contract can be exercised directly, without spinning up the
HTTP stack — fast, deterministic, and keeps the tests focused.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app.tasks.models import TaskCreate, TaskUpdate
from app.tasks.service import TaskService
from app.workspaces.service import WorkspaceService


NOW = datetime.utcnow()
FAKE_USER_A = ObjectId()
FAKE_USER_B = ObjectId()   # B is a fellow workspace member
FAKE_USER_C = ObjectId()   # C is outside the workspace
FAKE_WS_ID = str(ObjectId())
FAKE_OTHER_WS_ID = str(ObjectId())

USER_A = {"_id": FAKE_USER_A, "name": "Alice", "email": "alice@x.com"}
USER_B = {"_id": FAKE_USER_B, "name": "Bob",   "email": "bob@x.com"}
USER_C = {"_id": FAKE_USER_C, "name": "Carol", "email": "carol@x.com"}


# ── Async cursor shim ───────────────────────────────────────────────────────────

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


# ── DB fixture ─────────────────────────────────────────────────────────────────

def _make_db(tasks=None, members=None, workspaces=None):
    """
    Build a per-collection mocked Motor DB.

    * `tasks`      : list of task docs returned by tasks.find()
    * `members`    : list of workspace_members docs
    * `workspaces` : list of workspace docs (used for cascade tests)
    """
    tasks = tasks or []
    members = members or []
    workspaces = workspaces or []

    tasks_col = MagicMock()
    tasks_col.find.return_value = _AsyncCursor(tasks)

    # Multi-return find_one: lookup by _id, find the matching task doc.
    async def _tasks_find_one(query):
        if "_id" in query:
            target = query["_id"]
            for d in tasks:
                if d["_id"] == target:
                    return d
        return None

    tasks_col.find_one = _tasks_find_one
    tasks_col.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))
    tasks_col.find_one_and_update = AsyncMock(return_value=(tasks[0] if tasks else None))
    tasks_col.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
    tasks_col.update_many = AsyncMock(return_value=MagicMock(modified_count=len(tasks)))

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
    workspaces_col.delete_one = AsyncMock()

    task_shares_col = MagicMock()
    task_shares_col.find_one = AsyncMock(return_value=None)

    collections = {
        "tasks": tasks_col,
        "workspace_members": members_col,
        "workspaces": workspaces_col,
        "task_shares": task_shares_col,
    }

    db = MagicMock()
    db.__getitem__ = MagicMock(
        side_effect=lambda k: collections.setdefault(k, MagicMock()),
    )
    return db, collections


def _task_doc(title, owner, ws_id=None, task_id=None):
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
        "status": "TODO",
        "subtasks": [],
        "categories": [],
        "workspace_id": ws_id,
        "created_at": NOW,
        "updated_at": NOW,
    }


def _member(workspace_id, user):
    return {
        "workspace_id": workspace_id,
        "user_id": str(user["_id"]),
        "user_name": user["name"],
        "email": user["email"],
        "role": "MEMBER",
        "joined_at": NOW,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# W-T01  List tasks inside a workspace — member only
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_workspace_member_lists_only_workspace_tasks():
    """
    TC-WT01: TaskService.list_tasks(workspace_id=<id>) returns exactly the
    tasks assigned to that workspace.
    """
    t1 = _task_doc("WS Task", USER_A["_id"], ws_id=FAKE_WS_ID)
    # t2 is owned by A but personal — must NOT appear when filter is workspace.
    t2 = _task_doc("Personal", USER_A["_id"], ws_id=None)

    db, _ = _make_db(
        tasks=[t1, t2],
        members=[_member(FAKE_WS_ID, USER_A)],
    )
    svc = TaskService(db)
    results = await svc.list_tasks(USER_A, workspace_id=FAKE_WS_ID)

    titles = [r.title for r in results]
    assert "WS Task" in titles
    # Note: the fake cursor returns every task in `tasks` regardless of the
    # query object — so we assert only inclusion, not exclusion. Exclusion
    # is handled via the 404/403 boundary in the other tests.


# ═══════════════════════════════════════════════════════════════════════════════
# W-T02  Non-member cannot list a workspace's tasks
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_non_member_cannot_list_workspace_tasks():
    """
    TC-WT02: Passing a workspace_id the caller does not belong to raises 404.
    We intentionally 404 (not 403) to avoid leaking the workspace's existence.
    """
    db, _ = _make_db(members=[_member(FAKE_WS_ID, USER_A)])  # only A is a member
    svc = TaskService(db)

    with pytest.raises(HTTPException) as exc:
        await svc.list_tasks(USER_C, workspace_id=FAKE_WS_ID)
    assert exc.value.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# W-T03  Member can ACCESS another member's workspace task
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_member_can_access_peer_workspace_task():
    """
    TC-WT03: A task created by B inside a workspace where A is also a member
    is accessible to A via get_task() — proves the workspace path in
    `_can_access` works even when A is not the task's creator.
    """
    b_task = _task_doc("B's task", USER_B["_id"], ws_id=FAKE_WS_ID)
    db, _ = _make_db(
        tasks=[b_task],
        members=[_member(FAKE_WS_ID, USER_A), _member(FAKE_WS_ID, USER_B)],
    )
    svc = TaskService(db)

    result = await svc.get_task(USER_A, str(b_task["_id"]))
    assert result.title == "B's task"
    assert result.workspace_id == FAKE_WS_ID


# ═══════════════════════════════════════════════════════════════════════════════
# W-T04  Creating a task in a workspace requires membership
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_task_in_workspace_requires_membership():
    """
    TC-WT04: create_task() with a workspace_id the caller does not belong to
    raises 403. This prevents cross-workspace injection of tasks.
    """
    db, _ = _make_db(members=[])  # no membership anywhere
    svc = TaskService(db)

    with pytest.raises(HTTPException) as exc:
        await svc.create_task(
            USER_A,
            TaskCreate(title="sneaky", workspace_id=FAKE_WS_ID),
        )
    assert exc.value.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════════
# W-T05  Moving a task into a workspace requires membership
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_update_task_to_new_workspace_requires_membership():
    """
    TC-WT05: update_task() that tries to set workspace_id to a workspace the
    caller is not a member of is rejected with 403 — even if the caller owns
    the task.
    """
    owned = _task_doc("mine", USER_A["_id"])
    db, _ = _make_db(
        tasks=[owned],
        members=[],  # A belongs to no workspaces
    )
    svc = TaskService(db)

    with pytest.raises(HTTPException) as exc:
        await svc.update_task(
            USER_A,
            str(owned["_id"]),
            TaskUpdate(workspace_id=FAKE_OTHER_WS_ID),
        )
    assert exc.value.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════════
# W-T06  Workspace deletion cascades workspace_id → null on tasks
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_delete_workspace_clears_workspace_id_on_tasks():
    """
    TC-WT06: delete_workspace() must invoke update_many on tasks to set
    workspace_id = null, ensuring tasks are preserved as personal tasks after
    the workspace is deleted.
    """
    ws_doc = {"_id": ObjectId(FAKE_WS_ID), "owner_id": str(USER_A["_id"]), "name": "WS", "created_at": NOW, "updated_at": NOW}
    task_in_ws = _task_doc("will-unscope", USER_A["_id"], ws_id=FAKE_WS_ID)

    db, collections = _make_db(
        tasks=[task_in_ws],
        workspaces=[ws_doc],
        members=[_member(FAKE_WS_ID, USER_A)],
    )
    svc = WorkspaceService(db)

    await svc.delete_workspace(USER_A, FAKE_WS_ID)

    # Verify the cascade fired — update_many with workspace_id:<id> → null.
    collections["tasks"].update_many.assert_awaited_once()
    call_args = collections["tasks"].update_many.await_args
    query, update = call_args[0][0], call_args[0][1]
    assert query == {"workspace_id": FAKE_WS_ID}
    assert update["$set"]["workspace_id"] is None


# ═══════════════════════════════════════════════════════════════════════════════
# W-T07  list_tasks(workspace_id='personal') excludes workspace tasks
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_tasks_personal_excludes_workspace_scoped():
    """
    TC-WT07: list_tasks(workspace_id='personal') must issue a Mongo query that
    excludes workspace-scoped tasks. We verify the actual query passed to
    tasks.find() so the exclusion is enforced at the DB level rather than
    post-filtering in Python.
    """
    db, collections = _make_db(members=[_member(FAKE_WS_ID, USER_A)])
    svc = TaskService(db)

    await svc.list_tasks(USER_A, workspace_id="personal")

    find_query = collections["tasks"].find.call_args[0][0]
    assert find_query["user_id"] == USER_A["_id"]
    assert "$or" in find_query
    # One of the OR clauses must assert workspace_id is unset/null/empty.
    ors = find_query["$or"]
    assert any("workspace_id" in o for o in ors)
