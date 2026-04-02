"""
FocusFlow Backend — FastAPI Application Entry Point

Initializes the app, registers all routers, configures CORS,
and manages the MongoDB connection lifecycle.
"""

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.authentication.router import router as auth_router
from app.db import connect_db, close_db, get_db
from app.routers import timer, calendar, ai
from app.sharing.router import router as sharing_router
from app.tasks.router import router as tasks_router

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
    yield
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
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
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


@app.get("/", tags=["Health"])
async def root():
    """Health check — confirms the API is running."""
    return {"status": "FocusFlow API is running", "version": "2.0.0"}
