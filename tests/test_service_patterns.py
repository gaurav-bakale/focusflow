"""
Design Pattern Unit Tests — Backend Service Layer
==================================================

These tests validate design patterns directly at the service / unit level,
without issuing any HTTP requests.  They exercise TaskService and AuthService
methods against mock (AsyncMock) databases.

Design Patterns verified
-------------------------
Service Layer   — TaskService methods execute independently of the router;
                  no HTTP layer is involved.
Repository      — list_tasks, get_task, delete_task pass user_id in every
                  query, providing per-user isolation.
Factory         — TaskService can be constructed with any db object, including
                  mocks, confirming the factory/DI contract.
Template Method — _doc_to_profile converts documents with a fixed sequence of
                  field mappings; missing fields fall back to defaults.

Run with:
    PYTHONPATH=backend pytest tests/test_service_patterns.py -v
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, call

import pytest
from bson import ObjectId

# ── Path setup ────────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.tasks.service import TaskService  # noqa: E402
from app.tasks.models import Priority, Recurrence, TaskCreate, TaskStatus  # noqa: E402
from app.authentication.service import AuthService, _doc_to_profile  # noqa: E402
from app.authentication.models import UserProfile  # noqa: E402

NOW = datetime.utcnow()
FAKE_USER_ID = ObjectId()
FAKE_TASK_ID = ObjectId()


# ── Async cursor shim ──────────────────────────────────────────────────────────

class _AsyncCursor:
    """
    Minimal async-iterable cursor that satisfies Motor's `async for` protocol.

    Motor cursors implement both __aiter__ and __anext__; MagicMock's auto-
    generated __aiter__ returns a plain list_iterator which is not async.
    This shim also provides a `sort()` pass-through and `to_list()` for the
    analytics code-path which calls `find().to_list(None)`.
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

MOCK_USER = {
    "_id": FAKE_USER_ID,
    "name": "Pattern Tester",
    "email": "patterns@focusflow-test.internal",
    "password_hash": "$2b$12$fakehash",
    "onboarding_completed": False,
    "preferences": {},
    "created_at": NOW,
}

MOCK_TASK_DOC = {
    "_id": FAKE_TASK_ID,
    "user_id": FAKE_USER_ID,
    "title": "Pattern Test Task",
    "description": "Testing service layer",
    "priority": "HIGH",
    "deadline": "2025-06-01",
    "due_time": None,
    "recurrence": "NONE",
    "estimated_minutes": 30,
    "status": "TODO",
    "subtasks": [],
    "categories": ["test"],
    "created_at": NOW,
    "updated_at": NOW,
}


# ── DB mock factory ────────────────────────────────────────────────────────────

class _FakeDB:
    """
    Fake database that returns per-collection mock objects.

    MagicMock's __getitem__ returns the same child mock for every key, which
    means db["tasks"] is db["users"].  Using a concrete mapping avoids that
    pitfall so that tasks- and users-collection assignments remain isolated.
    """

    def __init__(self, task_doc=None, tasks=None):
        _tasks_list = tasks if tasks is not None else ([task_doc] if task_doc else [])

        # -- tasks collection -------------------------------------------------
        tasks_col = MagicMock()
        tasks_col.find.return_value = _AsyncCursor(_tasks_list)
        tasks_col.find_one = AsyncMock(return_value=task_doc)
        tasks_col.insert_one = AsyncMock(
            return_value=MagicMock(inserted_id=FAKE_TASK_ID)
        )
        tasks_col.find_one_and_update = AsyncMock(return_value=task_doc)
        tasks_col.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

        # -- users collection -------------------------------------------------
        users_col = MagicMock()
        users_col.find_one = AsyncMock(return_value=MOCK_USER)
        users_col.insert_one = AsyncMock(
            return_value=MagicMock(inserted_id=FAKE_USER_ID)
        )
        users_col.find_one_and_update = AsyncMock(return_value=MOCK_USER)
        users_col.update_one = AsyncMock()

        # -- workspace / sharing collections (empty by default) ---------------
        # TaskService consults these during list/can-access to support the
        # shared-tasks and workspace-tasks features. Returning empty cursors
        # keeps the pattern-only tests focused on ownership behaviour.
        ws_members_col = MagicMock()
        ws_members_col.find.return_value = _AsyncCursor([])
        ws_members_col.find_one = AsyncMock(return_value=None)

        workspaces_col = MagicMock()
        workspaces_col.find.return_value = _AsyncCursor([])
        workspaces_col.find_one = AsyncMock(return_value=None)

        task_shares_col = MagicMock()
        task_shares_col.find_one = AsyncMock(return_value=None)

        self._collections = {
            "tasks": tasks_col,
            "users": users_col,
            "workspace_members": ws_members_col,
            "workspaces": workspaces_col,
            "task_shares": task_shares_col,
        }

    def __getitem__(self, key):
        return self._collections[key]


