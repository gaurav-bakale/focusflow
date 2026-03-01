from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_database

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
async def health_check():
    return {"status": "ok", "service": "focusflow-api"}


@router.get("/db")
async def db_health_check(db: AsyncIOMotorDatabase = Depends(get_database)):
    try:
        await db.command("ping")
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": "disconnected", "detail": str(e)}
