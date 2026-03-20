"""
Database Connection Module - Singleton Pattern

Manages a single Motor async MongoDB client instance,
shared across all repositories via FastAPI dependency injection.
"""

import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import PyMongoError

_client: AsyncIOMotorClient = None
_db = None


async def connect_db():
    """Open the MongoDB connection pool at application startup.

    Validates connectivity by issuing a `ping` against the server.
    """
    global _client, _db
    if _client is not None and _db is not None:
        return

    url = os.getenv("MONGODB_URL", "mongodb://localhost:27017/focusflow")
    server_selection_timeout_ms = int(os.getenv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "5000"))
    connect_timeout_ms = int(os.getenv("MONGODB_CONNECT_TIMEOUT_MS", "5000"))

    _client = AsyncIOMotorClient(
        url,
        serverSelectionTimeoutMS=server_selection_timeout_ms,
        connectTimeoutMS=connect_timeout_ms,
    )

    try:
        # Force a real round-trip to verify the connection is usable.
        await _client.admin.command("ping")
    except PyMongoError as e:
        _client.close()
        _client = None
        _db = None
        raise RuntimeError(f"MongoDB connection failed: {e}") from e

    # Prefer the DB specified in the connection URI; fall back to MONGODB_DB/default.
    try:
        default_db = _client.get_default_database()
    except Exception:
        default_db = None

    _db = default_db or _client[os.getenv("MONGODB_DB", "focusflow")]
    print("[DB] MongoDB connection established")


async def close_db():
    """Close the MongoDB connection pool at application shutdown."""
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        print("[DB] MongoDB connection closed")


def get_db():
    """FastAPI dependency: returns the active database instance."""
    if _db is None:
        raise RuntimeError("MongoDB not connected. Did the app lifespan run?")
    return _db