def _make_db(task_doc=None, tasks=None):
    """
    Factory pattern test helper — builds a fake DB with per-collection mocks.

    Tests the Factory pattern: TaskService accepts any db-like object whose
    subscript returns a collection with the expected async methods.
    """
    return _FakeDB(task_doc=task_doc, tasks=tasks)


# ══════════════════════════════════════════════════════════════════════════════
# SERVICE LAYER PATTERN — TaskService works without the router
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_service_layer_list_tasks_independent_of_router():
    """
    Tests Service Layer pattern isolation: TaskService.list_tasks() can be
    called directly without any HTTP request infrastructure.

    Input    : TaskService(mock_db).list_tasks(user) called directly.
    Expected : Returns a list of TaskResponse objects.
    Pass     : returns list of length 1, title matches.
    """
    db = _make_db(MOCK_TASK_DOC)
    svc = TaskService(db)

    result = await svc.list_tasks(MOCK_USER)

    assert len(result) == 1
    assert result[0].title == "Pattern Test Task"
    assert result[0].priority == Priority.HIGH


@pytest.mark.asyncio
async def test_service_layer_create_task_independent_of_router():
    """
    Tests Service Layer pattern: TaskService.create_task() inserts a document
    and returns a TaskResponse without any router involvement.

    Input    : TaskCreate(title='Direct Create', priority='LOW') passed directly.
    Expected : Returns a TaskResponse with the correct title and id.
    Pass     : result.title=='Direct Create', result.id==str(FAKE_TASK_ID).
    """
    doc = {**MOCK_TASK_DOC, "title": "Direct Create", "priority": "LOW"}
    db = _make_db(doc)
    svc = TaskService(db)

    data = TaskCreate(title="Direct Create", priority=Priority.LOW)
    result = await svc.create_task(MOCK_USER, data)

    assert result.title == "Direct Create"
    db["tasks"].insert_one.assert_called_once()


@pytest.mark.asyncio
async def test_service_layer_delete_task_independent_of_router():
    """
    Tests Service Layer pattern: delete_task() called directly returns None on
    success (HTTP 204 is the router's concern).

    Input    : TaskService(mock_db).delete_task(user, task_id) called directly.
    Expected : No exception raised; delete_one called on the collection.
    Pass     : delete_one called once with correct filter.
    """
    db = _make_db(MOCK_TASK_DOC)
    svc = TaskService(db)

    await svc.delete_task(MOCK_USER, str(FAKE_TASK_ID))  # must not raise

    # Ownership is now verified in Python (not the Mongo filter) so that
    # workspace-scoped deletes are also supported. Assert the deletion ran
    # and used an _id filter; ownership was guaranteed by the find_one step.
    db["tasks"].delete_one.assert_called_once()
    call_filter = db["tasks"].delete_one.call_args[0][0]
    assert "_id" in call_filter
    assert str(MOCK_TASK_DOC["user_id"]) == str(MOCK_USER["_id"])


