"""
Onboarding flow tests
  PATCH /api/auth/me/onboarding
"""

import pytest

from tests.backend.authentication.conftest import auth_headers

_VALID_PREFS = {
    "pomodoro_duration": 30,
    "short_break": 7,
    "long_break": 20,
    "timezone": "America/New_York",
    "theme": "dark",
}


@pytest.mark.asyncio
async def test_new_user_has_onboarding_incomplete(client, registered_user):
    resp = await client.get("/api/auth/me", headers=auth_headers(registered_user["token"]))
    assert resp.json()["onboarding_completed"] is False


@pytest.mark.asyncio
async def test_complete_onboarding_sets_flag_true(client, registered_user):
    resp = await client.patch(
        "/api/auth/me/onboarding",
        json=_VALID_PREFS,
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["onboarding_completed"] is True


@pytest.mark.asyncio
async def test_complete_onboarding_stores_preferences(client, registered_user):
    resp = await client.patch(
        "/api/auth/me/onboarding",
        json=_VALID_PREFS,
        headers=auth_headers(registered_user["token"]),
    )
    prefs = resp.json()["preferences"]
    assert prefs["pomodoro_duration"] == 30
    assert prefs["short_break"] == 7
    assert prefs["long_break"] == 20
    assert prefs["timezone"] == "America/New_York"
    assert prefs["theme"] == "dark"


@pytest.mark.asyncio
async def test_complete_onboarding_is_idempotent(client, registered_user):
    await client.patch(
        "/api/auth/me/onboarding",
        json=_VALID_PREFS,
        headers=auth_headers(registered_user["token"]),
    )
    # Second call with different prefs — should succeed and update
    updated_prefs = {**_VALID_PREFS, "pomodoro_duration": 45, "theme": "light"}
    resp = await client.patch(
        "/api/auth/me/onboarding",
        json=updated_prefs,
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["preferences"]["pomodoro_duration"] == 45


@pytest.mark.asyncio
async def test_complete_onboarding_persists_on_get_me(client, registered_user):
    await client.patch(
        "/api/auth/me/onboarding",
        json=_VALID_PREFS,
        headers=auth_headers(registered_user["token"]),
    )
    resp = await client.get("/api/auth/me", headers=auth_headers(registered_user["token"]))
    assert resp.json()["onboarding_completed"] is True
    assert resp.json()["preferences"]["theme"] == "dark"


@pytest.mark.asyncio
async def test_onboarding_invalid_theme_returns_422(client, registered_user):
    bad_prefs = {**_VALID_PREFS, "theme": "purple"}
    resp = await client.patch(
        "/api/auth/me/onboarding",
        json=bad_prefs,
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_onboarding_pomodoro_too_short_returns_422(client, registered_user):
    bad_prefs = {**_VALID_PREFS, "pomodoro_duration": 2}
    resp = await client.patch(
        "/api/auth/me/onboarding",
        json=bad_prefs,
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_onboarding_without_token_returns_401(client):
    resp = await client.patch("/api/auth/me/onboarding", json=_VALID_PREFS)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_onboarding_uses_defaults_when_no_prefs_sent(client, registered_user):
    """PATCH with default-only body should still complete onboarding."""
    resp = await client.patch(
        "/api/auth/me/onboarding",
        json={},   # all fields have defaults in OnboardingPreferences
        headers=auth_headers(registered_user["token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["onboarding_completed"] is True
    assert resp.json()["preferences"]["pomodoro_duration"] == 25
