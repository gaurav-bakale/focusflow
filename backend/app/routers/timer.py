"""
Timer Router - /api/timer

Handles Pomodoro session logging and retrieval for dashboard analytics.
"""

from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, status
from bson import ObjectId

from app.models import PomodoroSessionCreate, PomodoroSessionResponse
from app.auth import get_current_user
from app.db import get_db

router = APIRouter()


def _doc_to_session(doc: dict) -> PomodoroSessionResponse:
    return PomodoroSessionResponse(
        id=str(doc["_id"]),
        user_id=str(doc["user_id"]),
        task_id=doc.get("task_id"),
        phase=doc.get("phase", "FOCUS"),
        duration_minutes=doc.get("duration_minutes", 25),
        completed_at=doc.get("completed_at", datetime.utcnow()),
    )


@router.post("/sessions", response_model=PomodoroSessionResponse, status_code=status.HTTP_201_CREATED)
async def log_session(data: PomodoroSessionCreate, user=Depends(get_current_user), db=Depends(get_db)):
    """
    Log a completed Pomodoro session.

    Args:
        data: PomodoroSessionCreate with optional task_id, phase, and duration.

    Returns:
        The logged PomodoroSessionResponse with server-assigned id and timestamp.
    """
    doc = {
        "user_id": user["_id"],
        "task_id": data.task_id,
        "phase": data.phase,
        "duration_minutes": data.duration_minutes,
        "completed_at": datetime.utcnow(),
    }
    result = await db["sessions"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _doc_to_session(doc)


@router.get("/sessions", response_model=List[PomodoroSessionResponse])
async def get_sessions(user=Depends(get_current_user), db=Depends(get_db)):
    """
    Retrieve all Pomodoro sessions for the authenticated user.

    Returns:
        List of PomodoroSessionResponse sorted newest first, for dashboard analytics.
    """
    cursor = db["sessions"].find({"user_id": user["_id"]}).sort("completed_at", -1)
    return [_doc_to_session(doc) async for doc in cursor]


@router.get("/stats")
async def get_stats(user=Depends(get_current_user), db=Depends(get_db)):
    """
    Compute daily productivity stats for the dashboard.

    Returns:
        Dict with tasks_done (today), deep_work_minutes (today), and streak (days).
    """
    from datetime import date
    today_start = datetime.combine(date.today(), datetime.min.time())

    # Count tasks completed today
    tasks_done = await db["tasks"].count_documents({
        "user_id": user["_id"],
        "status": "DONE",
        "updated_at": {"$gte": today_start},
    })

    # Sum focus minutes today
    pipeline = [
        {"$match": {"user_id": user["_id"], "phase": "FOCUS", "completed_at": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$duration_minutes"}}}
    ]
    result = await db["sessions"].aggregate(pipeline).to_list(1)
    deep_work_minutes = result[0]["total"] if result else 0

    return {
        "tasks_done": tasks_done,
        "deep_work_minutes": deep_work_minutes,
        "deep_work_hours": round(deep_work_minutes / 60, 1),
    }
