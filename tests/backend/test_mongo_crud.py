"""
MongoDB CRUD Integration Tests

Connects to Atlas, inserts real documents across all focusflow collections
(users, tasks, pomodoro_sessions, time_blocks), verifies reads/updates/deletes,
then cleans up. Uses backend/.env for MONGODB_URL.
"""

import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
import pytest_asyncio
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "backend" / ".env")

from app.db import close_db, connect_db, get_db  # noqa: E402

ATLAS_URI = os.getenv("MONGODB_URL")


def now_utc():
    return datetime.now(timezone.utc)


@pytest_asyncio.fixture
async def db():
    if not ATLAS_URI:
        pytest.skip("MONGODB_URL not set; skipping CRUD tests.")
    try:
        await connect_db()
    except RuntimeError:
        pytest.skip("MongoDB Atlas not reachable; skipping CRUD tests.")
    yield get_db()
    await close_db()


# ── User CRUD ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_insert_and_find_user(db):
    user = {
        "name": "Test User",
        "email": "testuser_crud@focusflow.test",
        "password_hash": "hashed_secret",
        "created_at": now_utc(),
    }
    result = await db["users"].insert_one(user)
    assert result.inserted_id is not None

    found = await db["users"].find_one({"_id": result.inserted_id})
    assert found is not None
    assert found["email"] == "testuser_crud@focusflow.test"

    await db["users"].delete_one({"_id": result.inserted_id})


@pytest.mark.asyncio
async def test_update_user(db):
    user = {
        "name": "Update Me",
        "email": "updateme_crud@focusflow.test",
        "password_hash": "hash",
        "created_at": now_utc(),
    }
    result = await db["users"].insert_one(user)
    oid = result.inserted_id

    await db["users"].update_one({"_id": oid}, {"$set": {"name": "Updated Name"}})
    updated = await db["users"].find_one({"_id": oid})
    assert updated["name"] == "Updated Name"

    await db["users"].delete_one({"_id": oid})


# ── Task CRUD ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_insert_and_find_task(db):
    task = {
        "user_id": "test_user_id",
        "title": "Write integration tests",
        "description": "Cover all collections",
        "priority": "HIGH",
        "status": "TODO",
        "subtasks": [],
        "is_complete": False,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    result = await db["tasks"].insert_one(task)
    assert result.inserted_id is not None

    found = await db["tasks"].find_one({"_id": result.inserted_id})
    assert found["title"] == "Write integration tests"
    assert found["priority"] == "HIGH"

    await db["tasks"].delete_one({"_id": result.inserted_id})


@pytest.mark.asyncio
async def test_update_task_status(db):
    task = {
        "user_id": "test_user_id",
        "title": "Status update task",
        "priority": "MEDIUM",
        "status": "TODO",
        "subtasks": [],
        "is_complete": False,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    result = await db["tasks"].insert_one(task)
    oid = result.inserted_id

    await db["tasks"].update_one(
        {"_id": oid},
        {"$set": {"status": "DONE", "is_complete": True, "updated_at": now_utc()}},
    )
    updated = await db["tasks"].find_one({"_id": oid})
    assert updated["status"] == "DONE"
    assert updated["is_complete"] is True

    await db["tasks"].delete_one({"_id": oid})


@pytest.mark.asyncio
async def test_insert_task_with_subtasks(db):
    task = {
        "user_id": "test_user_id",
        "title": "Task with subtasks",
        "priority": "LOW",
        "status": "IN_PROGRESS",
        "subtasks": [
            {"id": "s1", "title": "Subtask A", "status": "TODO"},
            {"id": "s2", "title": "Subtask B", "status": "DONE"},
        ],
        "is_complete": False,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    result = await db["tasks"].insert_one(task)
    found = await db["tasks"].find_one({"_id": result.inserted_id})
    assert len(found["subtasks"]) == 2
    assert found["subtasks"][1]["status"] == "DONE"

    await db["tasks"].delete_one({"_id": result.inserted_id})


# ── Pomodoro Session CRUD ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_insert_and_find_pomodoro_session(db):
    session = {
        "user_id": "test_user_id",
        "task_id": None,
        "phase": "FOCUS",
        "duration_minutes": 25,
        "completed_at": now_utc(),
    }
    result = await db["pomodoro_sessions"].insert_one(session)
    assert result.inserted_id is not None

    found = await db["pomodoro_sessions"].find_one({"_id": result.inserted_id})
    assert found["phase"] == "FOCUS"
    assert found["duration_minutes"] == 25

    await db["pomodoro_sessions"].delete_one({"_id": result.inserted_id})


# ── Time Block CRUD ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_insert_and_find_time_block(db):
    block = {
        "user_id": "test_user_id",
        "title": "Deep work block",
        "start_time": "2026-04-01T09:00:00Z",
        "end_time": "2026-04-01T11:00:00Z",
        "task_id": None,
    }
    result = await db["time_blocks"].insert_one(block)
    assert result.inserted_id is not None

    found = await db["time_blocks"].find_one({"_id": result.inserted_id})
    assert found["title"] == "Deep work block"

    await db["time_blocks"].delete_one({"_id": result.inserted_id})


# ── Edge case ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_nonexistent_returns_zero(db):
    from bson import ObjectId
    result = await db["tasks"].delete_one({"_id": ObjectId()})
    assert result.deleted_count == 0
