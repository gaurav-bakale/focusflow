"""
Authentication & /me Endpoint Integration Tests
================================================

Design Patterns exercised
--------------------------
Facade pattern       — each test calls only the thin router endpoints; no
                       direct service or DB calls are made from test code.
Dependency Injection — the `client` fixture (from conftest.py) is injected
                       into every test, separating HTTP transport setup from
                       test logic.

Coverage
--------
register:
  - happy path: valid data → 201 + token
  - duplicate email → 409
  - password too short (< 8 chars) → 422
  - missing name → 422
  - invalid email format → 422

login:
  - happy path → 200 + token + user profile
  - wrong password → 401
  - non-existent email → 401
  - empty credentials → 422

/me endpoints:
  - GET /me — authenticated → 200 + profile
  - GET /me — no token → 401
  - PUT /me — update name → 200
  - PATCH /me/onboarding — complete onboarding → 200
  - PATCH /me/password — correct current password → 200
  - PATCH /me/password — wrong current password → 400

logout:
  - POST /logout → 200

Run with:
    PYTHONPATH=backend pytest tests/test_auth.py -v
"""

import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# ── Path setup ────────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402
from app.db import connect_db, close_db, get_db  # noqa: E402

BASE = "http://test"

# Unique email prefix to avoid collisions across test runs
_EMAIL_SUFFIX = "@auth-test.focusflow.internal"


# ── Module fixtures ───────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="module")
async def client():
    """
    Input    : none
    Expected : AsyncClient connected to the ASGI app.
    Pass     : yields without error; DB is connected.
    """
    await connect_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as ac:
        yield ac
    await close_db()


@pytest_asyncio.fixture(scope="module")
async def db(client):
    return get_db()


@pytest_asyncio.fixture(scope="module")
async def registered_user(client, db):
    """
    Create a fresh test user and yield credentials + token.

    Input    : POST /api/auth/register with valid payload.
    Expected : 201 with access_token; or 409 on conflict → login.
    Pass     : yields dict with keys: token, email, password, user_id.
    """
    payload = {
        "name": "Test Auth User",
        "email": f"auth_main{_EMAIL_SUFFIX}",
        "password": "TestPass1!",
    }
    resp = await client.post("/api/auth/register", json=payload)
    if resp.status_code == 409:
        resp = await client.post("/api/auth/login", json={
            "email": payload["email"],
            "password": payload["password"],
        })
    data = resp.json()
    yield {
        "token": data["access_token"],
        "email": payload["email"],
        "password": payload["password"],
        "user_id": data["user"]["id"],
    }
    # Teardown — remove test user and any tasks they created
    await db["users"].delete_many({"email": payload["email"]})
    await db["tasks"].delete_many({})


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ══════════════════════════════════════════════════════════════════════════════
# REGISTER
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_register_happy_path(client, db):
    """
    Tests Service Layer pattern: registration business logic (duplicate check,
    hashing, token creation) is fully encapsulated in AuthService.register().

    Input    : POST /api/auth/register with name, valid email, 8+ char password.
    Expected : HTTP 201, body contains access_token + user profile (no password).
    Pass     : status==201, 'access_token' in body, 'password' not in body['user'].
    """
    email = f"register_happy{_EMAIL_SUFFIX}"
    resp = await client.post("/api/auth/register", json={
        "name": "Happy User",
        "email": email,
        "password": "HappyPass1!",
    })
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == email
    assert "password" not in body["user"]
    assert "password_hash" not in body["user"]
    # Cleanup
    await db["users"].delete_many({"email": email})


