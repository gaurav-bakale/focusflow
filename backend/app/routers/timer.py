"""
Timer Router - /api/timer

Handles Pomodoro session logging and retrieval for dashboard analytics.
"""

from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, status

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


@router.post(
    "/sessions",
    response_model=PomodoroSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def log_session(
    data: PomodoroSessionCreate,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
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


async def _calculate_streak(db, user_id) -> int:
    """
    Calculate the user's current task-completion streak.

    Algorithm:
      1. Query all DONE tasks for the user, sorted by updated_at descending.
      2. Extract unique completion dates (YYYY-MM-DD).
      3. Walk backwards from today: if today has completions, count it;
         then check each preceding day. Stop at the first gap.
      4. If today has no completions yet, start from yesterday (to avoid
         breaking the streak mid-day before the user completes anything).

    Returns:
        Number of consecutive days with at least one completed task.
    """
    from datetime import date, timedelta

    # Get all completion dates for this user's DONE tasks
    pipeline = [
        {"$match": {"user_id": user_id, "status": "DONE"}},
        {
            "$project": {
                "date": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": "$updated_at",
                    }
                }
            }
        },
        {"$group": {"_id": "$date"}},
        {"$sort": {"_id": -1}},
    ]
    results = await db["tasks"].aggregate(pipeline).to_list(None)
    if not results:
        return 0

    completion_dates = {r["_id"] for r in results if r["_id"]}
    today = date.today()
    today_str = today.isoformat()

    # Decide starting point: today if it has completions, else yesterday
    if today_str in completion_dates:
        check_date = today
    else:
        check_date = today - timedelta(days=1)
        if check_date.isoformat() not in completion_dates:
            return 0

    streak = 0
    while check_date.isoformat() in completion_dates:
        streak += 1
        check_date -= timedelta(days=1)

    return streak


@router.get("/stats")
async def get_stats(user=Depends(get_current_user), db=Depends(get_db)):
    """
    Compute daily productivity stats for the dashboard.

    Returns:
        Dict with tasks_done (today), deep_work_minutes (today),
        deep_work_hours, and streak_days.
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
        {
            "$match": {
                "user_id": user["_id"],
                "phase": "FOCUS",
                "completed_at": {"$gte": today_start},
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$duration_minutes"}}}
    ]
    result = await db["sessions"].aggregate(pipeline).to_list(1)
    deep_work_minutes = result[0]["total"] if result else 0

    # Calculate streak
    streak_days = await _calculate_streak(db, user["_id"])

    return {
        "tasks_done": tasks_done,
        "deep_work_minutes": deep_work_minutes,
        "deep_work_hours": round(deep_work_minutes / 60, 1),
        "streak_days": streak_days,
    }
