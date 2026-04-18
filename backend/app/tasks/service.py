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
import logging
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

logger = logging.getLogger("focusflow.tasks")


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

    def _doc_to_task(
        self, doc: dict, workspace_name: Optional[str] = None
    ) -> TaskResponse:
        """
        Convert a raw MongoDB document to a TaskResponse model.

        Repository pattern helper: translates the storage representation
        (MongoDB BSON dict with ObjectId keys) into the domain/API model so
        callers are fully decoupled from the persistence format.

        ``workspace_name`` is optionally denormalised onto the response so the
        frontend can render a badge without a second round-trip.
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
            workspace_id=doc.get("workspace_id"),
            workspace_name=workspace_name,
        )

    # ── Workspace helpers ─────────────────────────────────────────────────────

    async def _user_workspace_ids(self, user: dict) -> List[str]:
        """Return the list of workspace_ids the user is a member of."""
        cursor = self.db["workspace_members"].find(
            {"user_id": str(user["_id"])}
        )
        # Use .get() defensively — some legacy member documents from earlier
        # schemas may not carry the workspace_id field; we filter those out
        # rather than crashing.
        return [m.get("workspace_id") async for m in cursor if m.get("workspace_id")]

    async def _is_workspace_member(self, user: dict, workspace_id: str) -> bool:
        """True if user is a member (including owner) of the given workspace."""
        if not workspace_id:
            return False
        member = await self.db["workspace_members"].find_one({
            "workspace_id": workspace_id,
            "user_id": str(user["_id"]),
        })
        return member is not None

    # ── Notifications helper ──────────────────────────────────────────────

    def _notif_svc(self):
        """Lazily build a NotificationService — import inline to prevent
        a cyclic import (notifications service does not import tasks, but
        keeping the import local future-proofs the circular dependency
        risk and makes TaskService importable in isolation for tests)."""
        from app.notifications.service import NotificationService
        return NotificationService(self.db)

    async def _workspace_name(self, workspace_id: str) -> str:
        """Return the workspace name for a given id, or '' if missing."""
        if not workspace_id:
            return ""
        try:
            ws = await self.db["workspaces"].find_one({"_id": self._object_id(workspace_id)})
        except Exception:
            return ""
        return ws.get("name", "") if ws else ""

    async def _workspace_name_map(
        self, workspace_ids: List[str]
    ) -> dict:
        """Map workspace_id → workspace.name for a list of ids."""
        if not workspace_ids:
            return {}
        unique_ids = list({wid for wid in workspace_ids if wid})
        if not unique_ids:
            return {}
        object_ids = []
        for wid in unique_ids:
            try:
                object_ids.append(ObjectId(wid))
            except Exception:
                continue
        if not object_ids:
            return {}
        out = {}
        async for ws in self.db["workspaces"].find(
            {"_id": {"$in": object_ids}}
        ):
            out[str(ws["_id"])] = ws.get("name", "")
        return out

    def _object_id(self, task_id: str) -> ObjectId:
        """Parse task_id string to ObjectId, raising 404 on invalid format."""
        try:
            return ObjectId(task_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

    async def _can_access(
        self, user: dict, task_id: str, *, require_edit: bool = False
    ) -> dict:
        """
        Check if the user can access a task — via ownership, workspace
        membership, or an accepted share.

        Returns the task document if access is granted.
        Raises 404 if the task does not exist or the user has no access.
        Raises 403 if the user lacks the required permission level.

        Access rules (checked in order):
            1. Task owner             → full access (view + edit).
            2. Workspace member       → full access (view + edit) to any task
                                        assigned to a workspace the user belongs to.
            3. Accepted task share    → VIEW or EDIT per the share.permission field.

        Args:
            user:         The authenticated user dict.
            task_id:      The task id string.
            require_edit: If True, VIEW-only shares are rejected with 403.
        """
        doc = await self.db["tasks"].find_one(
            {"_id": self._object_id(task_id)}
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        # (1) Owner always has full access.
        if str(doc["user_id"]) == str(user["_id"]):
            return doc

        # (2) Workspace member — full view + edit on any task scoped to a
        #     workspace the user belongs to.
        ws_id = doc.get("workspace_id")
        if ws_id and await self._is_workspace_member(user, ws_id):
            return doc

        # (3) Check for an accepted task share.
        user_id_str = str(user["_id"])
        share = await self.db["task_shares"].find_one({
            "task_id": task_id,
            "shared_with_id": user_id_str,
            "status": "ACCEPTED",
        })

        if not share:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        if require_edit and share.get("permission") != "EDIT":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You have view-only access to this task",
            )

        return doc

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

    async def list_tasks(
        self,
        user: dict,
        *,
        workspace_id: Optional[str] = None,
    ) -> List[TaskResponse]:
        """
        Return tasks accessible to the user, newest first.

        Scoping rules:
          * ``workspace_id`` unset (None) → return personal tasks owned by the
            user plus tasks in any workspace the user belongs to. This is the
            default "all I can see" list.
          * ``workspace_id == "personal"`` → personal tasks only
            (workspace_id is null/missing).
          * ``workspace_id == "<id>"``   → tasks scoped to that workspace only.
            Caller must be a member of the workspace.
        """
        # Build the MongoDB query based on the scoping argument.
        if workspace_id == "personal":
            query = {
                "user_id": user["_id"],
                "$or": [
                    {"workspace_id": {"$exists": False}},
                    {"workspace_id": None},
                    {"workspace_id": ""},
                ],
            }
        elif workspace_id:
            # Specific workspace — gate on membership.
            if not await self._is_workspace_member(user, workspace_id):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Workspace not found",
                )
            query = {"workspace_id": workspace_id}
        else:
            # All accessible: owned + any workspace I belong to.
            ws_ids = await self._user_workspace_ids(user)
            if ws_ids:
                query = {
                    "$or": [
                        {"user_id": user["_id"]},
                        {"workspace_id": {"$in": ws_ids}},
                    ]
                }
            else:
                query = {"user_id": user["_id"]}

        cursor = self.db["tasks"].find(query).sort("created_at", -1)
        docs = [doc async for doc in cursor]

        # Resolve workspace names in one batch query.
        name_map = await self._workspace_name_map(
            [d.get("workspace_id") for d in docs if d.get("workspace_id")]
        )
        return [
            self._doc_to_task(d, workspace_name=name_map.get(d.get("workspace_id")))
            for d in docs
        ]

    async def create_task(self, user: dict, data: TaskCreate) -> TaskResponse:
        """
        Insert a new task and return the created document.

        If ``workspace_id`` is provided, verifies the user is a member of that
        workspace before assigning the task to it. Pass ``None`` or an empty
        string for a personal task.
        """
        now = datetime.utcnow()

        # Validate workspace assignment if provided.
        ws_id: Optional[str] = None
        if data.workspace_id:
            if not await self._is_workspace_member(user, data.workspace_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not a member of that workspace",
                )
            ws_id = data.workspace_id

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
            "workspace_id": ws_id,
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db["tasks"].insert_one(doc)
        doc["_id"] = result.inserted_id

        ws_name = None
        if ws_id:
            ws_doc = await self.db["workspaces"].find_one(
                {"_id": self._object_id(ws_id)}
            )
            ws_name = ws_doc.get("name") if ws_doc else None

        # Notify every other workspace member that a new task landed in the
        # shared pool. Failure must not roll back the task insert — logged
        # and swallowed.
        if ws_id and ws_name:
            try:
                from app.notifications.models import NotificationType
                actor_name = user.get("name") or user.get("email") or "A teammate"
                await self._notif_svc().emit_to_workspace_peers(
                    workspace_id=ws_id,
                    actor_user_id=str(user["_id"]),
                    ntype=NotificationType.WORKSPACE_TASK_ADDED,
                    message=f"{actor_name} added \"{data.title}\" to {ws_name}",
                    task_id=str(doc["_id"]),
                    task_title=data.title,
                )
            except Exception as exc:
                logger.debug("create_task: peer notification failed: %s", exc)

        return self._doc_to_task(doc, workspace_name=ws_name)

    async def get_task(self, user: dict, task_id: str) -> TaskResponse:
        """
        Fetch a single task by id.

        Access is granted if the user owns the task OR has been shared the
        task (VIEW or EDIT permission). Returns 404 if not found or no access.
        """
        doc = await self._can_access(user, task_id)
        return self._doc_to_task(doc)

    async def update_task(
        self, user: dict, task_id: str, data: TaskUpdate
    ) -> TaskResponse:
        """
        Partial update — only provided (non-None) fields are written.

        Access is granted if the user owns the task, belongs to the task's
        workspace, or has EDIT permission via a share. VIEW-only shared users
        receive 403.

        Special handling for ``workspace_id``:
          * Passing an empty string moves the task to Personal (sets to None).
          * Passing a valid id requires the caller to be a member of the
            target workspace; a 403 is returned otherwise.

        Raises 400 if no fields are supplied.
        Raises 404 if the task does not exist or no access.
        Raises 403 if the user has view-only access or is not a member of the
        target workspace.
        """
        # Verify access (owner, workspace member, or EDIT share).
        await self._can_access(user, task_id, require_edit=True)

        # Only touch fields the client actually sent — use exclude_unset so an
        # omitted `workspace_id` does NOT accidentally wipe the task's current
        # workspace. ``workspace_id`` still needs special handling because
        # explicit ``None`` or ``""`` means "move to Personal".
        raw = data.model_dump(exclude_unset=True)
        update_fields = {}
        for k, v in raw.items():
            if k == "workspace_id":
                continue  # handled separately below
            if v is None or v == "":
                continue
            update_fields[k] = v

        # Handle workspace_id explicitly — only when the client supplied it.
        if "workspace_id" in raw:
            ws_val = raw["workspace_id"]
            if ws_val in (None, ""):
                # Move to Personal.
                update_fields["workspace_id"] = None
            else:
                # Move to a specific workspace — must be a member.
                if not await self._is_workspace_member(user, ws_val):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You are not a member of that workspace",
                    )
                update_fields["workspace_id"] = ws_val

        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided to update",
            )
        update_fields["updated_at"] = datetime.utcnow()

        result = await self.db["tasks"].find_one_and_update(
            {"_id": self._object_id(task_id)},
            {"$set": update_fields},
            return_document=True,
        )
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        ws_name = None
        new_ws_id = result.get("workspace_id")
        if new_ws_id:
            ws_doc = await self.db["workspaces"].find_one(
                {"_id": self._object_id(new_ws_id)}
            )
            ws_name = ws_doc.get("name") if ws_doc else None

        # ── All-subtasks-done nudge ──────────────────────────────────────
        # When a subtask check turns the last incomplete box into DONE,
        # nudge the task owner that the parent is ready to be finished.
        try:
            from app.notifications.models import NotificationType
            subtasks = result.get("subtasks") or []
            if (
                "subtasks" in update_fields
                and result.get("status") != TaskStatus.DONE
                and len(subtasks) > 0
                and all(s.get("status") == "DONE" for s in subtasks)
            ):
                owner_id = str(result.get("user_id", user["_id"]))
                title = result.get("title", "Untitled")
                await self._notif_svc().emit(
                    user_id=owner_id,
                    ntype=NotificationType.ALL_SUBTASKS_DONE,
                    message=f"🎯 All subtasks done on \"{title}\" — ready to mark it complete?",
                    task_id=str(result["_id"]),
                    task_title=title,
                )
        except Exception as exc:
            logger.debug("update_task: subtasks notification failed: %s", exc)

        return self._doc_to_task(result, workspace_name=ws_name)

    async def complete_task(self, user: dict, task_id: str) -> dict:
        """
        Set status to DONE and return the completed task plus the next
        occurrence task (if any) so the frontend can auto-schedule a calendar
        block for it.

        Any user with edit access (owner, workspace member, or EDIT share)
        may mark a task complete. The next occurrence inherits the original
        task's ``workspace_id`` and is created under the completer's user_id.

        Returns:
            {
                "completed": TaskResponse  — the task just marked DONE
                "next_task": TaskResponse | None  — newly created next occurrence
            }
        """
        # Gate on access (owner / workspace / EDIT share).
        await self._can_access(user, task_id, require_edit=True)

        result = await self.db["tasks"].find_one_and_update(
            {"_id": self._object_id(task_id)},
            {"$set": {"status": TaskStatus.DONE, "updated_at": datetime.utcnow()}},
            return_document=True,
        )
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        # Auto-create next occurrence for recurring tasks — keep the same
        # workspace binding so recurring team tasks stay team tasks.
        next_task_response = None
        recurrence = result.get("recurrence", Recurrence.NONE)
        deadline = result.get("deadline")
        if recurrence and recurrence != Recurrence.NONE and deadline:
            next_deadline = self._next_occurrence(deadline, recurrence)
            if next_deadline:
                now = datetime.utcnow()
                new_doc = {
                    "user_id": result.get("user_id", user["_id"]),
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
                    "workspace_id": result.get("workspace_id"),
                    "created_at": now,
                    "updated_at": now,
                }
                insert_result = await self.db["tasks"].insert_one(new_doc)
                new_doc["_id"] = insert_result.inserted_id
                next_task_response = self._doc_to_task(new_doc)

        # ── Notifications ────────────────────────────────────────────────
        # 1. Celebrate the completion for the user.
        # 2. If the task belongs to a workspace, notify every peer.
        # Both emits are non-critical; failures are logged, not raised.
        try:
            from app.notifications.models import NotificationType
            ws_id = result.get("workspace_id")
            task_title = result.get("title", "Untitled")
            task_id_str = str(result["_id"])

            await self._notif_svc().emit(
                user_id=str(user["_id"]),
                ntype=NotificationType.TASK_COMPLETED,
                message=f"🎉 Nice work on \"{task_title}\"!",
                task_id=task_id_str,
                task_title=task_title,
            )

            if ws_id:
                ws_name = await self._workspace_name(ws_id)
                actor_name = user.get("name") or user.get("email") or "A teammate"
                await self._notif_svc().emit_to_workspace_peers(
                    workspace_id=ws_id,
                    actor_user_id=str(user["_id"]),
                    ntype=NotificationType.WORKSPACE_TASK_COMPLETED,
                    message=f"✅ {actor_name} completed \"{task_title}\""
                            f"{f' in {ws_name}' if ws_name else ''}",
                    task_id=task_id_str,
                    task_title=task_title,
                )
        except Exception as exc:
            logger.debug("complete_task: notification emit failed: %s", exc)

        return {
            "completed": self._doc_to_task(result),
            "next_task": next_task_response,
        }

    async def delete_task(self, user: dict, task_id: str) -> None:
        """
        Permanently delete a task.

        A task may be deleted by:
          * The task's owner (creator), OR
          * The owner of the workspace the task belongs to.

        Regular workspace members cannot delete tasks they did not create —
        this prevents accidental destruction in shared spaces.

        Raises 404 if the task doesn't exist or caller lacks delete rights.
        """
        doc = await self.db["tasks"].find_one(
            {"_id": self._object_id(task_id)}
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        is_owner = str(doc.get("user_id")) == str(user["_id"])
        ws_id = doc.get("workspace_id")
        is_ws_owner = False
        if ws_id and not is_owner:
            ws_doc = await self.db["workspaces"].find_one(
                {"_id": self._object_id(ws_id)}
            )
            if ws_doc and str(ws_doc.get("owner_id")) == str(user["_id"]):
                is_ws_owner = True

        if not (is_owner or is_ws_owner):
            # Mask permission failures as 404 — same as access check.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        await self.db["tasks"].delete_one(
            {"_id": self._object_id(task_id)}
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
