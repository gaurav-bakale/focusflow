"""
FocusFlow Backend — FastAPI Application Entry Point

Initializes the app, registers all routers, configures CORS,
and manages the MongoDB connection lifecycle.
"""

from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()  # load backend/.env before any os.getenv() calls

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import connect_db, close_db
from app.authentication.router import router as auth_router
from app.tasks.router import router as tasks_router
from app.routers import timer, calendar, ai


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open the MongoDB connection pool on startup; close on shutdown."""
    await connect_db()
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


@app.get("/", tags=["Health"])
async def root():
    """Health check — confirms the API is running."""
    return {"status": "FocusFlow API is running", "version": "2.0.0"}
