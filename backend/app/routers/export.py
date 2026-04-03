"""
Export Router — /api/export

Allows authenticated users to download their data as CSV or JSON.

Endpoints:
  GET /api/export/tasks          — all tasks (CSV or JSON)
  GET /api/export/sessions       — all Pomodoro sessions (CSV or JSON)
  GET /api/export/blocks         — all calendar time blocks (CSV or JSON)
  GET /api/export/all            — complete data dump (JSON only)

Query parameters:
  format   : "csv" | "json"  (default: "json")
  from_date: ISO date string  (optional, e.g. "2026-01-01")
  to_date  : ISO date string  (optional, e.g. "2026-12-31")
  category : filter tasks by category tag (optional, tasks only)

Design Patterns:
  Strategy  — _CsvStrategy and _JsonStrategy share the same interface.
  Facade    — Each endpoint is a thin facade: fetch data -> serialise -> respond.
  Factory   — _get_strategy() returns the right serialiser for the format.
"""

import csv
import io
import json
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.auth import get_current_user
from app.db import get_db

router = APIRouter()


class _SerialiseStrategy:
    """Abstract base for export serialisation strategies."""

    media_type: str = ""
    extension: str = ""

    def serialise(self, data: list, filename_base: str) -> StreamingResponse:
        raise NotImplementedError


class _JsonStrategy(_SerialiseStrategy):
    media_type = "application/json"
    extension = "json"

    def serialise(self, data: list, filename_base: str) -> StreamingResponse:
        content = json.dumps(data, indent=2, default=str)
        filename = f"{filename_base}.json"
        return StreamingResponse(
            iter([content]),
            media_type=self.media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


class _CsvStrategy(_SerialiseStrategy):
    media_type = "text/csv"
    extension = "csv"

    def serialise(self, data: list, filename_base: str) -> StreamingResponse:
        if not data:
            content = ""
        else:
            buf = io.StringIO()
            all_keys: list = []
            seen: set = set()
            for row in data:
                for k in row.keys():
                    if k not in seen:
                        all_keys.append(k)
                        seen.add(k)

            writer = csv.DictWriter(
                buf,
                fieldnames=all_keys,
                extrasaction="ignore",
                lineterminator="\n",
            )
            writer.writeheader()
            for row in data:
                flat = {}
                for k, v in row.items():
                    flat[k] = json.dumps(v, default=str) if isinstance(v, (list, dict)) else v
                writer.writerow(flat)
            content = buf.getvalue()

        filename = f"{filename_base}.csv"
        return StreamingResponse(
            iter([content]),
            media_type=self.media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


def _get_strategy(fmt: str) -> _SerialiseStrategy:
    """Factory — returns the appropriate serialisation strategy."""
    strategies = {
        "json": _JsonStrategy(),
        "csv": _CsvStrategy(),
    }
    strategy = strategies.get(fmt.lower())
    if strategy is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{fmt}'. Use 'json' or 'csv'.",
        )
    return strategy


def _build_date_filter(
    from_date: Optional[str],
    to_date: Optional[str],
    field: str,
) -> dict:
    """Build a MongoDB date-range filter for the given field."""
    filt: dict = {}
    try:
        if from_date:
            filt["$gte"] = datetime.combine(
                date.fromisoformat(from_date), datetime.min.time()
            )
        if to_date:
            filt["$lte"] = datetime.combine(
                date.fromisoformat(to_date), datetime.max.time()
            )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format: {exc}. Use YYYY-MM-DD.",
        ) from exc

    return {field: filt} if filt else {}


def _serialise_task(doc: dict) -> dict:
    """Convert a raw task MongoDB document to an export-friendly dict."""
    subtasks = [
        {"title": s.get("title", ""), "status": s.get("status", "TODO")}
        for s in doc.get("subtasks", [])
    ]
    created = doc.get("created_at", "")
    updated = doc.get("updated_at", "")
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "description": doc.get("description") or "",
        "priority": doc.get("priority", "MEDIUM"),
        "status": doc.get("status", "TODO"),
        "deadline": doc.get("deadline") or "",
        "due_time": doc.get("due_time") or "",
        "recurrence": doc.get("recurrence", "NONE"),
        "estimated_minutes": doc.get("estimated_minutes") or "",
        "categories": doc.get("categories", []),
        "subtasks": subtasks,
        "is_complete": doc.get("status") == "DONE",
        "created_at": created.isoformat() if isinstance(created, datetime) else str(created),
        "updated_at": updated.isoformat() if isinstance(updated, datetime) else str(updated),
    }


