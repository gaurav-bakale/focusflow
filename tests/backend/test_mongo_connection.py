import os

import pytest

from app.db import close_db, connect_db, get_db


ATLAS_URI = (
    "mongodb+srv://karans0811_db_user:XAEmhXQiPJhhDyCD"
    "@cluster0.vvzmrjp.mongodb.net/focusflow_test"
    "?retryWrites=true&w=majority&appName=Cluster0"
)


@pytest.mark.asyncio
async def test_mongo_connection_health(monkeypatch):
    # On CI use the already-configured MONGODB_URL (local mongo service).
    # Locally, fall back to the Atlas URI so the test is still useful.
    if "MONGODB_URL" not in os.environ:
        monkeypatch.setenv("MONGODB_URL", ATLAS_URI)

    monkeypatch.setenv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "3000")
    monkeypatch.setenv("MONGODB_CONNECT_TIMEOUT_MS", "3000")

    try:
        await connect_db()
        db = get_db()
        await db.command("ping")
    except Exception:
        if os.getenv("GITHUB_ACTIONS"):
            raise
        pytest.skip("MongoDB not reachable locally; skipping health-check test.")
    finally:
        try:
            await close_db()
        except Exception:
            pass


@pytest.mark.asyncio
async def test_mongo_connection_invalid_url_raises(monkeypatch):
    await close_db()

    monkeypatch.setenv(
        "MONGODB_URL",
        "mongodb://127.0.0.1:27018/focusflow_test",
    )
    monkeypatch.setenv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "500")
    monkeypatch.setenv("MONGODB_CONNECT_TIMEOUT_MS", "500")

    with pytest.raises(RuntimeError):
        await connect_db()
