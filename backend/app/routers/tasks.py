"""
Tasks Router - /api/tasks

Full CRUD for task management including subtasks and status transitions.
All endpoints require a valid JWT token.
"""

from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId

from app.models import TaskCreate, TaskUpdate, TaskResponse, SubtaskResponse
from app.auth import get_current_user
from app.db import get_db

router = APIRouter()


def _doc_to_task(doc: dict) -> TaskResponse:
    """Convert a raw MongoDB document to a TaskResponse model."""
    subtasks = []
    for i, s in enumerate(doc.get("subtasks", [])):
        subtasks.append(SubtaskResponse(id=str(i), title=s["title"], status=s.get("status", "TODO")))
    return TaskResponse(
        id=str(doc["_id"]),
        user_id=str(doc["user_id"]),
        title=doc["title"],
        description=doc.get("description"),
        priority=doc.get("priority", "MEDIUM"),
        deadline=doc.get("deadline"),
        status=doc.get("status", "TODO"),
        subtasks=subtasks,
        is_complete=doc.get("status") == "DONE",
        created_at=doc.get("created_at", datetime.utcnow()),
        updated_at=doc.get("updated_at", datetime.utcnow()),
    )


@router.get("", response_model=List[TaskResponse])
async def get_tasks(user=Depends(get_current_user), db=Depends(get_db)):
    """
    Retrieve all tasks for the authenticated user.

    Returns:
        List of TaskResponse objects sorted by creation date descending.
    """
    cursor = db["tasks"].find({"user_id": user["_id"]}).sort("created_at", -1)
    return [_doc_to_task(doc) async for doc in cursor]


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(data: TaskCreate, user=Depends(get_current_user), db=Depends(get_db)):
    """
    Create a new task for the authenticated user.

    Args:
        data: TaskCreate with title, description, priority, deadline, status.

    Returns:
        The created TaskResponse with server-assigned id and timestamps.
    """
    now = datetime.utcnow()
    doc = {
        "user_id": user["_id"],
        "title": data.title,
        "description": data.description,
        "priority": data.priority,
        "deadline": data.deadline,
        "status": data.status,
        "subtasks": [],
        "created_at": now,
        "updated_at": now,
    }
    result = await db["tasks"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _doc_to_task(doc)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """
    Retrieve a single task by ID.

    Raises:
        HTTPException 404: If task not found or does not belong to user.
    """
    doc = await db["tasks"].find_one({"_id": ObjectId(task_id), "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Task not found")
    return _doc_to_task(doc)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, data: TaskUpdate, user=Depends(get_current_user), db=Depends(get_db)):
    """
    Update an existing task's fields (partial update — only provided fields are changed).

    Args:
        task_id: The MongoDB ID of the task to update.
        data: TaskUpdate with any subset of updatable fields.

    Returns:
        The updated TaskResponse.

    Raises:
        HTTPException 404: If task not found or not owned by the user.
    """
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    update_data["updated_at"] = datetime.utcnow()

    result = await db["tasks"].find_one_and_update(
        {"_id": ObjectId(task_id), "user_id": user["_id"]},
        {"$set": update_data},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return _doc_to_task(result)


@router.patch("/{task_id}/complete", response_model=TaskResponse)
async def complete_task(task_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """
    Mark a task as complete by setting its status to DONE.

    Args:
        task_id: The MongoDB ID of the task to mark complete.

    Returns:
        The updated TaskResponse with status=DONE and is_complete=True.

    Raises:
        HTTPException 404: If task not found.
    """
    result = await db["tasks"].find_one_and_update(
        {"_id": ObjectId(task_id), "user_id": user["_id"]},
        {"$set": {"status": "DONE", "updated_at": datetime.utcnow()}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return _doc_to_task(result)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """
    Delete a task by ID.

    Raises:
        HTTPException 404: If task not found or not owned by the user.
    """
    result = await db["tasks"].delete_one({"_id": ObjectId(task_id), "user_id": user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
