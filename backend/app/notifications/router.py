"""
Notifications Router — /api/notifications

CRUD endpoints for deadline notifications.

Endpoints:
  GET    /               — list notifications (newest first, optional ?unread_only=true)
  GET    /count          — unread notification count
  PATCH  /{id}/read      — mark a single notification as read
  PATCH  /read-all       — mark all notifications as read
  DELETE /{id}           — delete a notification
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import get_current_user
from app.db import get_db
from app.notifications.models import NotificationResponse, UnreadCountResponse
from app.notifications.service import NotificationService

router = APIRouter()


def _svc(db=Depends(get_db)) -> NotificationService:
    """Factory — inject a NotificationService with the active DB."""
    return NotificationService(db)


@router.get(
    "/",
    response_model=List[NotificationResponse],
    summary="List notifications for the current user",
)
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    svc: NotificationService = Depends(_svc),
):
    """Return notifications for the authenticated user, newest first."""
    return await svc.list_for_user(
        user_id=str(user["_id"]),
        limit=limit,
        unread_only=unread_only,
    )


@router.get(
    "/count",
    response_model=UnreadCountResponse,
    summary="Get unread notification count",
)
async def get_unread_count(
    user=Depends(get_current_user),
    svc: NotificationService = Depends(_svc),
):
    """Return the number of unread notifications."""
    count = await svc.unread_count(str(user["_id"]))
    return UnreadCountResponse(count=count)


@router.patch(
    "/read-all",
    summary="Mark all notifications as read",
)
async def mark_all_read(
    user=Depends(get_current_user),
    svc: NotificationService = Depends(_svc),
):
    """Mark every unread notification as read for the current user."""
    updated = await svc.mark_all_read(str(user["_id"]))
    return {"updated": updated}


@router.patch(
    "/{notification_id}/read",
    summary="Mark a single notification as read",
)
async def mark_read(
    notification_id: str,
    user=Depends(get_current_user),
    svc: NotificationService = Depends(_svc),
):
    """Mark a specific notification as read."""
    success = await svc.mark_read(notification_id, str(user["_id"]))
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    return {"status": "read"}


@router.delete(
    "/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a notification",
)
async def delete_notification(
    notification_id: str,
    user=Depends(get_current_user),
    svc: NotificationService = Depends(_svc),
):
    """Delete a specific notification."""
    success = await svc.delete(notification_id, str(user["_id"]))
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
