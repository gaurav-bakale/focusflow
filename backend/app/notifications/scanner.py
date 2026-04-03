"""
Deadline Scanner — Background job that checks for upcoming and overdue deadlines.

Runs every 15 minutes via APScheduler. For each user's tasks, it checks:
  • 24 hours before deadline → DEADLINE_24H notification
  • 1 hour before deadline  → DEADLINE_1H notification
  • Past deadline           → OVERDUE notification

Deduplication: each (user_id, task_id, type) combination is only created once.
Completed tasks (status == "DONE") are skipped.

Design Patterns:
  Observer  — scanner detects deadline events and pushes notifications to
              connected WebSocket clients via the ConnectionManager.
  Singleton — the APScheduler instance is created once at app startup.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from app.notifications.models import (
    NotificationCreate,
    NotificationType,
    NOTIFICATION_MESSAGES,
)
from app.notifications.service import NotificationService
from app.ws import manager as ws_manager

logger = logging.getLogger("focusflow.scanner")


async def scan_deadlines(db):
    """
    Scan all tasks with deadlines and create notifications as needed.

    This function is called by the APScheduler job. It:
    1. Queries all incomplete tasks with a deadline
    2. Computes the time remaining for each
    3. Creates notifications for 24h, 1h, and overdue thresholds
    4. Pushes real-time WebSocket alerts for newly created notifications
    """
    svc = NotificationService(db)
    tasks_col = db["tasks"]
    now = datetime.utcnow()

    cursor = tasks_col.find({
        "status": {"$ne": "DONE"},
        "deadline": {"$ne": None, "$exists": True},
    })

    created_count = 0

    async for task in cursor:
        user_id = str(task.get("user_id", ""))
        task_id = str(task["_id"])
        task_title = task.get("title", "Untitled")
        deadline_str = task.get("deadline", "")
        due_time = task.get("due_time", "")

        if not user_id or not deadline_str:
            continue

        # Parse deadline into a datetime
        try:
            if due_time:
                deadline_dt = datetime.strptime(
                    f"{deadline_str} {due_time}", "%Y-%m-%d %H:%M"
                )
            else:
                # If no specific time, assume end of day (23:59)
                deadline_dt = datetime.strptime(deadline_str, "%Y-%m-%d")
                deadline_dt = deadline_dt.replace(hour=23, minute=59)
        except ValueError:
            continue

        time_remaining = deadline_dt - now

        # Determine which notification types to fire
        triggers = []
        if time_remaining < timedelta(0):
            triggers.append(NotificationType.OVERDUE)
        if timedelta(0) <= time_remaining <= timedelta(hours=1):
            triggers.append(NotificationType.DEADLINE_1H)
        if timedelta(0) <= time_remaining <= timedelta(hours=24):
            triggers.append(NotificationType.DEADLINE_24H)

        for ntype in triggers:
            # Dedup: skip if already notified
            if await svc.exists(user_id, task_id, ntype):
                continue

            message = f'"{task_title}" — {NOTIFICATION_MESSAGES[ntype]}'
            notification = await svc.create(NotificationCreate(
                user_id=user_id,
                task_id=task_id,
                task_title=task_title,
                type=ntype,
                message=message,
            ))
            created_count += 1

            # Push real-time WebSocket notification
            await ws_manager.send_to_user(user_id, {
                "type": "deadline_notification",
                "notification": {
                    "id": notification.id,
                    "task_id": task_id,
                    "task_title": task_title,
                    "notification_type": ntype.value,
                    "message": message,
                },
            })

    if created_count > 0:
        logger.info(f"[Scanner] Created {created_count} deadline notification(s)")


def _run_scan(db):
    """Wrapper that runs the async scan in the current event loop."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(scan_deadlines(db))
        else:
            loop.run_until_complete(scan_deadlines(db))
    except RuntimeError:
        # No event loop — create one (shouldn't happen in normal operation)
        asyncio.run(scan_deadlines(db))


def start_deadline_scanner(db):
    """
    Start the APScheduler background job that scans for deadlines.

    Called once during app startup (lifespan). The scheduler runs
    scan_deadlines every 15 minutes.
    """
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        scan_deadlines,
        "interval",
        minutes=15,
        args=[db],
        id="deadline_scanner",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("[Scanner] Deadline scanner started (every 15 min)")
    return scheduler