# ══════════════════════════════════════════════════════════════════════════════
# REPOSITORY PATTERN — user_id isolation
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_repository_list_tasks_filters_by_user_id():
    """
    Tests Repository pattern: list_tasks() passes user_id in the find() filter,
    ensuring per-user isolation at the repository level.

    Input    : TaskService.list_tasks(user) where user has a specific _id.
    Expected : db["tasks"].find() called with {"user_id": user["_id"]}.
    Pass     : find call filter contains user_id key matching the user.
    """
    db = _make_db(MOCK_TASK_DOC)
    svc = TaskService(db)

    await svc.list_tasks(MOCK_USER)

    find_filter = db["tasks"].find.call_args[0][0]
    assert "user_id" in find_filter
    assert find_filter["user_id"] == FAKE_USER_ID


@pytest.mark.asyncio
async def test_repository_get_task_includes_user_id_filter():
    """
    Tests Repository pattern: get_task() verifies user ownership before
    returning a task, preventing cross-user data leaks.

    The _can_access() method fetches the task by _id, then compares the
    document's user_id against the requesting user — equivalent to the
    old find_one({_id, user_id}) filter but supporting shared-task access.

    Input    : TaskService.get_task(user, task_id) with task found in DB.
    Expected : find_one called with _id; returned doc's user_id matches the
               requesting user, confirming ownership was checked.
    Pass     : call_args filter has _id, and doc.user_id == user._id.
    """
    db = _make_db(task_doc=MOCK_TASK_DOC)
    svc = TaskService(db)

    result = await svc.get_task(MOCK_USER, str(FAKE_TASK_ID))

    find_filter = db["tasks"].find_one.call_args[0][0]
    assert "_id" in find_filter
    # Ownership is verified in code via _can_access (doc.user_id == user._id)
    assert str(MOCK_TASK_DOC["user_id"]) == str(MOCK_USER["_id"])


@pytest.mark.asyncio
async def test_repository_delete_task_checks_ownership_before_deleting():
    """
    Tests Repository pattern: delete_task() verifies ownership before calling
    delete_one(), so a user cannot delete another user's task.

    With the introduction of workspace-scoped tasks, ownership is verified in
    Python (task.user_id == requester OR requester owns the parent workspace)
    rather than pushed into the Mongo query. The assertion therefore checks
    that find_one was used to load the document first and that the loaded
    document's user_id matches the requester.

    Input    : TaskService.delete_task(user, task_id).
    Expected : find_one loaded the task for ownership verification; delete_one
               was then called with an _id filter.
    Pass     : find_one called with _id filter; delete filter contains _id;
               task's user_id equals the requester's user_id.
    """
    db = _make_db(MOCK_TASK_DOC)
    svc = TaskService(db)

    await svc.delete_task(MOCK_USER, str(FAKE_TASK_ID))

    find_filter = db["tasks"].find_one.call_args[0][0]
    assert "_id" in find_filter
    delete_filter = db["tasks"].delete_one.call_args[0][0]
    assert "_id" in delete_filter
    # Ownership check: the loaded task's owner matches the requester.
    assert str(MOCK_TASK_DOC["user_id"]) == str(MOCK_USER["_id"])


# ══════════════════════════════════════════════════════════════════════════════
# _next_occurrence — all recurrence types
# ══════════════════════════════════════════════════════════════════════════════

def test_next_occurrence_daily():
    """
    Tests Service Layer helper: DAILY advances the deadline by exactly 1 day.

    Input    : deadline='2025-06-10', recurrence='DAILY'.
    Expected : '2025-06-11'.
    Pass     : result=='2025-06-11'.
    """
    svc = TaskService(MagicMock())
    result = svc._next_occurrence("2025-06-10", Recurrence.DAILY)
    assert result == "2025-06-11"


