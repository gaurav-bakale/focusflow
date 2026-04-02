"""
Calendar Router - /api/calendar

Handles time block CRUD plus:
  • Bulk creation  POST /blocks/bulk   — creates a whole recurring series at once
  • Scoped update  PUT  /blocks/{id}?scope=this_and_future  — shift time on all
    following blocks in the series while keeping each block's individual date
  • Scoped delete  DELETE /blocks/{id}?scope=this_and_future — prune a series
    from this occurrence onwards
"""

from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from bson import ObjectId

from app.models import BulkBlockCreate, TimeBlockCreate, TimeBlockResponse
from app.auth import get_current_user
from app.db import get_db

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _doc_to_block(doc: dict) -> TimeBlockResponse:
    return TimeBlockResponse(
        id=str(doc["_id"]),
        user_id=str(doc["user_id"]),
        title=doc["title"],
        start_time=doc["start_time"],
        end_time=doc["end_time"],
        task_id=doc.get("task_id"),
        color=doc.get("color"),
        recurrence=doc.get("recurrence", "NONE"),
        recurrence_group_id=doc.get("recurrence_group_id"),
    )


def _parse_hm(dt_str: str):
    """Extract (hour, minute) from 'YYYY-MM-DDTHH:MM[...]'."""
    try:
        t = dt_str[11:16]   # 'HH:MM'
        return int(t[:2]), int(t[3:5])
    except (IndexError, ValueError, TypeError):
        return None, None


def _duration_mins(start_str: str, end_str: str) -> int:
    """Compute block duration in whole minutes."""
    try:
        sh, sm = _parse_hm(start_str)
        eh, em = _parse_hm(end_str)
        # Use the date portions too so cross-midnight durations work
        start_dt = datetime(
            int(start_str[0:4]), int(start_str[5:7]), int(start_str[8:10]), sh, sm
        )
        end_dt = datetime(
            int(end_str[0:4]), int(end_str[5:7]), int(end_str[8:10]), eh, em
        )
        return max(0, int((end_dt - start_dt).total_seconds() / 60))
    except (TypeError, ValueError):
        return 0


def _replace_time(date_str: str, h: int, mi: int, duration_mins: int) -> tuple:
    """
    Given 'YYYY-MM-DD' and a new (h, mi) + duration, return (start_str, end_str)
    where the date is preserved but the time is replaced.
    """
    start = datetime(int(date_str[0:4]), int(date_str[5:7]), int(date_str[8:10]), h, mi)
    end   = start + timedelta(minutes=duration_mins)
    fmt   = "%Y-%m-%dT%H:%M"
    return start.strftime(fmt), end.strftime(fmt)


# ── Read ──────────────────────────────────────────────────────────────────────

@router.get("/blocks", response_model=List[TimeBlockResponse])
async def get_blocks(user=Depends(get_current_user), db=Depends(get_db)):
    """Retrieve all time blocks for the authenticated user, sorted by start_time."""
    cursor = db["time_blocks"].find({"user_id": user["_id"]}).sort("start_time", 1)
    return [_doc_to_block(doc) async for doc in cursor]


# ── Create single ─────────────────────────────────────────────────────────────

