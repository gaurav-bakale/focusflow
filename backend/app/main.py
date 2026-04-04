"""
FocusFlow Backend — FastAPI Application Entry Point

Initializes the app, registers all routers, configures CORS,
and manages the MongoDB connection lifecycle.
"""

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

from app.authentication.router import router as auth_router
from app.db import connect_db, close_db, get_db
from app.routers import timer, calendar, ai, export
from app.comments.router import router as comments_router
from app.sharing.router import router as sharing_router
from app.tasks.router import router as tasks_router
from app.workspaces.router import router as workspaces_router
from app.activity.router import router as activity_router
from app.notifications.router import router as notifications_router
from app.notifications.scanner import start_deadline_scanner, scan_deadlines
from app.ws import manager as ws_manager

load_dotenv()  # load backend/.env before any os.getenv() calls at runtime


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open the MongoDB connection pool on startup; close on shutdown."""
    await connect_db()
    # Ensure unique index on users.email — idempotent, safe to run every boot
    db = get_db()
    await db["users"].create_index("email", unique=True, background=True)
    # Indexes for task_shares — speeds up share lookups
    await db["task_shares"].create_index(
        [("task_id", 1), ("shared_with_id", 1)], background=True
    )
    await db["task_shares"].create_index("shared_with_email", background=True)
    # Indexes for workspace_members — speeds up membership lookups
    await db["workspace_members"].create_index(
        [("workspace_id", 1), ("user_id", 1)], unique=True, background=True
    )
    await db["workspace_members"].create_index("user_id", background=True)
    # Indexes for activities — speeds up feed queries
    await db["activities"].create_index(
        [("task_id", 1), ("created_at", -1)], background=True
    )
    await db["activities"].create_index(
        [("workspace_id", 1), ("created_at", -1)], background=True
    )
    await db["activities"].create_index(
        [("actor_id", 1), ("created_at", -1)], background=True
    )
    # Indexes for notifications — speeds up user feed and dedup checks
    await db["notifications"].create_index(
        [("user_id", 1), ("created_at", -1)], background=True
    )
    await db["notifications"].create_index(
        [("user_id", 1), ("task_id", 1), ("type", 1)], background=True
    )
    # Run an initial deadline scan, then start the background scheduler
    await scan_deadlines(db)
    scheduler = start_deadline_scanner(db)
    yield
    scheduler.shutdown(wait=False)
    await close_db()


app = FastAPI(
    title="FocusFlow API",
    description="Backend API for the FocusFlow productivity application.",
    version="2.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:3000",
    "http://localhost:5173",
    "https://focusflow-sandy-six.vercel.app",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router,   prefix="/api/auth",  tags=["Auth"])
app.include_router(tasks_router,  prefix="/api/tasks", tags=["Tasks"])
app.include_router(timer.router,     prefix="/api/timer",    tags=["Timer"])
app.include_router(calendar.router,  prefix="/api/calendar", tags=["Calendar"])
app.include_router(ai.router,        prefix="/api/ai",       tags=["AI"])
app.include_router(sharing_router,   prefix="/api/sharing",  tags=["Sharing"])
app.include_router(comments_router,  prefix="/api",          tags=["Comments"])
app.include_router(workspaces_router, prefix="/api/workspaces", tags=["Workspaces"])
app.include_router(activity_router,   prefix="/api/activity",   tags=["Activity"])
app.include_router(notifications_router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(export.router,        prefix="/api/export",        tags=["Export"])


@app.get("/", tags=["Health"])
async def root():
    """Health check — confirms the API is running."""
    return {"status": "FocusFlow API is running", "version": "2.0.0"}


# ── WebSocket ────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(default=""),
):
    """
    WebSocket endpoint for real-time collaboration notifications.

    Clients connect with ?token=<JWT> to authenticate. The server pushes
    JSON messages when collaboration events occur (task shared, comment
    added, workspace member joined, etc.).

    Observer pattern — each connected client subscribes to events for
    their user_id. The ConnectionManager notifies all subscribers.
    """
    import jwt
    import os

    secret = os.getenv("JWT_SECRET") or "dev-secret-key"

    # Authenticate via JWT in query param
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        user_id = payload.get("sub") or payload.get("user_id")
        if not user_id:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket, user_id)
    try:
        while True:
            # Keep connection alive; client can send pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
