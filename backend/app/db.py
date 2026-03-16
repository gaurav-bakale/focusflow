"""
Database Connection Module - Singleton Pattern

Manages a single Motor async MongoDB client instance,
shared across all repositories via FastAPI dependency injection.
"""

import os
from motor.motor_asyncio import AsyncIOMotorClient

_client: AsyncIOMotorClient = None
_db = None


async def connect_db():
    """Open the MongoDB connection pool at application startup."""
    global _client, _db
    url = os.getenv("MONGODB_URL", "mongodb://localhost:27017/focusflow")
    _client = AsyncIOMotorClient(url)
    _db = _client["focusflow"]
    print("[DB] Connected to MongoDB")


async def close_db():
    """Close the MongoDB connection pool at application shutdown."""
    global _client
    if _client:
        _client.close()
        print("[DB] MongoDB connection closed")


def get_db():
    """FastAPI dependency: returns the active database instance."""
    return _db