@router.post("/blocks", response_model=TimeBlockResponse, status_code=status.HTTP_201_CREATED)
async def create_block(data: TimeBlockCreate, user=Depends(get_current_user), db=Depends(get_db)):
    """Create a single time block."""
    doc = {
        "user_id": user["_id"],
        "title":   data.title,
        "start_time": data.start_time,
        "end_time":   data.end_time,
        "task_id":    data.task_id,
        "color":      data.color,
        "recurrence": data.recurrence,
        "recurrence_group_id": data.recurrence_group_id,
    }
    result = await db["time_blocks"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _doc_to_block(doc)


# ── Create bulk (recurring series) ────────────────────────────────────────────

@router.post(
    "/blocks/bulk",
    response_model=List[TimeBlockResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_blocks_bulk(
    data: BulkBlockCreate,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Create multiple time blocks in a single request.

    Designed for recurring-task series: the frontend generates all occurrence
    dates, assigns a shared recurrence_group_id, and POSTs the whole batch here.
    Returns the created blocks in insertion order.
    """
    if not data.blocks:
        return []

    docs = [
        {
            "user_id": user["_id"],
            "title":   b.title,
            "start_time": b.start_time,
            "end_time":   b.end_time,
            "task_id":    b.task_id,
            "color":      b.color,
            "recurrence": b.recurrence,
            "recurrence_group_id": b.recurrence_group_id,
        }
        for b in data.blocks
    ]

    result = await db["time_blocks"].insert_many(docs)

    # Preserve insertion order by fetching in the same order
    id_to_doc = {}
    async for doc in db["time_blocks"].find({"_id": {"$in": result.inserted_ids}}):
        id_to_doc[str(doc["_id"])] = doc

    return [_doc_to_block(id_to_doc[str(oid)]) for oid in result.inserted_ids if str(oid) in id_to_doc]


# ── Update (single or whole-series from this point forward) ──────────────────

@router.put("/blocks/{block_id}", response_model=TimeBlockResponse)
async def update_block(
    block_id: str,
    data: TimeBlockCreate,
    scope: str = Query("this", description="'this' or 'this_and_future'"),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Update a time block.

    scope=this (default)
        Update only this block with the exact payload supplied.

    scope=this_and_future
        Update this block AND every subsequent block in the same
        recurrence_group_id series (ordered by start_time ASC).
        Each following block keeps its own DATE but its TIME is updated
        to match the edited block's time, preserving the duration.
        Title, color, task_id, recurrence, and recurrence_group_id are
        copied verbatim to all affected blocks.
    """
    # ── 1. Update the edited block itself ────────────────────────────────────
    result = await db["time_blocks"].find_one_and_update(
        {"_id": ObjectId(block_id), "user_id": user["_id"]},
        {"$set": data.model_dump()},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Time block not found")

    if scope != "this_and_future":
        return _doc_to_block(result)

    # ── 2. Propagate time change to all *following* blocks in the series ─────
    group_id = result.get("recurrence_group_id")
    if not group_id:
        # Not part of a series — nothing more to do
        return _doc_to_block(result)

    old_start_time = result["start_time"]   # the just-updated block's start
    new_h, new_mi  = _parse_hm(data.start_time)
    if new_h is None:
        return _doc_to_block(result)

    dur = _duration_mins(data.start_time, data.end_time)

    # Find every block in the same series that starts AFTER the edited block
    cursor = db["time_blocks"].find({
        "recurrence_group_id": group_id,
        "user_id": user["_id"],
        "start_time": {"$gt": old_start_time},
    })

    async for sibling in cursor:
        date_str = sibling["start_time"][:10]   # keep the sibling's date
        new_start, new_end = _replace_time(date_str, new_h, new_mi, dur)
        await db["time_blocks"].update_one(
            {"_id": sibling["_id"]},
            {"$set": {
                "title":   data.title,
                "start_time": new_start,
                "end_time":   new_end,
                "task_id":    data.task_id,
                "color":      data.color,
                "recurrence": data.recurrence,
                "recurrence_group_id": data.recurrence_group_id,
            }},
        )

    return _doc_to_block(result)


# ── Delete (single or series from this occurrence onward) ─────────────────────

@router.delete("/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_block(
    block_id: str,
    scope: str = Query("this", description="'this' or 'this_and_future'"),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Delete a time block.

    scope=this (default)
        Delete only this block.

    scope=this_and_future
        Delete this block and every subsequent block in the same
        recurrence_group_id series (start_time >= this block's start_time).
        Use this to cancel a recurring block from a given date onwards.
    """
    block = await db["time_blocks"].find_one(
        {"_id": ObjectId(block_id), "user_id": user["_id"]}
    )
    if not block:
        raise HTTPException(status_code=404, detail="Time block not found")

    if scope == "this_and_future" and block.get("recurrence_group_id"):
        # Delete this block and all future ones in the same series
        await db["time_blocks"].delete_many({
            "recurrence_group_id": block["recurrence_group_id"],
            "user_id": user["_id"],
            "start_time": {"$gte": block["start_time"]},
        })
    else:
        # Delete only this single block
        await db["time_blocks"].delete_one(
            {"_id": ObjectId(block_id), "user_id": user["_id"]}
        )
