# FitStack — Backend

FastAPI + SQLAlchemy 2.0 + Alembic REST API for the FitStack tracker, backing
the SPA in `../frontend/`. See `../fitstack-system-design.md` for the full
design (schema, business logic, API surface).

## Running it

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # fill in DATABASE_URL (Neon or any Postgres) and JWT_SECRET
alembic upgrade head
python seed.py                # exercise + food library
uvicorn app.main:app --reload # http://localhost:8000, docs at /docs
```

No Docker or local Postgres install needed — point `DATABASE_URL` at any
hosted Postgres (Neon's free tier works well) and run directly.

## Testing

```bash
pip install -r requirements-dev.txt
pytest -v
```

Tests need `TEST_DATABASE_URL` set to a **throwaway** Postgres database — the
suite creates the full schema there and each test rolls back its own writes,
but don't point it at your real dev/prod database. The easiest option is a
second database on the same free Neon project:

```sql
-- run once, via psql or Neon's SQL editor, against your existing connection
CREATE DATABASE fitstack_test;
```

Then set `TEST_DATABASE_URL` in `.env` to that database's connection string
(same host/credentials as `DATABASE_URL`, different database name).

- `tests/unit/` — pure-function tests for the adaptive engine (TDEE, macro
  re-targeting, plateau/PR math), no DB required.
- `tests/integration/` — one file per router, exercised through FastAPI's
  `TestClient` against the real schema.

CI (`.github/workflows/ci.yml`) runs the same suite against a disposable
`postgres:16` service container, so it doesn't depend on `TEST_DATABASE_URL`
or network access to Neon.

## Rate limiting

`/auth/register`, `/auth/login`, and `/auth/refresh` are limited to 5
requests/minute per client IP (in-memory — fine for a single instance; move to
a Redis backend if you ever run more than one).

## Deploying

See `../DEPLOY.md`.
