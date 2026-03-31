"""
Password management tests
  PATCH /api/auth/me/password
"""

import pytest

from tests.backend.authentication.conftest import auth_headers


@pytest.mark.asyncio
async def test_change_password_success(client, registered_user):
    resp = await client.patch(
        "/api/auth/me/password",
        json={
            "current_password": registered_user["password"],
            "new_password": "NewSecure1!",
        },
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 200
    assert "updated" in resp.json()["message"].lower()


@pytest.mark.asyncio
async def test_change_password_allows_login_with_new_password(client, registered_user):
    await client.patch(
        "/api/auth/me/password",
        json={"current_password": registered_user["password"], "new_password": "NewSecure1!"},
        headers=auth_headers(registered_user["token"]),
    )
    login_resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": "NewSecure1!",
    })
    assert login_resp.status_code == 200


@pytest.mark.asyncio
async def test_change_password_old_password_no_longer_works(client, registered_user):
    await client.patch(
        "/api/auth/me/password",
        json={"current_password": registered_user["password"], "new_password": "NewSecure1!"},
        headers=auth_headers(registered_user["token"]),
    )
    login_resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": registered_user["password"],  # old password
    })
    assert login_resp.status_code == 401


@pytest.mark.asyncio
async def test_change_password_wrong_current_returns_400(client, registered_user):
    resp = await client.patch(
        "/api/auth/me/password",
        json={"current_password": "WrongOldPass!", "new_password": "NewSecure1!"},
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 400
    assert "incorrect" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_change_password_new_too_short_returns_422(client, registered_user):
    resp = await client.patch(
        "/api/auth/me/password",
        json={"current_password": registered_user["password"], "new_password": "short"},
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_change_password_without_token_returns_401(client):
    resp = await client.patch(
        "/api/auth/me/password",
        json={"current_password": "anything", "new_password": "NewSecure1!"},
    )
    assert resp.status_code == 401
