from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

_client: AsyncIOMotorClient = None


def get_client() -> AsyncIOMotorClient:
    return _client


def get_database():
    return _client[settings.DATABASE_NAME]


async def connect_db():
    global _client
    _client = AsyncIOMotorClient(settings.MONGO_URI)


async def close_db():
    global _client
    if _client:
        _client.close()
