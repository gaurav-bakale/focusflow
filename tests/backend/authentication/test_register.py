"""
Registration flow tests
  POST /api/auth/register
"""

import pytest

from tests.backend.authentication.conftest import auth_headers


@pytest.mark.asyncio
async def test_register_returns_201_with_token(client, db):
    resp = await client.post("/api/auth/register", json={
        "name": "Fresh User",
        "email": "fresh_user@focusflow-ci.com",
        "password": "FreshPass1!",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    await db["users"].delete_many({"email": "fresh_user@focusflow-ci.com"})


@pytest.mark.asyncio
async def test_register_response_has_correct_user_fields(client, db):
    resp = await client.post("/api/auth/register", json={
        "name": "Field Check",
        "email": "field_check@focusflow-ci.com",
        "password": "FieldPass1!",
    })
    assert resp.status_code == 201
    user = resp.json()["user"]
    assert user["name"] == "Field Check"
    assert user["email"] == "field_check@focusflow-ci.com"
    assert "id" in user
    assert "password" not in user
    assert "password_hash" not in user
    await db["users"].delete_many({"email": "field_check@focusflow-ci.com"})


@pytest.mark.asyncio
async def test_register_sets_onboarding_completed_false(client, db):
    resp = await client.post("/api/auth/register", json={
        "name": "Onboard Check",
        "email": "onboard_check@focusflow-ci.com",
        "password": "OnboardPass1!",
    })
    assert resp.status_code == 201
    user = resp.json()["user"]
    assert user["onboarding_completed"] is False
    await db["users"].delete_many({"email": "onboard_check@focusflow-ci.com"})


@pytest.mark.asyncio
async def test_register_stores_default_preferences(client, db):
    resp = await client.post("/api/auth/register", json={
        "name": "Pref Check",
        "email": "pref_check@focusflow-ci.com",
        "password": "PrefPass1!",
    })
    prefs = resp.json()["user"]["preferences"]
    assert prefs["pomodoro_duration"] == 25
    assert prefs["short_break"] == 5
    assert prefs["long_break"] == 15
    await db["users"].delete_many({"email": "pref_check@focusflow-ci.com"})


@pytest.mark.asyncio
async def test_register_duplicate_email_returns_409(client, registered_user):
    resp = await client.post("/api/auth/register", json={
        "name": "Duplicate",
        "email": registered_user["email"],
        "password": "AnotherPass1!",
    })
    assert resp.status_code == 409
    assert "already registered" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_password_too_short_returns_422(client):
    resp = await client.post("/api/auth/register", json={
        "name": "Short Pass",
        "email": "shortpass@focusflow-ci.com",
        "password": "abc",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_invalid_email_returns_422(client):
    resp = await client.post("/api/auth/register", json={
        "name": "Bad Email",
        "email": "not-an-email",
        "password": "ValidPass1!",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_missing_name_returns_422(client):
    resp = await client.post("/api/auth/register", json={
        "email": "no_name@focusflow-ci.com",
        "password": "ValidPass1!",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_name_too_short_returns_422(client):
    resp = await client.post("/api/auth/register", json={
        "name": "A",
        "email": "short_name@focusflow-ci.com",
        "password": "ValidPass1!",
    })
    assert resp.status_code == 422
