"""
Backend Test Suite — WebSocket Real-time Notifications (Issue #42)

Framework : pytest + httpx (AsyncClient + ASGITransport)
Strategy  : Tests the ConnectionManager in isolation and the WebSocket
            endpoint via ASGI transport.

Test oracle convention:
    Each test declares Input, Oracle, Success condition, Failure condition.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.ws import ConnectionManager


# ── TC-WS01: ConnectionManager — connect and send ──────────────────────────

@pytest.mark.asyncio
async def test_manager_connect_and_send():
    """
    TC-WS01: ConnectionManager tracks connected clients and sends messages.
    Input  : Connect a mock WebSocket, then send a message.
    Oracle : The message is delivered to the WebSocket.
    Success: send_json called with the message.
    Failure: send_json not called.
    """
    mgr = ConnectionManager()
    ws = AsyncMock()
    await mgr.connect(ws, "user-1")

    assert "user-1" in mgr.active
    assert len(mgr.active["user-1"]) == 1

    await mgr.send_to_user("user-1", {"event": "test"})
    ws.send_json.assert_called_once_with({"event": "test"})


# ── TC-WS02: ConnectionManager — disconnect ────────────────────────────────

@pytest.mark.asyncio
async def test_manager_disconnect():
    """
    TC-WS02: ConnectionManager removes client on disconnect.
    Input  : Connect and then disconnect.
    Oracle : User removed from active connections.
    Success: user-1 not in active.
    Failure: user-1 still in active.
    """
    mgr = ConnectionManager()
    ws = AsyncMock()
    await mgr.connect(ws, "user-1")
    mgr.disconnect(ws, "user-1")

    assert "user-1" not in mgr.active


# ── TC-WS03: ConnectionManager — multiple connections per user ─────────────

@pytest.mark.asyncio
async def test_manager_multiple_connections():
    """
    TC-WS03: ConnectionManager supports multiple tabs per user.
    Input  : Connect two WebSockets for the same user, send a message.
    Oracle : Both WebSockets receive the message.
    Success: send_json called on both.
    Failure: Only one receives it.
    """
    mgr = ConnectionManager()
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    await mgr.connect(ws1, "user-1")
    await mgr.connect(ws2, "user-1")

    assert len(mgr.active["user-1"]) == 2

    await mgr.send_to_user("user-1", {"event": "test"})
    ws1.send_json.assert_called_once_with({"event": "test"})
    ws2.send_json.assert_called_once_with({"event": "test"})


# ── TC-WS04: ConnectionManager — broadcast to multiple users ──────────────

@pytest.mark.asyncio
async def test_manager_broadcast():
    """
    TC-WS04: ConnectionManager broadcasts to multiple users.
    Input  : Connect two different users, broadcast to both.
    Oracle : Both users receive the message.
    Success: send_json called on both.
    Failure: One or both miss the message.
    """
    mgr = ConnectionManager()
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    await mgr.connect(ws1, "user-1")
    await mgr.connect(ws2, "user-2")

    await mgr.broadcast(["user-1", "user-2"], {"event": "broadcast"})
    ws1.send_json.assert_called_once_with({"event": "broadcast"})
    ws2.send_json.assert_called_once_with({"event": "broadcast"})


# ── TC-WS05: ConnectionManager — send to nonexistent user ─────────────────

@pytest.mark.asyncio
async def test_manager_send_to_nonexistent_user():
    """
    TC-WS05: Sending to a user with no connections is a no-op.
    Input  : Send to user-99 with no connections.
    Oracle : No error raised.
    Success: No exception.
    Failure: Exception raised.
    """
    mgr = ConnectionManager()
    # Should not raise
    await mgr.send_to_user("user-99", {"event": "test"})


# ── TC-WS06: ConnectionManager — dead connection cleanup ──────────────────

@pytest.mark.asyncio
async def test_manager_cleans_dead_connections():
    """
    TC-WS06: Dead connections are cleaned up on send failure.
    Input  : Connect a WebSocket that raises on send, then send a message.
    Oracle : The dead connection is removed from active.
    Success: user-1 not in active after send.
    Failure: user-1 still in active.
    """
    mgr = ConnectionManager()
    ws = AsyncMock()
    ws.send_json.side_effect = Exception("connection closed")
    await mgr.connect(ws, "user-1")

    await mgr.send_to_user("user-1", {"event": "test"})
    assert "user-1" not in mgr.active


# ── TC-WS07: ConnectionManager — partial disconnect ───────────────────────

@pytest.mark.asyncio
async def test_manager_partial_disconnect():
    """
    TC-WS07: Disconnecting one of two connections leaves the other.
    Input  : Connect two WebSockets, disconnect one.
    Oracle : One connection remains.
    Success: len(active[user-1]) == 1.
    Failure: user-1 removed entirely.
    """
    mgr = ConnectionManager()
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    await mgr.connect(ws1, "user-1")
    await mgr.connect(ws2, "user-1")

    mgr.disconnect(ws1, "user-1")
    assert len(mgr.active["user-1"]) == 1
    assert mgr.active["user-1"][0] is ws2
