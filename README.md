# FitStack

A unified training, nutrition, and progress tracker — one login instead of
juggling a workout app, a macro tracker, and a weight log that don't talk to
each other. Nutrition targets adapt to your actual weight-trend data instead
of a static formula, and training and body-composition data live in the same
place so trends are visible across both.

## Features

- **Workout logging** — exercise library, custom exercises, saved routines,
  fast set/rep/RPE logging with a rest timer, automatic PR detection
  (Epley-estimated 1RM), plateau detection, weekly volume per muscle group
- **Adaptive nutrition** — food/macro logging, an adaptive TDEE estimator
  (regression on real weight-trend + intake data, not a fixed formula), and
  macro re-targeting suggestions when your trend drifts from your goal
- **Progress tracking** — smoothed body-weight trend (EMA, not raw daily
  noise), measurements, correlated against training volume over time
- **One dashboard** — today's macros, this week's volume, recent PRs, active
  plateaus, and the adaptive suggestion, all in one summary

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, Recharts, Zustand |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic |
| Database | PostgreSQL (Neon) |
| Auth | JWT access tokens + rotating httpOnly-cookie refresh tokens, bcrypt |
| Testing | pytest (backend: 77 tests, unit + integration) |
| Deployment | Render (API) + Vercel (frontend), GitHub Actions CI |

See [`fitstack-system-design.md`](fitstack-system-design.md) for the full
design doc (schema, business logic, API surface, edge cases).

## Project layout

```
frontend/    React SPA — see frontend/README.md
backend/     FastAPI API — see backend/README.md
DEPLOY.md    Step-by-step deploy runbook (Render + Vercel)
```

## Quick start

```bash
# Backend
cd backend
python -m venv .venv && .venv/Scripts/activate   # .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env        # fill in DATABASE_URL + JWT_SECRET
alembic upgrade head
python seed.py               # exercise + food library
uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`, register an account, and go.

## Testing

```bash
cd backend
pip install -r requirements-dev.txt
pytest -v
```

Needs `TEST_DATABASE_URL` pointed at a throwaway Postgres database — see
[`backend/README.md`](backend/README.md#testing) for setup. CI runs the same
suite against a disposable container, so it doesn't need that variable.

## Deploying

See [`DEPLOY.md`](DEPLOY.md).

## Status

Functionally complete and tested: auth, workout logging, adaptive nutrition,
progress tracking, and the dashboard all work end-to-end against a real
database, backed by 77 backend tests. Not yet done: frontend test coverage,
and an actual live deployment (configs are ready in `DEPLOY.md`, but nothing
is hosted yet).
