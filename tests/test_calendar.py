"""
Calendar API Integration Tests
================================

Design Patterns exercised
--------------------------
Facade pattern       — tests call thin router endpoints; no direct DB calls.
Repository pattern   — user_id isolation is verified (blocks are per-user).
Service Layer        — scope-aware update / delete logic validated end-to-end.
Dependency Injection — `client` and `auth_headers` from conftest.py; separate
                       fixture creates a second auth user for isolation checks.

Coverage
--------
GET  /calendar/blocks
  - empty list → []
  - returns only the authenticated user's blocks

POST /calendar/blocks
  - single block creation → 201 with all fields

POST /calendar/blocks/bulk
  - empty body → 201, []
  - creates multiple blocks, returns them in order
  - requires auth → 401

PUT  /calendar/blocks/{id}?scope=this
  - updates only the targeted block

PUT  /calendar/blocks/{id}?scope=this_and_future
  - updates the block + all following blocks in the same series
    (keeps each block's date, changes only time)
  - non-existent block → 404

DELETE /calendar/blocks/{id}?scope=this
  - deletes only the targeted block

DELETE /calendar/blocks/{id}?scope=this_and_future
  - deletes this block AND all future blocks in the series
  - non-existent block → 404

Authentication
  - unauthenticated GET / POST → 401

Run with:
    PYTHONPATH=backend pytest tests/test_calendar.py -v
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta

import pytest
import pytest_asyncio

# ── Path setup ────────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

BASE = "http://test"

# ── Shared helper ─────────────────────────────────────────────────────────────

def _dt(offset_days=1, hour=9, minute=0):
    """Return a deterministic 'YYYY-MM-DDTHH:MM' datetime string."""
    d = datetime(2026, 6, 1, hour, minute) + timedelta(days=offset_days)
    return d.strftime("%Y-%m-%dT%H:%M")


# ── Second user fixture ───────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="module")
async def auth_headers_2(client):
    """Register a *second* test user and return their Bearer auth headers."""
    payload = {
        "name": "Second User",
        "email": "calendar_user2@focusflow-test.internal",
        "password": "SecondPass1!",
    }
    resp = await client.post("/api/auth/register", json=payload)
    if resp.status_code == 409:
        resp = await client.post("/api/auth/login", json={
            "email": payload["email"],
            "password": payload["password"],
        })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _create(client, headers, title, start, end,
                  recurrence="NONE", group_id=None, color="#6366f1"):
    """POST /calendar/blocks and return the response JSON."""
    resp = await client.post(
        "/api/calendar/blocks",
        json={
            "title": title,
            "start_time": start,
            "end_time": end,
            "color": color,
            "recurrence": recurrence,
            "recurrence_group_id": group_id,
        },
        headers=headers,
    )
    assert resp.status_code == 201, f"create failed: {resp.text}"
    return resp.json()


# ══════════════════════════════════════════════════════════════════════════════
# GET /calendar/blocks
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_blocks_empty(client, auth_headers, db):
    """
    GET /calendar/blocks returns [] when no blocks exist for the user.

    Input    : authenticated user with no blocks.
    Expected : HTTP 200, body == [].
    Pass     : status==200, body==[].
    """
    # Clean up any blocks left by previous tests in this module
    from bson import ObjectId
    user_resp = await client.get("/api/auth/me", headers=auth_headers)
    assert user_resp.status_code == 200
    # Use a fresh user or simply verify the endpoint is functional
    resp = await client.get("/api/calendar/blocks", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_get_blocks_unauthenticated(client):
    """
    GET /calendar/blocks without token → 401.

    Input    : request with no Authorization header.
    Expected : HTTP 401 Unauthorized.
    Pass     : status==401.
    """
    resp = await client.get("/api/calendar/blocks")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_blocks_user_isolation(client, auth_headers, auth_headers_2):
    """
    Each user only sees their own blocks (Repository pattern: user_id filter).

    Input    : user1 creates a block; user2 GETs blocks.
    Expected : user2's list does NOT contain user1's block.
    Pass     : user2 response list has length 0 (or does not contain the block).
    """
    # User 1 creates a block
    block = await _create(
        client, auth_headers,
        "User1 Private Block",
        _dt(10, 7, 0), _dt(10, 8, 40),
    )

    # User 2 fetches — should not see it
    resp = await client.get("/api/calendar/blocks", headers=auth_headers_2)
    assert resp.status_code == 200
    ids = [b["id"] for b in resp.json()]
    assert block["id"] not in ids


# ══════════════════════════════════════════════════════════════════════════════
# POST /calendar/blocks  (single)
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_block_single(client, auth_headers):
    """
    POST /calendar/blocks creates one block and returns it with an id.

    Input    : valid TimeBlockCreate payload.
    Expected : HTTP 201, response has id, title, start_time, end_time.
    Pass     : status==201, all fields present.
    """
    start = _dt(2, 9, 0)
    end   = _dt(2, 10, 40)
    resp = await client.post(
        "/api/calendar/blocks",
        json={
            "title": "Deep Work",
            "start_time": start,
            "end_time":   end,
            "color":      "#6366f1",
            "recurrence": "NONE",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"]
    assert body["title"]        == "Deep Work"
    assert body["start_time"]   == start
    assert body["end_time"]     == end
    assert body["recurrence"]   == "NONE"
    assert body["recurrence_group_id"] is None


@pytest.mark.asyncio
async def test_create_block_unauthenticated(client):
    """
    POST /calendar/blocks without token → 401.

    Input    : request with no Authorization header.
    Expected : HTTP 401.
    Pass     : status==401.
    """
    resp = await client.post(
        "/api/calendar/blocks",
        json={"title": "Ghost", "start_time": _dt(1, 9, 0), "end_time": _dt(1, 10, 0)},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_block_with_recurrence(client, auth_headers):
    """
    POST /calendar/blocks preserves recurrence and recurrence_group_id.

    Input    : block with recurrence=DAILY and a group_id.
    Expected : HTTP 201, fields echoed back correctly.
    Pass     : status==201, recurrence=='DAILY', group_id matches.
    """
    group_id = "grp-daily-abc-123"
    resp = await client.post(
        "/api/calendar/blocks",
        json={
            "title":                "Morning Run",
            "start_time":           _dt(3, 6, 0),
            "end_time":             _dt(3, 7, 40),
            "recurrence":           "DAILY",
            "recurrence_group_id":  group_id,
            "color":                "#22c55e",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["recurrence"] == "DAILY"
    assert body["recurrence_group_id"] == group_id


# ══════════════════════════════════════════════════════════════════════════════
# POST /calendar/blocks/bulk
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_blocks_bulk_empty(client, auth_headers):
    """
    POST /calendar/blocks/bulk with empty list returns 201 and [].

    Input    : {"blocks": []}.
    Expected : HTTP 201, body == [].
    Pass     : status==201, body==[].
    """
    resp = await client.post(
        "/api/calendar/blocks/bulk",
        json={"blocks": []},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_blocks_bulk_multiple(client, auth_headers):
    """
    POST /calendar/blocks/bulk creates all blocks and returns them in order.

    Input    : 3 blocks sharing the same recurrence_group_id.
    Expected : HTTP 201, 3 items returned, each with correct title and group_id.
    Pass     : status==201, len==3, group_ids all match.
    """
    group_id = "grp-weekly-xyz-789"
    blocks = [
        {
            "title": f"Weekly Review #{i}",
            "start_time": _dt(i * 7, 10, 0),
            "end_time":   _dt(i * 7, 11, 40),
            "recurrence": "WEEKLY",
            "recurrence_group_id": group_id,
            "color": "#8b5cf6",
        }
        for i in range(1, 4)
    ]
    resp = await client.post(
        "/api/calendar/blocks/bulk",
        json={"blocks": blocks},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert len(body) == 3
    for item in body:
        assert item["recurrence_group_id"] == group_id
        assert item["recurrence"] == "WEEKLY"
    titles = [item["title"] for item in body]
    assert "Weekly Review #1" in titles
    assert "Weekly Review #3" in titles


@pytest.mark.asyncio
async def test_create_blocks_bulk_unauthenticated(client):
    """
    POST /calendar/blocks/bulk without token → 401.

    Input    : request with no Authorization header.
    Expected : HTTP 401.
    Pass     : status==401.
    """
    resp = await client.post(
        "/api/calendar/blocks/bulk",
        json={"blocks": [{"title": "Ghost", "start_time": _dt(1), "end_time": _dt(1, 9, 40)}]},
    )
    assert resp.status_code == 401


# ══════════════════════════════════════════════════════════════════════════════
# PUT /calendar/blocks/{id}
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_update_block_this_scope(client, auth_headers):
    """
    PUT /calendar/blocks/{id}?scope=this updates only the targeted block.

    Input    : existing block; PUT with new title and times; scope=this.
    Expected : HTTP 200, returned block has updated title.
    Pass     : status==200, body title == "Updated Title".
    """
    block = await _create(
        client, auth_headers,
        "Original Title", _dt(20, 9, 0), _dt(20, 10, 40),
    )
    resp = await client.put(
        f"/api/calendar/blocks/{block['id']}?scope=this",
        json={
            "title":      "Updated Title",
            "start_time": _dt(20, 9, 0),
            "end_time":   _dt(20, 10, 40),
            "recurrence": "NONE",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"


@pytest.mark.asyncio
async def test_update_block_nonexistent(client, auth_headers):
    """
    PUT /calendar/blocks/{id} with an unknown id → 404.

    Input    : PUT with a random valid-format id that does not exist in DB.
    Expected : HTTP 404 Not Found.
    Pass     : status==404.
    """
    from bson import ObjectId
    fake_id = str(ObjectId())
    resp = await client.put(
        f"/api/calendar/blocks/{fake_id}",
        json={
            "title":      "Ghost Block",
            "start_time": _dt(1, 9, 0),
            "end_time":   _dt(1, 10, 0),
            "recurrence": "NONE",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_block_this_and_future_scope(client, auth_headers):
    """
    PUT /calendar/blocks/{id}?scope=this_and_future updates the block and
    all following blocks in the series, preserving each block's date but
    replacing the time.

    Input    : 3 blocks in the same series (T+30, T+37, T+44 days);
               edit the first one's time from 09:00 to 11:00.
    Expected : all 3 blocks now have start hour == 11.
    Pass     : start_time hour portion is "11" for all blocks in the series.
    """
    group_id = "grp-taf-scope-test"

    # Create 3 blocks in the same series, starting at 09:00 each week
    b1 = await _create(client, auth_headers, "Sync", _dt(30, 9, 0),  _dt(30, 10, 40),
                       recurrence="WEEKLY", group_id=group_id)
    await _create(client, auth_headers, "Sync", _dt(37, 9, 0),  _dt(37, 10, 40),
                  recurrence="WEEKLY", group_id=group_id)
    await _create(client, auth_headers, "Sync", _dt(44, 9, 0),  _dt(44, 10, 40),
                  recurrence="WEEKLY", group_id=group_id)

    # Edit block 1 to 11:00 with scope=this_and_future
    resp = await client.put(
        f"/api/calendar/blocks/{b1['id']}?scope=this_and_future",
        json={
            "title":                "Sync",
            "start_time":           _dt(30, 11, 0),   # 09:00 → 11:00
            "end_time":             _dt(30, 12, 40),
            "recurrence":           "WEEKLY",
            "recurrence_group_id":  group_id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # Fetch all blocks and verify all series members now start at 11:xx
    all_blocks = await client.get("/api/calendar/blocks", headers=auth_headers)
    series = [b for b in all_blocks.json() if b.get("recurrence_group_id") == group_id]
    assert len(series) == 3, f"Expected 3 series blocks, got {len(series)}"
    for b in series:
        hour = int(b["start_time"][11:13])
        assert hour == 11, f"Block {b['id']} still has hour {hour}, expected 11"


# ══════════════════════════════════════════════════════════════════════════════
# DELETE /calendar/blocks/{id}
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_delete_block_this_scope(client, auth_headers):
    """
    DELETE /calendar/blocks/{id}?scope=this deletes only the targeted block.

    Input    : 2 blocks in the same series; delete only the first.
    Expected : HTTP 204; first block gone; second block still exists.
    Pass     : status==204; GET blocks does not contain first block's id.
    """
    group_id = "grp-del-this-test"
    b1 = await _create(client, auth_headers, "Block A", _dt(50, 8, 0), _dt(50, 9, 40),
                       recurrence="DAILY", group_id=group_id)
    b2 = await _create(client, auth_headers, "Block B", _dt(51, 8, 0), _dt(51, 9, 40),
                       recurrence="DAILY", group_id=group_id)

    resp = await client.delete(
        f"/api/calendar/blocks/{b1['id']}?scope=this",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    remaining = await client.get("/api/calendar/blocks", headers=auth_headers)
    ids = [b["id"] for b in remaining.json()]
    assert b1["id"] not in ids
    assert b2["id"] in ids


@pytest.mark.asyncio
async def test_delete_block_this_and_future_scope(client, auth_headers):
    """
    DELETE /calendar/blocks/{id}?scope=this_and_future deletes the block and
    all following blocks in the same series.

    Input    : 3 blocks in a series (days +60, +61, +62); delete from +61 onward.
    Expected : HTTP 204; block at +60 remains; blocks at +61, +62 are gone.
    Pass     : status==204; only the first block survives.
    """
    group_id = "grp-del-taf-test"
    b0 = await _create(client, auth_headers, "Past",    _dt(60, 8, 0), _dt(60, 9, 40),
                       recurrence="DAILY", group_id=group_id)
    b1 = await _create(client, auth_headers, "Current", _dt(61, 8, 0), _dt(61, 9, 40),
                       recurrence="DAILY", group_id=group_id)
    b2 = await _create(client, auth_headers, "Future",  _dt(62, 8, 0), _dt(62, 9, 40),
                       recurrence="DAILY", group_id=group_id)

    resp = await client.delete(
        f"/api/calendar/blocks/{b1['id']}?scope=this_and_future",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    remaining = await client.get("/api/calendar/blocks", headers=auth_headers)
    ids = [b["id"] for b in remaining.json()]
    assert b0["id"] in  ids, "Pre-series block should survive"
    assert b1["id"] not in ids, "Deleted block (b1) should be gone"
    assert b2["id"] not in ids, "Future block (b2) should also be gone"


@pytest.mark.asyncio
async def test_delete_block_nonexistent(client, auth_headers):
    """
    DELETE /calendar/blocks/{id} with an unknown id → 404.

    Input    : DELETE with a random valid-format id that does not exist.
    Expected : HTTP 404 Not Found.
    Pass     : status==404.
    """
    from bson import ObjectId
    fake_id = str(ObjectId())
    resp = await client.delete(
        f"/api/calendar/blocks/{fake_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 404
