"""
FocusFlow Backend - FastAPI Application Entry Point

Initializes the FastAPI app, registers all routers,
configures CORS, and manages the MongoDB connection lifecycle.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import connect_db, close_db
from app.routers import auth, tasks, timer, calendar, ai


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown: open and close the MongoDB connection pool."""
    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title="FocusFlow API",
    description="Backend API for the FocusFlow productivity application.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router,     prefix="/api/auth",     tags=["Auth"])
app.include_router(tasks.router,    prefix="/api/tasks",    tags=["Tasks"])
app.include_router(timer.router,    prefix="/api/timer",    tags=["Timer"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["Calendar"])
app.include_router(ai.router,       prefix="/api/ai",       tags=["AI"])


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "FocusFlow API is running"}
