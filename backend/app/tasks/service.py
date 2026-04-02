"""
Tasks — Service layer.

TaskService encapsulates all database interactions for tasks.
The router stays thin: it validates HTTP inputs, calls the service,
and returns the result — no DB logic leaks into the router.

This mirrors the pattern established by app.authentication.service.AuthService.
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Service Layer   — all DB/business logic lives here; the router stays thin.
#                   No database code leaks into router.py; it merely calls
#                   TaskService methods and returns their results.
#
# Repository      — TaskService wraps the MongoDB 'tasks' collection, providing
#                   a clean, collection-agnostic API (list/create/get/update/
#                   complete/delete/analytics) to callers.  The underlying
#                   storage engine (Motor/MongoDB) can be swapped or mocked
#                   without touching any other layer.
#
# Dependency Inj. — The `db` handle is passed into __init__ by the FastAPI
#                   Depends() factory (_svc) in the router, so tests can inject
#                   a fake DB with no monkey-patching of globals.
# ─────────────────────────────────────────────────────────────────────────────

import calendar as cal_module
from datetime import datetime, timedelta, date as date_type
from typing import List, Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.tasks.models import (
    Priority,
    Recurrence,
    SubtaskResponse,
    TaskCreate,
    TaskResponse,
    TaskStatus,
    TaskUpdate,
)


class TaskService:
    """
    All task-related business logic and database operations.

    Design patterns applied
    -----------------------
    Service Layer  : This class is the single authoritative source of task
                     business logic.  Routers call its public methods; no SQL
                     or Motor queries are written outside this class.

    Repository     : Acts as a repository for the 'tasks' collection — callers
                     never reference `db["tasks"]` directly.  The collection is
                     hidden behind a clean, intent-revealing API.
    """

    def __init__(self, db):
        # Dependency Injection: `db` is supplied by the FastAPI Depends()
        # factory in router.py, making it trivial to substitute a mock in tests.
        self.db = db

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _doc_to_task(self, doc: dict) -> TaskResponse:
        """
        Convert a raw MongoDB document to a TaskResponse model.

        Repository pattern helper: translates the storage representation
        (MongoDB BSON dict with ObjectId keys) into the domain/API model so
        callers are fully decoupled from the persistence format.
        """
        subtasks = [
            SubtaskResponse(id=str(i), title=s["title"], status=s.get("status", "TODO"))
            for i, s in enumerate(doc.get("subtasks", []))
        ]
        return TaskResponse(
            id=str(doc["_id"]),
            user_id=str(doc["user_id"]),
            title=doc["title"],
            description=doc.get("description"),
            priority=doc.get("priority", Priority.MEDIUM),
            deadline=doc.get("deadline"),
            due_time=doc.get("due_time"),
            recurrence=doc.get("recurrence", Recurrence.NONE),
            estimated_minutes=doc.get("estimated_minutes"),
            status=doc.get("status", TaskStatus.TODO),
            subtasks=subtasks,
            is_complete=doc.get("status") == TaskStatus.DONE,
            created_at=doc.get("created_at", datetime.utcnow()),
            updated_at=doc.get("updated_at", datetime.utcnow()),
            categories=doc.get("categories", []),
        )

    def _object_id(self, task_id: str) -> ObjectId:
        """Parse task_id string to ObjectId, raising 404 on invalid format."""
        try:
            return ObjectId(task_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

    def _next_occurrence(self, deadline: str, recurrence: str) -> Optional[str]:
        """Compute the next deadline date for a recurring task."""
        try:
            d = date_type.fromisoformat(deadline)
        except (ValueError, TypeError):
            return None

        if recurrence == Recurrence.DAILY:
            d += timedelta(days=1)
        elif recurrence == Recurrence.WEEKDAYS:
            d += timedelta(days=1)
            while d.weekday() >= 5:  # skip Saturday (5) and Sunday (6)
                d += timedelta(days=1)
        elif recurrence == Recurrence.WEEKLY:
            d += timedelta(weeks=1)
        elif recurrence == Recurrence.MONTHLY:
            month = d.month + 1
            year = d.year + (month - 1) // 12
            month = ((month - 1) % 12) + 1
            day = min(d.day, cal_module.monthrange(year, month)[1])
            d = date_type(year, month, day)
        else:
            return None

        return d.isoformat()

    # ── CRUD ──────────────────────────────────────────────────────────────────

    async def list_tasks(self, user: dict) -> List[TaskResponse]:
        """Return all tasks for the user, newest first."""
        cursor = self.db["tasks"].find({"user_id": user["_id"]}).sort("created_at", -1)
        return [self._doc_to_task(doc) async for doc in cursor]

    async def create_task(self, user: dict, data: TaskCreate) -> TaskResponse:
        """Insert a new task and return the created document."""
        now = datetime.utcnow()
        doc = {
            "user_id": user["_id"],
            "title": data.title,
            "description": data.description,
            "priority": data.priority,
            "deadline": data.deadline,
            "due_time": data.due_time or None,
            "recurrence": data.recurrence or Recurrence.NONE,
            "estimated_minutes": data.estimated_minutes,
            "status": data.status,
            "subtasks": [],
            "categories": data.categories or [],
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db["tasks"].insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._doc_to_task(doc)

    async def get_task(self, user: dict, task_id: str) -> TaskResponse:
        """Fetch a single task by id — 404 if not found or not owned by user."""
        doc = await self.db["tasks"].find_one(
            {"_id": self._object_id(task_id), "user_id": user["_id"]}
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        return self._doc_to_task(doc)

    async def update_task(
        self, user: dict, task_id: str, data: TaskUpdate
    ) -> TaskResponse:
        """
        Partial update — only provided (non-None) fields are written.

        Raises 400 if no fields are supplied.
        Raises 404 if the task does not exist or is not owned by the user.
        """
        update_fields = {
            k: v for k, v in data.model_dump().items()
            if v is not None and v != ""
        }
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided to update",
            )
        update_fields["updated_at"] = datetime.utcnow()

        result = await self.db["tasks"].find_one_and_update(
            {"_id": self._object_id(task_id), "user_id": user["_id"]},
            {"$set": update_fields},
            return_document=True,
        )
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        return self._doc_to_task(result)

    async def complete_task(self, user: dict, task_id: str) -> dict:
        """
        Set status to DONE and return the completed task plus the next occurrence
        task (if any) so the frontend can auto-schedule a calendar block for it.

        Returns:
            {
                "completed": TaskResponse  — the task just marked DONE
                "next_task": TaskResponse | None  — newly created next occurrence
            }
        """
        result = await self.db["tasks"].find_one_and_update(
            {"_id": self._object_id(task_id), "user_id": user["_id"]},
            {"$set": {"status": TaskStatus.DONE, "updated_at": datetime.utcnow()}},
            return_document=True,
        )
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        # Auto-create next occurrence for recurring tasks
        next_task_response = None
        recurrence = result.get("recurrence", Recurrence.NONE)
        deadline = result.get("deadline")
        if recurrence and recurrence != Recurrence.NONE and deadline:
            next_deadline = self._next_occurrence(deadline, recurrence)
            if next_deadline:
                now = datetime.utcnow()
                new_doc = {
                    "user_id": user["_id"],
                    "title": result["title"],
                    "description": result.get("description"),
                    "priority": result.get("priority", Priority.MEDIUM),
                    "deadline": next_deadline,
                    "due_time": result.get("due_time"),
                    "recurrence": recurrence,
                    "estimated_minutes": result.get("estimated_minutes"),
                    "status": TaskStatus.TODO,
                    "subtasks": [],
                    "categories": result.get("categories", []),
                    "created_at": now,
                    "updated_at": now,
                }
                insert_result = await self.db["tasks"].insert_one(new_doc)
                new_doc["_id"] = insert_result.inserted_id
                next_task_response = self._doc_to_task(new_doc)

        return {
            "completed": self._doc_to_task(result),
            "next_task": next_task_response,
        }

    async def delete_task(self, user: dict, task_id: str) -> None:
        """Permanently delete a task — 404 if not found."""
        result = await self.db["tasks"].delete_one(
            {"_id": self._object_id(task_id), "user_id": user["_id"]}
        )
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

    # ── Analytics ─────────────────────────────────────────────────────────────

    async def get_analytics(self, user: dict) -> dict:
        """
        Compute aggregate task statistics for the current user.

        Returns:
            total:               Total task count.
            by_status:           Counts per status {TODO, IN_PROGRESS, DONE}.
            by_priority:         Counts per priority {LOW, MEDIUM, HIGH}.
            overdue:             Non-DONE tasks whose deadline+due_time is in the past.
            completion_rate:     Percentage of tasks that are DONE.
            completed_today:     DONE tasks with updated_at >= today midnight UTC.
            completed_this_week: DONE tasks with updated_at >= this Monday UTC.
        """
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=today_start.weekday())

        tasks = await self.db["tasks"].find({"user_id": user["_id"]}).to_list(None)

        by_status = {s.value: 0 for s in TaskStatus}
        by_priority = {p.value: 0 for p in Priority}
        overdue = 0
        completed_today = 0
        completed_this_week = 0

        for t in tasks:
            s = t.get("status", TaskStatus.TODO)
            p = t.get("priority", Priority.MEDIUM)
            by_status[s] = by_status.get(s, 0) + 1
            by_priority[p] = by_priority.get(p, 0) + 1

            deadline = t.get("deadline")
            due_time = t.get("due_time")
            if deadline and s != TaskStatus.DONE:
                try:
                    # If task has a specific time, check against that datetime
                    if due_time:
                        dt_str = f"{deadline}T{due_time}:00"
                        if datetime.fromisoformat(dt_str) < now:
                            overdue += 1
                    else:
                        if datetime.fromisoformat(deadline) < now:
                            overdue += 1
                except (ValueError, TypeError):
                    pass

            if s == TaskStatus.DONE:
                updated_at = t.get("updated_at")
                if updated_at and updated_at >= today_start:
                    completed_today += 1
                if updated_at and updated_at >= week_start:
                    completed_this_week += 1

        total = len(tasks)
        done_count = by_status.get(TaskStatus.DONE, 0)
        completion_rate = round((done_count / total) * 100, 1) if total > 0 else 0.0

        return {
            "total": total,
            "by_status": by_status,
            "by_priority": by_priority,
            "overdue": overdue,
            "completion_rate": completion_rate,
            "completed_today": completed_today,
            "completed_this_week": completed_this_week,
        }