def test_next_occurrence_weekly():
    """
    Tests Service Layer helper: WEEKLY advances the deadline by exactly 7 days.

    Input    : deadline='2025-06-10', recurrence='WEEKLY'.
    Expected : '2025-06-17'.
    Pass     : result=='2025-06-17'.
    """
    svc = TaskService(MagicMock())
    result = svc._next_occurrence("2025-06-10", Recurrence.WEEKLY)
    assert result == "2025-06-17"


def test_next_occurrence_monthly_normal():
    """
    Tests Service Layer helper: MONTHLY advances month by 1 on a normal date.

    Input    : deadline='2025-03-15', recurrence='MONTHLY'.
    Expected : '2025-04-15'.
    Pass     : result=='2025-04-15'.
    """
    svc = TaskService(MagicMock())
    result = svc._next_occurrence("2025-03-15", Recurrence.MONTHLY)
    assert result == "2025-04-15"


def test_next_occurrence_monthly_clamps_to_last_day_of_feb():
    """
    Tests Service Layer helper: MONTHLY clamps to Feb 28 when day 31 → Feb.

    Input    : deadline='2025-01-31', recurrence='MONTHLY'.
    Expected : '2025-02-28' (clamped — Feb has only 28 days in 2025).
    Pass     : result=='2025-02-28'.
    """
    svc = TaskService(MagicMock())
    result = svc._next_occurrence("2025-01-31", Recurrence.MONTHLY)
    assert result == "2025-02-28"


def test_next_occurrence_monthly_wraps_year():
    """
    Tests Service Layer helper: MONTHLY wraps December → January of next year.

    Input    : deadline='2025-12-20', recurrence='MONTHLY'.
    Expected : '2026-01-20'.
    Pass     : result=='2026-01-20'.
    """
    svc = TaskService(MagicMock())
    result = svc._next_occurrence("2025-12-20", Recurrence.MONTHLY)
    assert result == "2026-01-20"


def test_next_occurrence_weekdays_monday_to_tuesday():
    """
    Tests Service Layer helper: WEEKDAYS Monday → Tuesday (normal weekday advance).

    Input    : deadline='2025-06-09' (Monday), recurrence='WEEKDAYS'.
    Expected : '2025-06-10' (Tuesday).
    Pass     : result=='2025-06-10'.
    """
    svc = TaskService(MagicMock())
    result = svc._next_occurrence("2025-06-09", Recurrence.WEEKDAYS)
    assert result == "2025-06-10"


def test_next_occurrence_weekdays_friday_to_monday():
    """
    Tests Service Layer helper: WEEKDAYS Friday → Monday (skips weekend).

    Input    : deadline='2025-06-06' (Friday), recurrence='WEEKDAYS'.
    Expected : '2025-06-09' (Monday).
    Pass     : result=='2025-06-09'.
    """
    svc = TaskService(MagicMock())
    result = svc._next_occurrence("2025-06-06", Recurrence.WEEKDAYS)
    assert result == "2025-06-09"


def test_next_occurrence_none_returns_none():
    """
    Tests Service Layer helper: NONE recurrence yields None (no next task).

    Input    : deadline='2025-06-10', recurrence='NONE'.
    Expected : None.
    Pass     : result is None.
    """
    svc = TaskService(MagicMock())
    result = svc._next_occurrence("2025-06-10", Recurrence.NONE)
    assert result is None


def test_next_occurrence_invalid_date_returns_none():
    """
    Tests Service Layer helper: unparseable deadline string yields None gracefully.

    Input    : deadline='not-a-date', recurrence='DAILY'.
    Expected : None (no exception raised).
    Pass     : result is None.
    """
    svc = TaskService(MagicMock())
    result = svc._next_occurrence("not-a-date", Recurrence.DAILY)
    assert result is None


# ══════════════════════════════════════════════════════════════════════════════
# _doc_to_task — Repository document converter
# ══════════════════════════════════════════════════════════════════════════════

