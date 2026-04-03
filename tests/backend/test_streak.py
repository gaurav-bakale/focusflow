"""
Streak Calculation Test Suite — FocusFlow

Tests the _calculate_streak function and the /api/timer/stats endpoint
returning streak_days.

Framework: pytest + httpx + AsyncMock

Test IDs: TC-ST01 through TC-ST08
"""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, date, timedelta
from bson import ObjectId

from app.main import app
from app.db import get_db as get_db_dependency
from app.auth import get_current_user as get_current_user_dependency
from app.routers.timer import _calculate_streak


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


def _make_mock_db_for_streak(completion_dates):
    """
    Create a mock DB that returns the given completion dates from the
    tasks aggregation pipeline used by _calculate_streak.
    """
    mock_db = MagicMock()

    # Mock the aggregation pipeline for streak
    agg_results = [{"_id": d} for d in completion_dates]
    mock_agg = MagicMock()
    mock_agg.to_list = AsyncMock(return_value=agg_results)
    mock_db["tasks"].aggregate = MagicMock(return_value=mock_agg)

    return mock_db


# ── TC-ST01: 3-day streak ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_streak_3_consecutive_days():
    """
    TC-ST01: User completed tasks today, yesterday, and day before.
    Oracle: streak_days == 3
    """
    today = date.today()
    dates = [
        (today - timedelta(days=i)).isoformat()
        for i in range(3)
    ]
    mock_db = _make_mock_db_for_streak(dates)
    streak = await _calculate_streak(mock_db, ObjectId(FAKE_USER_ID))
    assert streak == 3


# ── TC-ST02: No completed tasks ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_streak_no_completions():
    """
    TC-ST02: User has no completed tasks at all.
    Oracle: streak_days == 0
    """
    mock_db = _make_mock_db_for_streak([])
    streak = await _calculate_streak(mock_db, ObjectId(FAKE_USER_ID))
    assert streak == 0


# ── TC-ST03: Gap breaks streak ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_streak_gap_breaks_it():
    """
    TC-ST03: User completed tasks today and 3 days ago but not yesterday.
    Oracle: streak_days == 1 (only today counts)
    """
    today = date.today()
    dates = [
        today.isoformat(),
        (today - timedelta(days=3)).isoformat(),
    ]
    mock_db = _make_mock_db_for_streak(dates)
    streak = await _calculate_streak(mock_db, ObjectId(FAKE_USER_ID))
    assert streak == 1


# ── TC-ST04: Yesterday only (mid-day grace) ─────────────────────────────────

@pytest.mark.asyncio
async def test_streak_yesterday_only():
    """
    TC-ST04: User completed tasks yesterday but not yet today.
    The streak should still count yesterday (mid-day grace).
    Oracle: streak_days == 1
    """
    today = date.today()
    dates = [(today - timedelta(days=1)).isoformat()]
    mock_db = _make_mock_db_for_streak(dates)
    streak = await _calculate_streak(mock_db, ObjectId(FAKE_USER_ID))
    assert streak == 1


# ── TC-ST05: Long streak ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_streak_7_day():
    """
    TC-ST05: User has completed tasks every day for 7 days straight.
    Oracle: streak_days == 7
    """
    today = date.today()
    dates = [
        (today - timedelta(days=i)).isoformat()
        for i in range(7)
    ]
    mock_db = _make_mock_db_for_streak(dates)
    streak = await _calculate_streak(mock_db, ObjectId(FAKE_USER_ID))
    assert streak == 7


# ── TC-ST06: Old completions only (no recent) ───────────────────────────────

@pytest.mark.asyncio
async def test_streak_old_completions_only():
    """
    TC-ST06: User completed tasks 5 days ago but nothing since.
    Oracle: streak_days == 0
    """
    today = date.today()
    dates = [(today - timedelta(days=5)).isoformat()]
    mock_db = _make_mock_db_for_streak(dates)
    streak = await _calculate_streak(mock_db, ObjectId(FAKE_USER_ID))
    assert streak == 0


# ── TC-ST07: Stats endpoint returns streak_days ──────────────────────────────

@pytest.mark.asyncio
async def test_stats_endpoint_returns_streak():
    """
    TC-ST07: GET /api/timer/stats includes streak_days in response.
    Oracle: 200 with streak_days field present
    """
    today = date.today()
    dates = [
        (today - timedelta(days=i)).isoformat()
        for i in range(3)
    ]

    # Use separate collection mocks to avoid MagicMock auto-create issues
    tasks_col = MagicMock()
    sessions_col = MagicMock()

    tasks_col.count_documents = AsyncMock(return_value=2)

    sessions_agg = MagicMock()
    sessions_agg.to_list = AsyncMock(return_value=[{"total": 120}])
    sessions_col.aggregate = MagicMock(return_value=sessions_agg)

    streak_agg = MagicMock()
    streak_agg.to_list = AsyncMock(return_value=[{"_id": d} for d in dates])
    tasks_col.aggregate = MagicMock(return_value=streak_agg)

    mock_db = MagicMock()
    mock_db.__getitem__ = lambda self, key: {"tasks": tasks_col, "sessions": sessions_col}[key]

    app.dependency_overrides[get_current_user_dependency] = _override_user()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/timer/stats", headers=get_auth_header())

    assert resp.status_code == 200
    data = resp.json()
    assert "streak_days" in data
    assert data["streak_days"] == 3
    assert data["tasks_done"] == 2
    assert data["deep_work_hours"] == 2.0


# ── TC-ST08: Stats endpoint with zero streak ─────────────────────────────────

@pytest.mark.asyncio
async def test_stats_endpoint_zero_streak():
    """
    TC-ST08: GET /api/timer/stats when user has no completed tasks.
    Oracle: 200 with streak_days == 0
    """
    tasks_col = MagicMock()
    sessions_col = MagicMock()

    tasks_col.count_documents = AsyncMock(return_value=0)

    sessions_agg = MagicMock()
    sessions_agg.to_list = AsyncMock(return_value=[])
    sessions_col.aggregate = MagicMock(return_value=sessions_agg)

    streak_agg = MagicMock()
    streak_agg.to_list = AsyncMock(return_value=[])
    tasks_col.aggregate = MagicMock(return_value=streak_agg)

    mock_db = MagicMock()
    mock_db.__getitem__ = lambda self, key: {"tasks": tasks_col, "sessions": sessions_col}[key]

    app.dependency_overrides[get_current_user_dependency] = _override_user()
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/timer/stats", headers=get_auth_header())

    assert resp.status_code == 200
    assert resp.json()["streak_days"] == 0
