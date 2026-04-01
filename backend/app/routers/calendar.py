"""
Calendar Router - /api/calendar

Handles time block creation, retrieval, and deletion for the weekly calendar view.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId

from app.models import TimeBlockCreate, TimeBlockResponse
from app.auth import get_current_user
from app.db import get_db

router = APIRouter()


def _doc_to_block(doc: dict) -> TimeBlockResponse:
    return TimeBlockResponse(
        id=str(doc["_id"]),
        user_id=str(doc["user_id"]),
        title=doc["title"],
        start_time=doc["start_time"],
        end_time=doc["end_time"],
        task_id=doc.get("task_id"),
        color=doc.get("color"),
    )


@router.get("/blocks", response_model=List[TimeBlockResponse])
async def get_blocks(user=Depends(get_current_user), db=Depends(get_db)):
    """
    Retrieve all time blocks for the authenticated user's calendar.

    Returns:
        List of TimeBlockResponse objects sorted by start_time ascending.
    """
    cursor = db["time_blocks"].find({"user_id": user["_id"]}).sort("start_time", 1)
    return [_doc_to_block(doc) async for doc in cursor]


@router.post("/blocks", response_model=TimeBlockResponse, status_code=status.HTTP_201_CREATED)
async def create_block(data: TimeBlockCreate, user=Depends(get_current_user), db=Depends(get_db)):
    """
    Create a new time block on the calendar.

    Args:
        data: TimeBlockCreate with title, start_time, end_time, and optional task_id.

    Returns:
        The created TimeBlockResponse with server-assigned id.
    """
    doc = {
        "user_id": user["_id"],
        "title": data.title,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "task_id": data.task_id,
    }
    result = await db["time_blocks"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _doc_to_block(doc)


@router.put("/blocks/{block_id}", response_model=TimeBlockResponse)
async def update_block(
    block_id: str,
    data: TimeBlockCreate,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Update an existing time block.

    Args:
        block_id: The MongoDB ID of the block to update.
        data: TimeBlockCreate with updated fields.

    Raises:
        HTTPException 404: If block not found or not owned by user.
    """
    result = await db["time_blocks"].find_one_and_update(
        {"_id": ObjectId(block_id), "user_id": user["_id"]},
        {"$set": data.model_dump()},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Time block not found")
    return _doc_to_block(result)


@router.delete("/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_block(block_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """
    Delete a time block by ID.

    Raises:
        HTTPException 404: If block not found or not owned by user.
    """
    result = await db["time_blocks"].delete_one({"_id": ObjectId(block_id), "user_id": user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Time block not found")
