import os

import pytest

from app.db import close_db, connect_db, get_db


@pytest.mark.asyncio
async def test_mongo_connection_health(monkeypatch):
    # Use the same DB name as CI unless running locally without a configured MONGODB_URL.
    if "MONGODB_URL" not in os.environ:
        monkeypatch.setenv("MONGODB_URL", "mongodb://localhost:27017/focusflow_test")

    # Keep CI/local failure modes fast.
    monkeypatch.setenv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "3000")
    monkeypatch.setenv("MONGODB_CONNECT_TIMEOUT_MS", "3000")

    try:
        await connect_db()
        db = get_db()

        # Verify we can successfully execute a command against the server.
        await db.command("ping")
    except Exception:
        # Locally the developer may not have a running MongoDB instance.
        # CI (GitHub Actions) must have Mongo, so we fail there.
        if os.getenv("GITHUB_ACTIONS"):
            raise
        pytest.skip("MongoDB not reachable locally; skipping health-check test.")
    finally:
        # Ensure we always close the client if it connected.
        try:
            await close_db()
        except Exception:
            pass


@pytest.mark.asyncio
async def test_mongo_connection_invalid_url_raises(monkeypatch):
    # Ensure previous tests don't short-circuit due to the singleton already being connected.
    await close_db()

    monkeypatch.setenv("MONGODB_URL", "mongodb://127.0.0.1:27018/focusflow_test")
    monkeypatch.setenv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "500")
    monkeypatch.setenv("MONGODB_CONNECT_TIMEOUT_MS", "500")

    with pytest.raises(RuntimeError):
        await connect_db()

