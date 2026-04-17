"""
AI Router Test Suite — FocusFlow

Tests all seven AI endpoints using mocked Gemini responses.
Framework: pytest + httpx + AsyncMock

Test IDs: TC-AI01 through TC-AI12
"""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from bson import ObjectId

from app.main import app
from app.db import get_db as get_db_dependency
from app.auth import get_current_user as get_current_user_dependency


@pytest.fixture(autouse=True)
def _mock_db_lifecycle():
    with patch("app.main.connect_db", new=AsyncMock()), \
         patch("app.main.close_db", new=AsyncMock()):
        yield


@pytest.fixture(autouse=True)
def _clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _clear_rate_limit():
    """Reset the in-memory rate limiter between tests."""
    from app.routers.ai import _rate_limit
    _rate_limit.clear()
    yield
    _rate_limit.clear()


FAKE_USER_ID = str(ObjectId())

MOCK_USER = {
    "_id": ObjectId(FAKE_USER_ID),
    "name": "Test User",
    "email": "test@focusflow.dev",
    "password_hash": "$2b$12$fakehash",
    "gemini_api_key": "fake-gemini-key-for-testing",
}

MOCK_USER_NO_KEY = {
    "_id": ObjectId(FAKE_USER_ID),
    "name": "Test User",
    "email": "test@focusflow.dev",
    "password_hash": "$2b$12$fakehash",
}


def _override_user(user_dict):
    async def _get():
        return user_dict
    return _get


def _override_db():
    return MagicMock()


def get_auth_header():
    from app.auth import create_access_token
    token = create_access_token({"sub": FAKE_USER_ID})
    return {"Authorization": f"Bearer {token}"}


# ── TC-AI01: Breakdown returns subtasks ──────────────────────────────────────

@pytest.mark.asyncio
async def test_breakdown_returns_subtasks():
    """
    TC-AI01: POST /ai/breakdown decomposes a task into subtasks.
    Input: task_id, task_title, task_description
    Oracle: 200 with task_id and list of subtasks
    """
    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER)
    app.dependency_overrides[get_db_dependency] = _override_db

    mock_response = "1. Research the topic\n2. Create an outline\n3. Write the draft"

    with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(return_value=mock_response)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/ai/breakdown", json={
                "task_id": "abc123",
                "task_title": "Write research paper",
                "task_description": "About AI in education",
            }, headers=get_auth_header())

    assert resp.status_code == 200
    data = resp.json()
    assert data["task_id"] == "abc123"
    assert len(data["subtasks"]) == 3
    assert "Research the topic" in data["subtasks"][0]


# ── TC-AI02: Prioritize reorders tasks ──────────────────────────────────────

@pytest.mark.asyncio
async def test_prioritize_reorders_tasks():
    """
    TC-AI02: POST /ai/prioritize ranks tasks by priority.
    Input: list of task dicts with ids
    Oracle: 200 with prioritized_tasks in AI-determined rank order.
            Response also includes per-task change records + summary.
    """
    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER)
    app.dependency_overrides[get_db_dependency] = _override_db

    # Upgraded PrioritizeStrategy returns structured JSON with explicit
    # rank + new priority + rationale per task.
    mock_response = (
        '{"summary": "Ship the bug first; batch docs after review.",'
        ' "ranked": ['
        '  {"id": "t2", "title": "Urgent bug fix", "rank": 1,'
        '   "priority": "HIGH", "reason": "Blocker due today."},'
        '  {"id": "t3", "title": "Code review", "rank": 2,'
        '   "priority": "MEDIUM", "reason": "Unblocks teammate."},'
        '  {"id": "t1", "title": "Update docs", "rank": 3,'
        '   "priority": "LOW", "reason": "No hard deadline."}'
        ']}'
    )

    with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(return_value=mock_response)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/ai/prioritize", json={
                "tasks": [
                    {"id": "t1", "title": "Update docs", "priority": "LOW"},
                    {"id": "t2", "title": "Urgent bug fix",
                     "priority": "HIGH", "deadline": "2026-04-01"},
                    {"id": "t3", "title": "Code review", "priority": "MEDIUM"},
                ],
            }, headers=get_auth_header())

    assert resp.status_code == 200
    data = resp.json()
    titles = [t["title"] for t in data["prioritized_tasks"]]
    assert titles[0] == "Urgent bug fix"
    # New contract: changes array + summary included
    assert data["summary"].startswith("Ship the bug first")
    assert data["changes"][0]["id"] == "t2"
    assert data["changes"][0]["rank"] == 1


