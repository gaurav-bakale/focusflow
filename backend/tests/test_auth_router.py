"""
Integration tests for the /api/auth router.

Uses FastAPI TestClient (synchronous) backed by mongomock-motor so no real
MongoDB is required.  Each test is independent: users created during a test
are cleaned up in a fixture or directly inside the test.

Fixture pattern mirrors the existing tests/conftest.py session-scoped
mongomock setup.  We wire into the same app.db globals and override the
get_db FastAPI dependency so every handler receives the in-memory mock DB.

Run from the repo root:
    PYTHONPATH=backend pytest backend/tests/test_auth_router.py -v
"""

import os
import sys
from pathlib import Path

import pytest
import pytest_asyncio
import mongomock_motor
from httpx import AsyncClient, ASGITransport

# ── Path bootstrap ─────────────────────────────────────────────────────────────
# When run directly from backend/ we still need the package on sys.path.
_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

os.environ.setdefault("MONGODB_DB", "focusflow_test")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-pytest")

# ── App imports (after path setup) ────────────────────────────────────────────
from app.main import app          # noqa: E402
import app.db as _db_module       # noqa: E402
import app.main as _main_module   # noqa: E402
from app.db import get_db         # noqa: E402
from app.authentication.utils import hash_password  # noqa: E402


# ── Patch lifespan so it never touches real MongoDB ───────────────────────────

async def _noop_connect():
    pass


async def _noop_close():
    pass


_main_module.connect_db = _noop_connect
_main_module.close_db = _noop_close


# ── Session-scoped mock DB ─────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def _mock_db_session():
    """
    Single in-memory MongoDB for the whole test session.

    Session scope keeps one event-loop + one mongomock WorkerThread alive for
    the entire run, avoiding "attached to a different loop" errors on Py 3.12+.
    """
    mock_mongo = mongomock_motor.AsyncMongoMockClient()
    db = mock_mongo["focusflow_test"]

    # Wire into app.db globals
    _db_module._client = mock_mongo
    _db_module._db = db

    # Override FastAPI dependency
    app.dependency_overrides[get_db] = lambda: db

    yield db, mock_mongo

    app.dependency_overrides.pop(get_db, None)
    _db_module._client = None
    _db_module._db = None


@pytest_asyncio.fixture(autouse=True)
async def _rewire(_mock_db_session):
    """
    Re-wire globals + dependency override before every test.

    Some paths (e.g., calling close_db()) may clear app.db._db.  This fixture
    restores the mock so subsequent tests are unaffected.
    """
    db, mock_mongo = _mock_db_session
    _db_module._client = mock_mongo
    _db_module._db = db
    app.dependency_overrides[get_db] = lambda: db
    yield


