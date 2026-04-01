"""
Shared test fixtures for the FocusFlow backend test suite.

Design Patterns exercised here
--------------------------------
Dependency Injection — FastAPI's app.dependency_overrides lets us swap the
                       real DB and auth dependencies for test doubles without
                       touching production code.
Factory              — The `client` fixture acts as a factory: it constructs
                       a fresh AsyncClient wrapping the ASGI app for each
                       test module.

Environment
-----------
Set MONGODB_URL=mongodb://localhost:27017/focusflow_test to use a real local
MongoDB.  When running with mocked dependencies (see individual test files)
no real DB connection is required.

Usage
-----
    PYTHONPATH=backend pytest tests/ -v
"""

import os
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from dotenv import load_dotenv
from httpx import AsyncClient, ASGITransport

# ── Path setup ────────────────────────────────────────────────────────────────
# Ensure `backend/` is on sys.path so `from app.xxx import …` works.
BACKEND_DIR = Path(__file__).parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Load env — prefer a backend/.env if present, then fall back to root .env
load_dotenv(BACKEND_DIR / ".env", override=False)
load_dotenv(Path(__file__).parent.parent / ".env", override=False)

# Point tests at an isolated test database by default
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/focusflow_test")
os.environ.setdefault("MONGODB_DB", "focusflow_test")

# ── Imports (after path setup) ────────────────────────────────────────────────
from app.main import app  # noqa: E402
from app.db import connect_db, close_db, get_db  # noqa: E402


# ── Module-scoped HTTP client ─────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="module")
async def client():
    """
    Async HTTP client wired directly to the FastAPI ASGI app.

    Design pattern: Factory — produces a ready-to-use client for each test
    module without spinning up a real HTTP server.

    Arrange: connect to the test DB via the app lifespan.
    Yield:   the configured AsyncClient.
    Teardown: lifespan closes the DB connection.
    """
    await connect_db()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    await close_db()


@pytest_asyncio.fixture(scope="module")
async def db(client):  # noqa: F811  (client triggers connect_db)
    """Return the live test-database handle (used for teardown cleanup)."""
    return get_db()


# ── Auth helpers ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="module")
async def auth_headers(client):
    """
    Register (or re-login) a test user and return Bearer auth headers.

    Design pattern: Dependency Injection — the token is derived once per
    module and injected into any test that needs authenticated requests.

    Input    : POST /api/auth/register or /api/auth/login.
    Expected : HTTP 201 or 200 → access_token in response body.
    Pass     : Returns {"Authorization": "Bearer <token>"}.
    """
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


@pytest_asyncio.fixture(scope="module")
async def test_task(client, auth_headers):
    """
    Create a single task for the fixture user and return its response dict.

    Input    : POST /api/tasks with minimal payload.
    Expected : HTTP 201 with task id set.
    Pass     : Returns full task response dict.
    """
    resp = await client.post(
        "/api/tasks",
        json={"title": "Fixture Task", "priority": "MEDIUM"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, f"Fixture task creation failed: {resp.text}"
    return resp.json()