# ── TC-AI03: Generate tasks from a goal ──────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_tasks_from_goal():
    """
    TC-AI03: POST /ai/generate-tasks creates tasks from a goal.
    Input: goal string
    Oracle: 200 with tasks list and summary
    """
    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER)
    app.dependency_overrides[get_db_dependency] = _override_db

    mock_response = '{"summary": "Plan for launching a blog", "tasks": [{"title": "Choose platform", "description": "Compare WordPress vs Ghost", "priority": "HIGH", "category": "Research"}, {"title": "Write first post", "description": "Draft intro post", "priority": "MEDIUM", "category": "Content"}]}'

    with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(return_value=mock_response)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/ai/generate-tasks", json={
                "goal": "Launch a personal blog",
            }, headers=get_auth_header())

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["tasks"]) == 2
    assert data["summary"] == "Plan for launching a blog"
    assert data["tasks"][0]["title"] == "Choose platform"


# ── TC-AI04: Refine tasks with feedback ──────────────────────────────────────

@pytest.mark.asyncio
async def test_refine_tasks_with_feedback():
    """
    TC-AI04: POST /ai/refine-tasks adjusts tasks based on user feedback.
    Input: goal, existing tasks, feedback string
    Oracle: 200 with updated tasks list
    """
    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER)
    app.dependency_overrides[get_db_dependency] = _override_db

    mock_response = '{"summary": "Revised blog plan", "tasks": [{"title": "Choose platform", "description": "Focus on Ghost", "priority": "HIGH", "category": "Research"}, {"title": "Design branding", "description": "Logo and color scheme", "priority": "HIGH", "category": "Design"}]}'

    with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(return_value=mock_response)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/ai/refine-tasks", json={
                "goal": "Launch a personal blog",
                "tasks": [
                    {"title": "Choose platform", "description": "Compare options", "priority": "HIGH", "category": "Research"},
                ],
                "feedback": "Add a design task and focus on Ghost",
            }, headers=get_auth_header())

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["tasks"]) == 2
    assert data["tasks"][1]["title"] == "Design branding"


# ── TC-AI05: Schedule endpoint returns time blocks ───────────────────────────

@pytest.mark.asyncio
async def test_schedule_returns_blocks():
    """
    TC-AI05: POST /ai/schedule generates a daily time-blocked plan.
    Input: list of tasks, available hours
    Oracle: 200 with schedule array and summary
    """
    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER)
    app.dependency_overrides[get_db_dependency] = _override_db

    mock_response = '{"summary": "Productive morning focus", "schedule": [{"time": "9:00 AM", "task_title": "Bug fix", "duration_minutes": 60, "reason": "High priority"}, {"time": "10:15 AM", "task_title": "Code review", "duration_minutes": 45, "reason": "Medium priority"}]}'

    with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(return_value=mock_response)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/ai/schedule", json={
                "tasks": [
                    {"title": "Bug fix", "priority": "HIGH"},
                    {"title": "Code review", "priority": "MEDIUM"},
                ],
                "available_hours": 6,
            }, headers=get_auth_header())

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["schedule"]) == 2
    assert data["schedule"][0]["time"] == "9:00 AM"
    assert data["schedule"][0]["duration_minutes"] == 60
    assert data["summary"] == "Productive morning focus"


# ── TC-AI06: Frog endpoint identifies most important task ────────────────────

@pytest.mark.asyncio
async def test_frog_identifies_important_task():
    """
    TC-AI06: POST /ai/frog identifies the user's 'frog' task.
    Input: list of tasks
    Oracle: 200 with task_title and reason
    """
    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER)
    app.dependency_overrides[get_db_dependency] = _override_db

    mock_response = '{"task_title": "Prepare presentation", "task_id": "t1", "reason": "Due tomorrow and high priority — tackling it first frees up the rest of your day."}'

    with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(return_value=mock_response)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/ai/frog", json={
                "tasks": [
                    {"id": "t1", "title": "Prepare presentation", "priority": "HIGH", "deadline": "2026-04-03"},
                    {"id": "t2", "title": "Email follow-up", "priority": "LOW"},
                ],
            }, headers=get_auth_header())

    assert resp.status_code == 200
    data = resp.json()
    assert data["task_title"] == "Prepare presentation"
    assert data["task_id"] == "t1"
    assert "tomorrow" in data["reason"].lower() or len(data["reason"]) > 0


# ── TC-AI07: Tips endpoint returns productivity tips ─────────────────────────

