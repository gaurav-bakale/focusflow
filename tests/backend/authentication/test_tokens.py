"""
JWT token unit + integration tests

Unit tests exercise create_access_token / decode_access_token directly
(no HTTP layer).  Integration tests hit the API to ensure the
Bearer-token middleware is wired up correctly.
"""

from datetime import timedelta

import pytest
import jwt
from jwt.exceptions import InvalidTokenError as JWTError

from app.authentication.utils import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    decode_access_token,
)
from tests.backend.authentication.conftest import auth_headers


# ── Unit tests ────────────────────────────────────────────────────────────────

def test_create_access_token_contains_sub():
    token = create_access_token({"sub": "user123"})
    payload = decode_access_token(token)
    assert payload["sub"] == "user123"


def test_create_access_token_has_exp():
    token = create_access_token({"sub": "user123"})
    payload = decode_access_token(token)
    assert "exp" in payload


def test_expired_token_raises_jwterror():
    token = create_access_token({"sub": "user123"}, expires_delta=timedelta(seconds=-1))
    with pytest.raises(JWTError):
        decode_access_token(token)


def test_tampered_signature_raises_jwterror():
    token = create_access_token({"sub": "user123"})
    bad_token = token[:-5] + "XXXXX"
    with pytest.raises(JWTError):
        decode_access_token(bad_token)


def test_wrong_secret_raises_jwterror():
    token = jwt.encode({"sub": "user123"}, "wrong-secret", algorithm=ALGORITHM)
    with pytest.raises(JWTError):
        decode_access_token(token)


def test_token_without_sub_decodes_but_has_no_sub():
    token = create_access_token({"role": "admin"})
    payload = decode_access_token(token)
    assert payload.get("sub") is None


def test_custom_expiry_is_respected():
    short = create_access_token({"sub": "u"}, expires_delta=timedelta(hours=1))
    long = create_access_token({"sub": "u"}, expires_delta=timedelta(hours=24))
    short_exp = decode_access_token(short)["exp"]
    long_exp = decode_access_token(long)["exp"]
    assert long_exp > short_exp


# ── Integration tests (HTTP) ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_valid_token_accesses_protected_route(client, registered_user):
    resp = await client.get("/api/tasks", headers=auth_headers(registered_user["token"]))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_no_token_returns_401(client):
    resp = await client.get("/api/tasks")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_returns_401(client, registered_user):
    expired = create_access_token(
        {"sub": registered_user["user_id"]},
        expires_delta=timedelta(seconds=-1),
    )
    resp = await client.get("/api/tasks", headers=auth_headers(expired))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_tampered_token_returns_401(client, registered_user):
    bad = registered_user["token"][:-5] + "XXXXX"
    resp = await client.get("/api/tasks", headers=auth_headers(bad))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_wrong_secret_token_returns_401(client, registered_user):
    from bson import ObjectId
    fake = jwt.encode(
        {"sub": registered_user["user_id"]},
        "completely-wrong-secret",
        algorithm=ALGORITHM,
    )
    resp = await client.get("/api/tasks", headers=auth_headers(fake))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_token_for_deleted_user_returns_401(client, db):
    """Token is valid but user no longer exists in DB → 401."""
    from bson import ObjectId
    ghost_id = str(ObjectId())
    ghost_token = create_access_token({"sub": ghost_id})
    resp = await client.get("/api/auth/me", headers=auth_headers(ghost_token))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout_returns_200_with_valid_token(client, registered_user):
    resp = await client.post("/api/auth/logout", headers=auth_headers(registered_user["token"]))
    assert resp.status_code == 200
    assert "logged out" in resp.json()["message"].lower()


@pytest.mark.asyncio
async def test_logout_without_token_returns_401(client):
    resp = await client.post("/api/auth/logout")
    assert resp.status_code == 401