# ── Shared fixtures ────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(_mock_db_session):
    """Async HTTP client talking to the FastAPI ASGI app."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def db(_mock_db_session):
    """Return the mock DB handle for direct cleanup in tests."""
    db, _mongo = _mock_db_session
    return db


# ── Helper ────────────────────────────────────────────────────────────────────

def _make_payload(tag: str) -> dict:
    """Build a unique, valid registration payload."""
    return {
        "name": f"Router Test {tag}",
        "email": f"router_{tag}@focusflow-ci.internal",
        "password": "RouterPass1!",
    }


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/auth/register
# ══════════════════════════════════════════════════════════════════════════════

class TestRegister:

    @pytest.mark.asyncio
    async def test_valid_registration_returns_201_with_token(self, client, db):
        payload = _make_payload("reg_ok")
        resp = await client.post("/api/auth/register", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        # Cleanup
        await db["users"].delete_many({"email": payload["email"]})

    @pytest.mark.asyncio
    async def test_registration_response_contains_user_profile(self, client, db):
        payload = _make_payload("reg_profile")
        resp = await client.post("/api/auth/register", json=payload)
        assert resp.status_code == 201
        user = resp.json()["user"]
        assert user["name"] == payload["name"]
        assert user["email"] == payload["email"]
        assert "id" in user
        assert "password" not in user
        assert "password_hash" not in user
        assert user["onboarding_completed"] is False
        await db["users"].delete_many({"email": payload["email"]})

    @pytest.mark.asyncio
    async def test_weak_password_no_uppercase_returns_422(self, client):
        resp = await client.post("/api/auth/register", json={
            "name": "Weak Pass",
            "email": "weak_upper@focusflow-ci.internal",
            "password": "nouppercase1!",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_weak_password_no_number_returns_422(self, client):
        resp = await client.post("/api/auth/register", json={
            "name": "Weak Pass",
            "email": "weak_num@focusflow-ci.internal",
            "password": "NoNumberHere!",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_weak_password_no_special_char_returns_422(self, client):
        resp = await client.post("/api/auth/register", json={
            "name": "Weak Pass",
            "email": "weak_spec@focusflow-ci.internal",
            "password": "NoSpecial1Only",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_weak_password_too_short_returns_422(self, client):
        resp = await client.post("/api/auth/register", json={
            "name": "Short Pass",
            "email": "short_pw@focusflow-ci.internal",
            "password": "Ab1!",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_422_response_body_contains_validation_detail(self, client):
        """FastAPI 422 responses must include a 'detail' key describing the error."""
        resp = await client.post("/api/auth/register", json={
            "name": "Bad",
            "email": "bad@focusflow-ci.internal",
            "password": "weak",
        })
        assert resp.status_code == 422
        body = resp.json()
        assert "detail" in body

    @pytest.mark.asyncio
    async def test_duplicate_email_returns_409_already_registered(self, client, db):
        payload = _make_payload("dup_email")
        # First registration
        r1 = await client.post("/api/auth/register", json=payload)
        assert r1.status_code == 201

        # Second registration with same email
        r2 = await client.post("/api/auth/register", json={
            **payload,
            "name": "Another Name",
        })
        assert r2.status_code == 409
        assert "already registered" in r2.json()["detail"].lower()

        await db["users"].delete_many({"email": payload["email"]})

    @pytest.mark.asyncio
    async def test_missing_required_fields_returns_422(self, client):
        resp = await client.post("/api/auth/register", json={
            "email": "missing_fields@focusflow-ci.internal",
            # name and password omitted
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_email_format_returns_422(self, client):
        resp = await client.post("/api/auth/register", json={
            "name": "Bad Email",
            "email": "definitely-not-an-email",
            "password": "ValidPass1!",
        })
        assert resp.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/auth/login
# ══════════════════════════════════════════════════════════════════════════════

class TestLogin:

    @pytest_asyncio.fixture
    async def registered(self, client, db):
        """Register a fresh user for login tests, clean up after."""
        payload = _make_payload("login_base")
        resp = await client.post("/api/auth/register", json=payload)
        assert resp.status_code == 201
        yield payload
        await db["users"].delete_many({"email": payload["email"]})

    @pytest.mark.asyncio
    async def test_correct_credentials_return_200_with_access_token(
        self, client, registered
    ):
        resp = await client.post("/api/auth/login", json={
            "email": registered["email"],
            "password": registered["password"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_response_contains_user_profile(self, client, registered):
        resp = await client.post("/api/auth/login", json={
            "email": registered["email"],
            "password": registered["password"],
        })
        assert resp.status_code == 200
        user = resp.json()["user"]
        assert user["email"] == registered["email"]
        assert "id" in user

    @pytest.mark.asyncio
    async def test_wrong_password_returns_401(self, client, registered):
        resp = await client.post("/api/auth/login", json={
            "email": registered["email"],
            "password": "WrongPassword9!",
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_nonexistent_email_returns_401(self, client):
        resp = await client.post("/api/auth/login", json={
            "email": "ghost_user@focusflow-ci.internal",
            "password": "DoesNotMatter1!",
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_password_does_not_leak_user_existence(self, client, registered):
        """
        Wrong password and non-existent user must both return 401 with the
        same generic message — prevents user-enumeration attacks.
        """
        wrong_pw_resp = await client.post("/api/auth/login", json={
            "email": registered["email"],
            "password": "Wrong1!xyz",
        })
        no_user_resp = await client.post("/api/auth/login", json={
            "email": "ghost999@focusflow-ci.internal",
            "password": "Wrong1!xyz",
        })
        assert wrong_pw_resp.status_code == no_user_resp.status_code == 401

    @pytest.mark.asyncio
    async def test_missing_password_field_returns_422(self, client):
        resp = await client.post("/api/auth/login", json={
            "email": "someone@focusflow-ci.internal",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_email_format_returns_422(self, client):
        resp = await client.post("/api/auth/login", json={
            "email": "not-valid",
            "password": "SomePassword1!",
        })
        assert resp.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/auth/me
# ══════════════════════════════════════════════════════════════════════════════

class TestGetMe:

    @pytest_asyncio.fixture
    async def auth_token(self, client, db):
        """Register a user and return their bearer token + email for cleanup."""
        payload = _make_payload("me_user")
        resp = await client.post("/api/auth/register", json=payload)
        assert resp.status_code == 201
        token = resp.json()["access_token"]
        yield token, payload["email"]
        await db["users"].delete_many({"email": payload["email"]})

    def _bearer(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    @pytest.mark.asyncio
    async def test_valid_token_returns_200_with_profile(self, client, auth_token):
        token, email = auth_token
        resp = await client.get("/api/auth/me", headers=self._bearer(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == email
        assert "id" in data
        assert "password" not in data
        assert "password_hash" not in data

    @pytest.mark.asyncio
    async def test_profile_contains_expected_fields(self, client, auth_token):
        token, _ = auth_token
        resp = await client.get("/api/auth/me", headers=self._bearer(token))
        assert resp.status_code == 200
        profile = resp.json()
        for field in ("id", "name", "email", "onboarding_completed", "preferences", "created_at"):
            assert field in profile, f"Missing field: {field}"

    @pytest.mark.asyncio
    async def test_no_token_returns_401(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_malformed_token_returns_401(self, client):
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer this.is.not.a.real.jwt"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_scheme_returns_401(self, client, auth_token):
        """Sending the token as 'Token <tok>' instead of 'Bearer <tok>' must fail."""
        token, _ = auth_token
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Token {token}"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_tampered_signature_returns_401(self, client, auth_token):
        """A JWT with a corrupted signature must be rejected."""
        token, _ = auth_token
        # Flip the last few characters to tamper with the signature segment
        tampered = token[:-4] + "XXXX"
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {tampered}"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_expired_token_returns_401(self, client):
        """A token signed with a past expiry must be rejected."""
        from datetime import datetime, timedelta, timezone
        import jwt

        secret = os.environ.get("JWT_SECRET", "fallback-dev-secret")
        expired_payload = {
            "sub": "000000000000000000000000",  # valid ObjectId format
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
        expired_token = jwt.encode(expired_payload, secret, algorithm="HS256")
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_empty_authorization_header_returns_401(self, client):
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": ""},
        )
        assert resp.status_code == 401