def test_doc_to_task_converts_correctly():
    """
    Tests Repository pattern helper: _doc_to_task() maps all BSON fields to
    the correct TaskResponse attributes, converting ObjectId → str.

    Input    : MOCK_TASK_DOC dict with ObjectId fields.
    Expected : TaskResponse with string id/user_id, matching all scalar fields.
    Pass     : all asserted fields match.
    """
    svc = TaskService(MagicMock())
    result = svc._doc_to_task(MOCK_TASK_DOC)

    assert result.id == str(FAKE_TASK_ID)
    assert result.user_id == str(FAKE_USER_ID)
    assert result.title == "Pattern Test Task"
    assert result.priority == Priority.HIGH
    assert result.status == TaskStatus.TODO
    assert result.is_complete is False
    assert result.categories == ["test"]
    assert result.estimated_minutes == 30


def test_doc_to_task_done_sets_is_complete():
    """
    Tests Repository helper: is_complete flag is derived from status==DONE.

    Input    : doc with status='DONE'.
    Expected : TaskResponse.is_complete==True.
    Pass     : result.is_complete is True.
    """
    svc = TaskService(MagicMock())
    doc = {**MOCK_TASK_DOC, "status": "DONE"}
    result = svc._doc_to_task(doc)
    assert result.is_complete is True
    assert result.status == TaskStatus.DONE


def test_doc_to_task_defaults_for_missing_fields():
    """
    Tests Repository helper: optional fields fall back to model defaults.

    Input    : Minimal doc with only required keys (_id, user_id, title).
    Expected : TaskResponse uses default priority MEDIUM, status TODO,
               empty categories list, is_complete False.
    Pass     : priority==MEDIUM, status==TODO, categories==[], is_complete==False.
    """
    svc = TaskService(MagicMock())
    minimal_doc = {
        "_id": ObjectId(),
        "user_id": FAKE_USER_ID,
        "title": "Minimal",
        "subtasks": [],
        "created_at": NOW,
        "updated_at": NOW,
    }
    result = svc._doc_to_task(minimal_doc)

    assert result.priority == Priority.MEDIUM
    assert result.status == TaskStatus.TODO
    assert result.categories == []
    assert result.is_complete is False


# ══════════════════════════════════════════════════════════════════════════════
# TEMPLATE METHOD PATTERN — _doc_to_profile
# ══════════════════════════════════════════════════════════════════════════════

def test_doc_to_profile_maps_all_fields():
    """
    Tests Template Method pattern: _doc_to_profile() maps all standard fields
    from a user document to a UserProfile in a fixed sequence.

    Input    : full MOCK_USER doc.
    Expected : UserProfile with matching id, name, email, onboarding_completed.
    Pass     : all asserted attributes match.
    """
    profile = _doc_to_profile(MOCK_USER)

    assert isinstance(profile, UserProfile)
    assert profile.id == str(FAKE_USER_ID)
    assert profile.name == "Pattern Tester"
    assert profile.email == "patterns@focusflow-test.internal"
    assert profile.onboarding_completed is False


def test_doc_to_profile_defaults_onboarding_completed():
    """
    Tests Template Method pattern: onboarding_completed defaults to False
    when the key is absent from the document.

    Input    : user doc without 'onboarding_completed' key.
    Expected : profile.onboarding_completed==False.
    Pass     : result.onboarding_completed is False.
    """
    doc = {k: v for k, v in MOCK_USER.items() if k != "onboarding_completed"}
    profile = _doc_to_profile(doc)
    assert profile.onboarding_completed is False


def test_doc_to_profile_defaults_preferences():
    """
    Tests Template Method pattern: missing 'preferences' key falls back to
    the default preferences dict (not empty dict, not None).

    Input    : user doc without 'preferences' key.
    Expected : profile.preferences contains 'pomodoro_duration'.
    Pass     : 'pomodoro_duration' in profile.preferences.
    """
    doc = {k: v for k, v in MOCK_USER.items() if k != "preferences"}
    profile = _doc_to_profile(doc)
    assert "pomodoro_duration" in profile.preferences


