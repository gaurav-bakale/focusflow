"""
Database Connection Module - Singleton Pattern

Manages a single Motor async MongoDB client instance,
shared across all repositories via FastAPI dependency injection.
"""

import os
import asyncio
from urllib.parse import quote_plus
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

    url = os.getenv("MONGODB_URL")
    if not url:
        # Support building a URI from separate env vars (password must come from env/CI secrets).
        mongo_host = os.getenv("MONGODB_HOST", "localhost")
        mongo_port = os.getenv("MONGODB_PORT", "27017")
        mongo_db = os.getenv("MONGODB_DB") or os.getenv("MONGODB_DATABASE") or "focusflow"
        auth_source = os.getenv("MONGODB_AUTH_SOURCE", "admin")
        mongo_user = os.getenv("MONGODB_USER")
        mongo_password = os.getenv("MONGODB_PASSWORD")

        if mongo_user and mongo_password:
            url = (
                f"mongodb://{quote_plus(mongo_user)}:{quote_plus(mongo_password)}@"
                f"{mongo_host}:{mongo_port}/{mongo_db}?authSource={quote_plus(auth_source)}"
            )
        else:
            url = f"mongodb://{mongo_host}:{mongo_port}/{mongo_db}"

    server_selection_timeout_ms = int(os.getenv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "5000"))
    connect_timeout_ms = int(os.getenv("MONGODB_CONNECT_TIMEOUT_MS", "5000"))

    _client = AsyncIOMotorClient(
        url,
        serverSelectionTimeoutMS=server_selection_timeout_ms,
        connectTimeoutMS=connect_timeout_ms,
    )

    try:
        # Force a real round-trip to verify the connection is usable.
        # In CI, Mongo may not be ready at the exact moment tests start.
        ping_retries = int(os.getenv("MONGODB_PING_RETRIES", "5"))
        ping_retry_delay_s = float(os.getenv("MONGODB_PING_RETRY_DELAY_S", "0.5"))
        last_error: Exception | None = None

        for attempt in range(ping_retries):
            try:
                await _client.admin.command("ping")
                last_error = None
                break
            except PyMongoError as e:
                last_error = e
                if attempt < ping_retries - 1:
                    await asyncio.sleep(ping_retry_delay_s)

        if last_error is not None:
            raise last_error
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

    _db = default_db if default_db is not None else _client[os.getenv("MONGODB_DB", "focusflow")]
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