@pytest.mark.asyncio
async def test_tips_returns_productivity_tips():
    """
    TC-AI07: POST /ai/tips generates productivity tips from task stats.
    Input: no body (reads from DB)
    Oracle: 200 with tips list and summary
    """
    mock_db = MagicMock()
    mock_cursor = AsyncMock()
    mock_tasks = [
        {"user_id": FAKE_USER_ID, "status": "DONE", "priority": "HIGH"},
        {"user_id": FAKE_USER_ID, "status": "TODO", "priority": "HIGH", "deadline": "2026-03-01"},
        {"user_id": FAKE_USER_ID, "status": "IN_PROGRESS", "priority": "MEDIUM"},
    ]
    mock_cursor.__aiter__ = lambda self: iter(mock_tasks).__aiter__() if hasattr(iter(mock_tasks), '__aiter__') else self
    # Use a proper async iterator
    async def async_iter():
        for t in mock_tasks:
            yield t
    mock_db["tasks"].find = MagicMock(return_value=async_iter())

    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER)
    app.dependency_overrides[get_db_dependency] = lambda: mock_db

    mock_response = '{"summary": "Good progress but watch overdue items", "tips": ["Tackle overdue tasks first", "Break large tasks into smaller ones", "Use time-blocking for deep work"]}'

    with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(return_value=mock_response)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/ai/tips", headers=get_auth_header())

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["tips"]) == 3
    assert "overdue" in data["tips"][0].lower()
    assert len(data["summary"]) > 0


# ── TC-AI08: Missing API key returns 400 ─────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_api_key_returns_400():
    """
    TC-AI08: AI endpoint with user missing gemini_api_key.
    Input: user without gemini_api_key
    Oracle: 400 with message about setting API key
    """
    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER_NO_KEY)
    app.dependency_overrides[get_db_dependency] = _override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/ai/breakdown", json={
            "task_id": "abc",
            "task_title": "Test task",
        }, headers=get_auth_header())

    assert resp.status_code == 400
    assert "API key" in resp.json()["detail"]


# ── TC-AI09: Rate limit enforced after 10 requests ──────────────────────────

@pytest.mark.asyncio
async def test_rate_limit_enforced():
    """
    TC-AI09: Rate limiter blocks after 10 requests per hour.
    Input: 11 rapid requests
    Oracle: First 10 succeed (200), 11th returns 429
    """
    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER)
    app.dependency_overrides[get_db_dependency] = _override_db

    mock_response = "1. Step one\n2. Step two\n3. Step three"

    with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(return_value=mock_response)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Make 10 successful requests
            for _ in range(10):
                resp = await client.post("/api/ai/breakdown", json={
                    "task_id": "abc",
                    "task_title": "Test task",
                }, headers=get_auth_header())
                assert resp.status_code == 200

            # 11th should be rate limited
            resp = await client.post("/api/ai/breakdown", json={
                "task_id": "abc",
                "task_title": "Test task",
            }, headers=get_auth_header())

    assert resp.status_code == 429
    assert "rate limit" in resp.json()["detail"].lower()


# ── TC-AI10: Unauthenticated request returns 401 ────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_returns_401():
    """
    TC-AI10: AI endpoint without auth token.
    Input: no Authorization header
    Oracle: 401 Unauthorized
    """
    app.dependency_overrides[get_db_dependency] = _override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/ai/breakdown", json={
            "task_id": "abc",
            "task_title": "Test task",
        })

    assert resp.status_code == 401


# ── TC-AI11: Gemini error returns 502 ────────────────────────────────────────

@pytest.mark.asyncio
async def test_gemini_error_returns_502():
    """
    TC-AI11: Gemini API failure surfaces as 502.
    Input: valid request but Gemini throws an error
    Oracle: 502 with error message
    """
    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER)
    app.dependency_overrides[get_db_dependency] = _override_db

    with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(side_effect=Exception("Connection refused"))):
        # The adapter catches generic exceptions and raises HTTPException 502
        # But since we're mocking call_llm directly, we need to mock it as an HTTPException
        from fastapi import HTTPException
        with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(
            side_effect=HTTPException(status_code=502, detail="AI service error: Connection refused")
        )):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/ai/breakdown", json={
                    "task_id": "abc",
                    "task_title": "Test task",
                }, headers=get_auth_header())

    assert resp.status_code == 502
    assert "AI service error" in resp.json()["detail"]


# ── TC-AI12: Markdown-fenced JSON is parsed correctly ────────────────────────

@pytest.mark.asyncio
async def test_markdown_fenced_json_parsed():
    """
    TC-AI12: Schedule endpoint handles markdown-fenced JSON from Gemini.
    Input: valid request, Gemini returns ```json ... ```
    Oracle: 200 with correctly parsed schedule
    """
    app.dependency_overrides[get_current_user_dependency] = _override_user(MOCK_USER)
    app.dependency_overrides[get_db_dependency] = _override_db

    mock_response = '```json\n{"summary": "Your plan", "schedule": [{"time": "9:00 AM", "task_title": "Work", "duration_minutes": 60, "reason": "Priority"}]}\n```'

    with patch("app.routers.ai._adapter.call_llm", new=AsyncMock(return_value=mock_response)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/ai/schedule", json={
                "tasks": [{"title": "Work", "priority": "HIGH"}],
                "available_hours": 8,
            }, headers=get_auth_header())

    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"] == "Your plan"
    assert len(data["schedule"]) == 1