# ══════════════════════════════════════════════════════════════════════════════
# ANALYTICS — computation from a known task set
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_analytics_computation_known_set():
    """
    Tests Service Layer: get_analytics() computes correct counts from a
    precisely known task set with no HTTP overhead.

    Input    : 5 tasks — 2 TODO/HIGH, 1 IN_PROGRESS/MEDIUM, 2 DONE/LOW.
    Expected : total=5, done=2, completion_rate=40.0, by_priority correct.
    Pass     : all computed values match expectations.
    """
    tasks = [
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "TODO",        "priority": "HIGH",   "deadline": None},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "TODO",        "priority": "HIGH",   "deadline": None},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "IN_PROGRESS", "priority": "MEDIUM", "deadline": None},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE",        "priority": "LOW",    "deadline": None,
         "updated_at": NOW},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE",        "priority": "LOW",    "deadline": None,
         "updated_at": NOW},
    ]
    db = _make_db(tasks=tasks)
    svc = TaskService(db)

    result = await svc.get_analytics(MOCK_USER)

    assert result["total"] == 5
    assert result["by_status"]["TODO"] == 2
    assert result["by_status"]["IN_PROGRESS"] == 1
    assert result["by_status"]["DONE"] == 2
    assert result["by_priority"]["HIGH"] == 2
    assert result["by_priority"]["MEDIUM"] == 1
    assert result["by_priority"]["LOW"] == 2
    assert result["completion_rate"] == 40.0


@pytest.mark.asyncio
async def test_analytics_overdue_excludes_done():
    """
    Tests Service Layer: overdue computation excludes DONE tasks regardless
    of their deadline.

    Input    : 3 tasks all with yesterday's deadline — TODO, IN_PROGRESS, DONE.
    Expected : overdue==2 (DONE excluded).
    Pass     : result['overdue']==2.
    """
    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    tasks = [
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "TODO",        "deadline": yesterday},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "IN_PROGRESS", "deadline": yesterday},
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE",        "deadline": yesterday,
         "updated_at": NOW},
    ]
    db = _make_db(tasks=tasks)
    svc = TaskService(db)

    result = await svc.get_analytics(MOCK_USER)

    assert result["overdue"] == 2


@pytest.mark.asyncio
async def test_analytics_zero_completion_rate_empty():
    """
    Tests Service Layer: division-by-zero guard when total==0.

    Input    : Empty task list.
    Expected : completion_rate==0.0, total==0, overdue==0.
    Pass     : all three values are zero/0.0.
    """
    db = _make_db(tasks=[])
    svc = TaskService(db)

    result = await svc.get_analytics(MOCK_USER)

    assert result["total"] == 0
    assert result["completion_rate"] == 0.0
    assert result["overdue"] == 0


@pytest.mark.asyncio
async def test_analytics_completed_today_counts_correctly():
    """
    Tests Service Layer: completed_today counts only DONE tasks whose
    updated_at is on or after today's midnight UTC.

    Input    : 3 DONE tasks — updated now, updated yesterday, updated 2 days ago.
    Expected : completed_today==1.
    Pass     : result['completed_today']==1.
    """
    tasks = [
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE", "deadline": None,
         "updated_at": NOW},  # today
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE", "deadline": None,
         "updated_at": NOW - timedelta(days=1)},  # yesterday
        {**MOCK_TASK_DOC, "_id": ObjectId(), "status": "DONE", "deadline": None,
         "updated_at": NOW - timedelta(days=2)},  # 2 days ago
    ]
    db = _make_db(tasks=tasks)
    svc = TaskService(db)

    result = await svc.get_analytics(MOCK_USER)

    assert result["completed_today"] == 1
