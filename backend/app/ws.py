"""
WebSocket Manager — Real-time notifications for collaborative features.

Manages connected WebSocket clients per user, allowing targeted broadcasts
when collaboration events occur (task shared, comment added, etc.).

Design patterns:
  Observer   — connected clients subscribe to events for their user_id;
               the manager notifies all subscribers when an event fires.
  Singleton  — a single ConnectionManager instance shared across the app.
"""

import json
from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    """
    Manages active WebSocket connections keyed by user_id.

    Each user can have multiple connections (e.g. multiple browser tabs).
    When an event occurs, all connections for the target user are notified.
    """

    def __init__(self):
        self.active: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept a WebSocket connection and register it under user_id."""
        await websocket.accept()
        if user_id not in self.active:
            self.active[user_id] = []
        self.active[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        """Remove a WebSocket connection from the user's list."""
        if user_id in self.active:
            self.active[user_id] = [
                ws for ws in self.active[user_id] if ws is not websocket
            ]
            if not self.active[user_id]:
                del self.active[user_id]

    async def send_to_user(self, user_id: str, message: dict):
        """Send a JSON message to all connections for a given user."""
        if user_id not in self.active:
            return
        dead = []
        for ws in self.active[user_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        # Clean up dead connections
        for ws in dead:
            self.disconnect(ws, user_id)

    async def broadcast(self, user_ids: List[str], message: dict):
        """Send a JSON message to multiple users."""
        for uid in user_ids:
            await self.send_to_user(uid, message)


# Singleton instance shared across the application
manager = ConnectionManager()
