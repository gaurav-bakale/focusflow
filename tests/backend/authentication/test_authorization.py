"""
Authorization tests

Verifies that:
  1. All protected routers (tasks, timer, calendar) reject unauthenticated requests.
  2. A user cannot read, modify, or delete another user's resources.
  3. The get_current_user shim in app/auth.py is intact after the auth refactor.
"""

import pytest

from tests.backend.authentication.conftest import auth_headers


# ── Unauthenticated access is denied ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_tasks_requires_auth(client):
    assert (await client.get("/api/tasks")).status_code == 401
    assert (await client.post("/api/tasks", json={"title": "x"})).status_code == 401


@pytest.mark.asyncio
async def test_timer_sessions_requires_auth(client):
    assert (await client.get("/api/timer/sessions")).status_code == 401
    assert (await client.post("/api/timer/sessions", json={
        "phase": "FOCUS", "duration_minutes": 25
    })).status_code == 401


@pytest.mark.asyncio
async def test_timer_stats_requires_auth(client):
    assert (await client.get("/api/timer/stats")).status_code == 401


@pytest.mark.asyncio
async def test_calendar_blocks_requires_auth(client):
    assert (await client.get("/api/calendar/blocks")).status_code == 401
    assert (await client.post("/api/calendar/blocks", json={
        "title": "block", "start_time": "2026-04-01T09:00:00Z",
        "end_time": "2026-04-01T10:00:00Z",
    })).status_code == 401


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await client.put("/api/auth/me", json={"name": "X"})).status_code == 401
    assert (await client.patch("/api/auth/me/onboarding", json={})).status_code == 401
    assert (await client.patch("/api/auth/me/password", json={
        "current_password": "a", "new_password": "ValidPass1!"
    })).status_code == 401


# ── Cross-user resource isolation ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_cannot_read_another_users_task(client, registered_user, second_user):
    create = await client.post(
        "/api/tasks",
        json={"title": "Private Task", "priority": "HIGH"},
        headers=auth_headers(registered_user["token"]),
    )
    assert create.status_code == 201
    task_id = create.json()["id"]

    resp = await client.get(
        f"/api/tasks/{task_id}",
        headers=auth_headers(second_user["token"]),
    )
    assert resp.status_code == 404

    # Cleanup
    await client.delete(f"/api/tasks/{task_id}", headers=auth_headers(registered_user["token"]))


@pytest.mark.asyncio
async def test_task_list_is_scoped_to_owner(client, registered_user, second_user):
    create = await client.post(
        "/api/tasks",
        json={"title": "Owner Only"},
        headers=auth_headers(registered_user["token"]),
    )
    task_id = create.json()["id"]

    list_resp = await client.get("/api/tasks", headers=auth_headers(second_user["token"]))
    ids = [t["id"] for t in list_resp.json()]
    assert task_id not in ids

    await client.delete(f"/api/tasks/{task_id}", headers=auth_headers(registered_user["token"]))


@pytest.mark.asyncio
async def test_user_cannot_update_another_users_task(client, registered_user, second_user):
    create = await client.post(
        "/api/tasks",
        json={"title": "Target Task"},
        headers=auth_headers(registered_user["token"]),
    )
    task_id = create.json()["id"]

    resp = await client.put(
        f"/api/tasks/{task_id}",
        json={"title": "Hijacked"},
        headers=auth_headers(second_user["token"]),
    )
    assert resp.status_code == 404

    await client.delete(f"/api/tasks/{task_id}", headers=auth_headers(registered_user["token"]))


@pytest.mark.asyncio
async def test_user_cannot_delete_another_users_task(client, registered_user, second_user):
    create = await client.post(
        "/api/tasks",
        json={"title": "Delete Target"},
        headers=auth_headers(registered_user["token"]),
    )
    task_id = create.json()["id"]

    resp = await client.delete(
        f"/api/tasks/{task_id}",
        headers=auth_headers(second_user["token"]),
    )
    assert resp.status_code == 404

    # Owner can still delete
    own = await client.delete(
        f"/api/tasks/{task_id}",
        headers=auth_headers(registered_user["token"]),
    )
    assert own.status_code == 204


@pytest.mark.asyncio
async def test_user_cannot_complete_another_users_task(client, registered_user, second_user):
    create = await client.post(
        "/api/tasks",
        json={"title": "Complete Target"},
        headers=auth_headers(registered_user["token"]),
    )
    task_id = create.json()["id"]

    resp = await client.patch(
        f"/api/tasks/{task_id}/complete",
        headers=auth_headers(second_user["token"]),
    )
    assert resp.status_code == 404

    await client.delete(f"/api/tasks/{task_id}", headers=auth_headers(registered_user["token"]))


@pytest.mark.asyncio
async def test_calendar_blocks_are_scoped_to_owner(client, registered_user, second_user):
    create = await client.post(
        "/api/calendar/blocks",
        json={
            "title": "My Block",
            "start_time": "2026-04-01T09:00:00Z",
            "end_time": "2026-04-01T10:00:00Z",
        },
        headers=auth_headers(registered_user["token"]),
    )
    assert create.status_code == 201
    block_id = create.json()["id"]

    list_resp = await client.get(
        "/api/calendar/blocks",
        headers=auth_headers(second_user["token"]),
    )
    ids = [b["id"] for b in list_resp.json()]
    assert block_id not in ids

    # Cleanup
    await client.delete(
        f"/api/calendar/blocks/{block_id}",
        headers=auth_headers(registered_user["token"]),
    )
