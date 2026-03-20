# Agile Rubrics + Issues (MongoDB Connection)

## Rubrics / Acceptance Criteria
1. Backend Mongo connection validates liveness by running a `ping` during app startup (`backend/app/db.py`).
2. The Mongo database used by the app matches the database specified in `MONGODB_URL` (or `MONGODB_DB` fallback).
3. A dedicated test exists to verify MongoDB connectivity in CI: `tests/backend/test_mongo_connection.py`.
4. Existing API unit tests remain deterministic by mocking DB lifecycle during router-level tests (`tests/backend/test_api.py`).
5. GitHub Actions runs the Mongo connectivity test as part of `pytest tests/`.

## Issues / Backlog Items
1. US-01: Implement MongoDB connection health check
   - Acceptance: startup `ping` works; failures raise a clear error; DB selection respects `MONGODB_URL`.
2. US-02: Add CI coverage for MongoDB connectivity
   - Acceptance: CI Mongo service + `MONGODB_URL` allow the ping test to pass, and an invalid-url test fails fast.