@pytest.mark.asyncio
async def test_register_duplicate_email(client, registered_user):
    """
    Tests Service Layer: duplicate-email guard raises 409 before any insert.

    Input    : POST /api/auth/register with an already-registered email.
    Expected : HTTP 409 Conflict, detail mentions 'already registered'.
    Pass     : status==409.
    """
    resp = await client.post("/api/auth/register", json={
        "name": "Duplicate",
        "email": registered_user["email"],
        "password": "DupPass1!!",
    })
    assert resp.status_code == 409
    assert "already registered" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_password_too_short(client):
    """
    Tests Facade pattern: Pydantic validation (min_length=8) fires before
    the service is even called; the router returns 422 automatically.

    Input    : POST /api/auth/register with password length 5.
    Expected : HTTP 422 Unprocessable Entity.
    Pass     : status==422.
    """
    resp = await client.post("/api/auth/register", json={
        "name": "Short Pass",
        "email": f"shortpass{_EMAIL_SUFFIX}",
        "password": "abc12",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_missing_name(client):
    """
    Tests Facade pattern: required field 'name' missing → Pydantic 422.

    Input    : POST /api/auth/register without 'name' field.
    Expected : HTTP 422 Unprocessable Entity.
    Pass     : status==422.
    """
    resp = await client.post("/api/auth/register", json={
        "email": f"noname{_EMAIL_SUFFIX}",
        "password": "NoNamePass1!",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_invalid_email_format(client):
    """
    Tests Facade pattern: EmailStr validation rejects malformed addresses.

    Input    : POST /api/auth/register with email='not-an-email'.
    Expected : HTTP 422 Unprocessable Entity.
    Pass     : status==422.
    """
    resp = await client.post("/api/auth/register", json={
        "name": "Bad Email",
        "email": "not-an-email",
        "password": "BadEmail1!",
    })
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# LOGIN
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_login_happy_path(client, registered_user):
    """
    Tests Service Layer: AuthService.login() verifies password, issues token.

    Input    : POST /api/auth/login with correct email + password.
    Expected : HTTP 200, body contains access_token and user profile.
    Pass     : status==200, 'access_token' present, user.email matches.
    """
    resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": registered_user["password"],
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == registered_user["email"]
    assert "id" in body["user"]


@pytest.mark.asyncio
async def test_login_wrong_password(client, registered_user):
    """
    Tests Service Layer: wrong password results in a generic 401 (no user enumeration).

    Input    : POST /api/auth/login with correct email but wrong password.
    Expected : HTTP 401 Unauthorized.
    Pass     : status==401, detail mentions 'invalid'.
    """
    resp = await client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": "WrongPassword999!",
    })
    assert resp.status_code == 401
    assert "invalid" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_nonexistent_email(client):
    """
    Tests Service Layer: unknown email returns same 401 as wrong password
    (prevents user-enumeration via status code difference).

    Input    : POST /api/auth/login with email that was never registered.
    Expected : HTTP 401 Unauthorized.
    Pass     : status==401.
    """
    resp = await client.post("/api/auth/login", json={
        "email": f"ghost_nobody{_EMAIL_SUFFIX}",
        "password": "SomePass1!",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_empty_credentials(client):
    """
    Tests Facade pattern: empty strings fail Pydantic's EmailStr → 422.

    Input    : POST /api/auth/login with empty email string.
    Expected : HTTP 422 Unprocessable Entity.
    Pass     : status==422.
    """
    resp = await client.post("/api/auth/login", json={
        "email": "",
        "password": "",
    })
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# /me — GET
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_me_authenticated(client, registered_user):
    """
    Tests Dependency Injection: get_current_user is resolved from the token
    and the profile is returned without ever exposing the password hash.

    Input    : GET /api/auth/me with valid Bearer token.
    Expected : HTTP 200, body is a full UserProfile (id, name, email, …).
    Pass     : status==200, email matches registered user.
    """
    resp = await client.get("/api/auth/me", headers=_headers(registered_user["token"]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == registered_user["email"]
    assert "id" in body
    assert "onboarding_completed" in body
    assert "password_hash" not in body


@pytest.mark.asyncio
async def test_get_me_no_token(client):
    """
    Tests Dependency Injection: missing token is caught by get_current_user
    dependency before the handler executes.

    Input    : GET /api/auth/me with no Authorization header.
    Expected : HTTP 401 Unauthorized.
    Pass     : status==401.
    """
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


# ══════════════════════════════════════════════════════════════════════════════
# /me — PUT (update profile)
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_update_me_name(client, registered_user):
    """
    Tests Service Layer: AuthService.update_profile() writes only provided fields.

    Input    : PUT /api/auth/me with {"name": "Updated Name"}.
    Expected : HTTP 200, body reflects the new name.
    Pass     : status==200, body['name'] == 'Updated Name'.
    """
    resp = await client.put(
        "/api/auth/me",
        json={"name": "Updated Name"},
        headers=_headers(registered_user["token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


# ══════════════════════════════════════════════════════════════════════════════
# /me/onboarding — PATCH
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_complete_onboarding(client, registered_user):
    """
    Tests Service Layer: AuthService.complete_onboarding() sets flag + prefs.

    Input    : PATCH /api/auth/me/onboarding with valid OnboardingPreferences.
    Expected : HTTP 200, onboarding_completed==True, preferences stored.
    Pass     : status==200, onboarding_completed is True.
    """
    resp = await client.patch(
        "/api/auth/me/onboarding",
        json={
            "pomodoro_duration": 30,
            "short_break": 5,
            "long_break": 15,
            "timezone": "America/New_York",
            "theme": "dark",
        },
        headers=_headers(registered_user["token"]),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["onboarding_completed"] is True
    assert body["preferences"]["theme"] == "dark"


# ══════════════════════════════════════════════════════════════════════════════
# /me/password — PATCH
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_change_password_correct_current(client, registered_user, db):
    """
    Tests Service Layer: AuthService.change_password() verifies old password
    before updating; returns 200 on success.

    Input    : PATCH /api/auth/me/password with correct current_password.
    Expected : HTTP 200 with success message.
    Pass     : status==200, message contains 'updated'.
    """
    resp = await client.patch(
        "/api/auth/me/password",
        json={
            "current_password": registered_user["password"],
            "new_password": "NewSecurePass2!",
        },
        headers=_headers(registered_user["token"]),
    )
    assert resp.status_code == 200
    assert "updated" in resp.json()["message"].lower()
    # Reset password so subsequent tests still work
    await client.patch(
        "/api/auth/me/password",
        json={
            "current_password": "NewSecurePass2!",
            "new_password": registered_user["password"],
        },
        headers=_headers(registered_user["token"]),
    )


@pytest.mark.asyncio
async def test_change_password_wrong_current(client, registered_user):
    """
    Tests Service Layer: AuthService.change_password() raises 400 when the
    supplied current_password does not match the stored hash.

    Input    : PATCH /api/auth/me/password with wrong current_password.
    Expected : HTTP 400 Bad Request.
    Pass     : status==400, detail mentions 'incorrect'.
    """
    resp = await client.patch(
        "/api/auth/me/password",
        json={
            "current_password": "TotallyWrongPass!",
            "new_password": "NewPass12345!",
        },
        headers=_headers(registered_user["token"]),
    )
    assert resp.status_code == 400
    assert "incorrect" in resp.json()["detail"].lower()


# ══════════════════════════════════════════════════════════════════════════════
# LOGOUT
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_logout(client, registered_user):
    """
    Tests Facade pattern: logout is stateless (JWT); the endpoint exists purely
    as a signal for the client to discard the token — always returns 200.

    Input    : POST /api/auth/logout with valid Bearer token.
    Expected : HTTP 200, message body confirming logout.
    Pass     : status==200, 'message' key present in response.
    """
    resp = await client.post(
        "/api/auth/logout",
        headers=_headers(registered_user["token"]),
    )
    assert resp.status_code == 200
    assert "message" in resp.json()
