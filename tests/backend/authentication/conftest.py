"""
Shared fixtures for all authentication tests.
"""

import os
from pathlib import Path

import pytest
import pytest_asyncio
from dotenv import load_dotenv
from httpx import AsyncClient, ASGITransport

load_dotenv(Path(__file__).parent.parent.parent.parent / "backend" / ".env")

from app.main import app  # noqa: E402
from app.db import connect_db, close_db, get_db  # noqa: E402


@pytest_asyncio.fixture
async def db():
    await connect_db()
    yield get_db()
    await close_db()


@pytest_asyncio.fixture
async def client(db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


def _make_user(tag: str) -> dict:
    return {
        "name": f"Test {tag}",
        "email": f"ff_{tag}@focusflow-ci.com",
        "password": "TestPass1!",
    }


@pytest_asyncio.fixture
async def registered_user(client, db):
    """Register a fresh test user; clean up after the test."""
    payload = _make_user("primary")
    resp = await client.post("/api/auth/register", json=payload)
    if resp.status_code == 409:
        resp = await client.post("/api/auth/login", json={
            "email": payload["email"],
            "password": payload["password"],
        })
    data = resp.json()
    yield {
        "token": data["access_token"],
        "user_id": data["user"]["id"],
        "email": payload["email"],
        "password": payload["password"],
        "name": payload["name"],
    }
    await db["users"].delete_many({"email": payload["email"]})
    await db["tasks"].delete_many({"user_id": {"$regex": "^"}})  # only test tasks


@pytest_asyncio.fixture
async def second_user(client, db):
    """A second independent user for cross-user tests."""
    payload = _make_user("secondary")
    resp = await client.post("/api/auth/register", json=payload)
    if resp.status_code == 409:
        resp = await client.post("/api/auth/login", json={
            "email": payload["email"],
            "password": payload["password"],
        })
    data = resp.json()
    yield {
        "token": data["access_token"],
        "user_id": data["user"]["id"],
        "email": payload["email"],
        "password": payload["password"],
    }
    await db["users"].delete_many({"email": payload["email"]})


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