def _serialise_session(doc: dict) -> dict:
    """Convert a raw session MongoDB document to an export-friendly dict."""
    completed_at = doc.get("completed_at")
    return {
        "id": str(doc["_id"]),
        "task_id": str(doc["task_id"]) if doc.get("task_id") else "",
        "phase": doc.get("phase", "FOCUS"),
        "duration_minutes": doc.get("duration_minutes", 25),
        "completed_at": (
            completed_at.isoformat()
            if isinstance(completed_at, datetime)
            else str(completed_at or "")
        ),
    }


def _serialise_block(doc: dict) -> dict:
    """Convert a raw time_block MongoDB document to an export-friendly dict."""
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "start_time": doc.get("start_time", ""),
        "end_time": doc.get("end_time", ""),
        "task_id": str(doc["task_id"]) if doc.get("task_id") else "",
        "color": doc.get("color") or "",
        "recurrence": doc.get("recurrence", "NONE"),
        "recurrence_group_id": doc.get("recurrence_group_id") or "",
    }


@router.get("/tasks", summary="Export tasks")
async def export_tasks(
    format: str = Query("json", description="'csv' or 'json'"),
    from_date: Optional[str] = Query(None, description="Start date filter YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="End date filter YYYY-MM-DD"),
    category: Optional[str] = Query(None, description="Filter by category tag"),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Export all tasks for the authenticated user as CSV or JSON."""
    query: dict = {"user_id": user["_id"]}
    query.update(_build_date_filter(from_date, to_date, "created_at"))
    if category:
        query["categories"] = {"$in": [category]}

    cursor = db["tasks"].find(query).sort("created_at", -1)
    tasks = [_serialise_task(doc) async for doc in cursor]
    return _get_strategy(format).serialise(tasks, "focusflow_tasks")


@router.get("/sessions", summary="Export Pomodoro sessions")
async def export_sessions(
    format: str = Query("json", description="'csv' or 'json'"),
    from_date: Optional[str] = Query(None, description="Start date filter YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="End date filter YYYY-MM-DD"),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Export all Pomodoro sessions for the authenticated user as CSV or JSON."""
    query: dict = {"user_id": user["_id"]}
    query.update(_build_date_filter(from_date, to_date, "completed_at"))

    cursor = db["sessions"].find(query).sort("completed_at", -1)
    sessions = [_serialise_session(doc) async for doc in cursor]
    return _get_strategy(format).serialise(sessions, "focusflow_sessions")


@router.get("/blocks", summary="Export calendar time blocks")
async def export_blocks(
    format: str = Query("json", description="'csv' or 'json'"),
    from_date: Optional[str] = Query(None, description="Start date filter YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="End date filter YYYY-MM-DD"),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Export all calendar time blocks for the authenticated user as CSV or JSON."""
    query: dict = {"user_id": user["_id"]}
    if from_date or to_date:
        time_filter: dict = {}
        if from_date:
            time_filter["$gte"] = from_date
        if to_date:
            time_filter["$lte"] = f"{to_date}T23:59"
        query["start_time"] = time_filter

    cursor = db["time_blocks"].find(query).sort("start_time", 1)
    blocks = [_serialise_block(doc) async for doc in cursor]
    return _get_strategy(format).serialise(blocks, "focusflow_blocks")


@router.get("/all", summary="Export complete data dump")
async def export_all(
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Export a complete JSON dump of all the user's tasks, sessions, and blocks."""
    tasks_cursor = db["tasks"].find({"user_id": user["_id"]}).sort("created_at", -1)
    sessions_cursor = db["sessions"].find({"user_id": user["_id"]}).sort("completed_at", -1)
    blocks_cursor = db["time_blocks"].find({"user_id": user["_id"]}).sort("start_time", 1)

    tasks = [_serialise_task(doc) async for doc in tasks_cursor]
    sessions = [_serialise_session(doc) async for doc in sessions_cursor]
    blocks = [_serialise_block(doc) async for doc in blocks_cursor]

    dump = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "user": {
            "id": str(user["_id"]),
            "name": user.get("name", ""),
            "email": user.get("email", ""),
        },
        "tasks": tasks,
        "sessions": sessions,
        "blocks": blocks,
    }

    content = json.dumps(dump, indent=2, default=str)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="focusflow_export_all.json"'
        },
    )
