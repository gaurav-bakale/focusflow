"""
User profile tests
  GET  /api/auth/me
  PUT  /api/auth/me
"""

import pytest

from tests.backend.authentication.conftest import auth_headers


@pytest.mark.asyncio
async def test_get_me_returns_profile(client, registered_user):
    resp = await client.get("/api/auth/me", headers=auth_headers(registered_user["token"]))
    assert resp.status_code == 200
    user = resp.json()
    assert user["email"] == registered_user["email"]
    assert user["id"] == registered_user["user_id"]
    assert "onboarding_completed" in user
    assert "preferences" in user
    assert "created_at" in user


@pytest.mark.asyncio
async def test_get_me_without_token_returns_401(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me_with_tampered_token_returns_401(client, registered_user):
    bad_token = registered_user["token"][:-5] + "XXXXX"
    resp = await client.get("/api/auth/me", headers=auth_headers(bad_token))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me_does_not_expose_password_hash(client, registered_user):
    resp = await client.get("/api/auth/me", headers=auth_headers(registered_user["token"]))
    body_str = resp.text
    assert "password_hash" not in body_str
    assert "password" not in body_str


@pytest.mark.asyncio
async def test_update_name_returns_updated_profile(client, registered_user):
    resp = await client.put(
        "/api/auth/me",
        json={"name": "Updated Name"},
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_update_name_persists_on_get_me(client, registered_user):
    await client.put(
        "/api/auth/me",
        json={"name": "Persisted Name"},
        headers=auth_headers(registered_user["token"]),
    )
    resp = await client.get("/api/auth/me", headers=auth_headers(registered_user["token"]))
    assert resp.json()["name"] == "Persisted Name"


@pytest.mark.asyncio
async def test_update_name_too_short_returns_422(client, registered_user):
    resp = await client.put(
        "/api/auth/me",
        json={"name": "A"},
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_empty_body_returns_400(client, registered_user):
    resp = await client.put(
        "/api/auth/me",
        json={},
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_me_without_token_returns_401(client):
    resp = await client.put("/api/auth/me", json={"name": "Hacker"})
    assert resp.status_code == 401
