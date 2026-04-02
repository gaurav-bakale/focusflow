"""
Shared test fixtures for the FocusFlow backend test suite.

Uses mongomock-motor (in-memory) for all tests — no real MongoDB needed.

Each test module gets its own mock client (module-scoped) so mongomock_motor's
WorkerThread is always created inside the module's running event loop, avoiding
"attached to a different loop" errors on Python 3.12+.

Usage
-----
    PYTHONPATH=backend pytest tests/ -v
"""

import os
import sys
from pathlib import Path

import pytest_asyncio
import mongomock_motor
from dotenv import load_dotenv
from httpx import AsyncClient, ASGITransport

# ── Path setup ────────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env", override=False)
load_dotenv(Path(__file__).parent.parent / ".env", override=False)

os.environ.setdefault("MONGODB_DB", "focusflow_test")

# ── Imports (after path setup) ────────────────────────────────────────────────
from app.main import app  # noqa: E402
import app.db as _db_module  # noqa: E402
import app.main as _main_module  # noqa: E402
from app.db import get_db  # noqa: E402
from app.auth import hash_password  # noqa: E402

# ── Patch app.main's lifespan so it never touches real MongoDB ────────────────
# The ASGI lifespan calls connect_db() on startup and close_db() on shutdown.
# By replacing these references in app.main's namespace the lifespan becomes
# a no-op, which keeps the module-scoped mock alive between fixture calls.

async def _mock_connect_db():
    pass  # mock client is set by _mock_db fixture; this is a no-op


async def _mock_close_db():
    pass  # keep mock alive; don't clear _db_module._client


_main_module.connect_db = _mock_connect_db
_main_module.close_db = _mock_close_db


# ── Module-scoped mock DB (autouse = runs for every module automatically) ─────

@pytest_asyncio.fixture(scope="session")
async def _mock_db():
    """
    Single in-memory MongoDB for the whole test session.
    Session scope means one persistent event loop — no per-module loop teardown
    that would strand mongomock_motor's WorkerThread on a dead loop.
    """
    mock_mongo = mongomock_motor.AsyncMongoMockClient()
    db = mock_mongo["focusflow_test"]

    # Wire into app.db globals so direct connect_db() calls return early
    _db_module._client = mock_mongo
    _db_module._db = db

    # Override FastAPI dependency so all route handlers get the mock DB
    app.dependency_overrides[get_db] = lambda: db

    # Seed demo user (needed by test_login_demo_user)
    existing = await db["users"].find_one({"email": "demo@focusflow.app"})
    if not existing:
        await db["users"].insert_one({
            "name": "Demo User",
            "email": "demo@focusflow.app",
            "password_hash": hash_password("Demo@1234"),
            "onboarding_completed": True,
            "preferences": {
                "pomodoro_duration": 25,
                "short_break": 5,
                "long_break": 15,
                "theme": "light",
            },
        })

    yield db, mock_mongo

    app.dependency_overrides.pop(get_db, None)
    _db_module._client = None
    _db_module._db = None


@pytest_asyncio.fixture(autouse=True)
async def _rewire_mock_db(_mock_db):
    """
    Re-wire app.db globals and dependency override before every test.
    Some legacy test files call app.db.close_db() directly, which clears the
    module-level _client/_db; this fixture silently restores them so subsequent
    tests are not affected.
    """
    db, mock_mongo = _mock_db
    _db_module._client = mock_mongo
    _db_module._db = db
    app.dependency_overrides[get_db] = lambda: db
    yield


# ── Module-scoped HTTP client ─────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def client(_mock_db):
    """Async HTTP client wired to the FastAPI ASGI app, backed by mock DB."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest_asyncio.fixture(scope="session")
async def db(_mock_db):
    """Return the mock test-database handle (used for teardown cleanup)."""
    db, _mongo = _mock_db
    return db


# ── Auth helpers ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def auth_headers(client):
    """Register (or re-login) a test user and return Bearer auth headers."""
    payload = {
        "name": "Fixture User",
        "email": "fixture_user@focusflow-test.internal",
        "password": "FixturePass1!",
    }
    resp = await client.post("/api/auth/register", json=payload)
    if resp.status_code == 409:
        resp = await client.post("/api/auth/login", json={
            "email": payload["email"],
            "password": payload["password"],
        })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(scope="session")
async def test_task(client, auth_headers):
    """Create a single task for the fixture user and return its response dict."""
    resp = await client.post(
        "/api/tasks",
        json={"title": "Fixture Task", "priority": "MEDIUM"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, f"Fixture task creation failed: {resp.text}"
    return resp.json()
