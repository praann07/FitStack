# FitStack — Unified Training, Nutrition & Progress Tracker
## System Design Document

---

## 1. Problem Statement

Serious lifters currently juggle 2-3 separate apps: one for workout logging (Hevy/Strong), one for nutrition/macros (MacroFactor/MyFitnessPal), one for progress tracking (weight/measurements/photos). None of them talk to each other — your macro targets don't adjust based on how much you actually lifted this week, and your progress trend is disconnected from what's driving it.

**Target users:** Intermediate-to-serious lifters (bulking/cutting, tracking macros, following a program) who are done manually cross-referencing 3 apps and want one unified, intelligent dashboard.

**Core value:** One login, one data model. Nutrition targets adapt to actual weight-trend data (not static formulas). Training and body-composition data live in the same place, so trends are visible across both.

---

## 2. Scope (MVP — 3 unified modules)

1. **Workout Logging** — exercise library, fast set/rep/RPE logging, rest timer, PR tracking, volume-per-muscle-group tracking
2. **Adaptive Nutrition** — food/macro logging, **adaptive TDEE estimation** (from weight-trend + intake, not a static Mifflin-St Jeor formula), dynamic macro targets
3. **Progress Tracking** — body weight trend (smoothed, not raw noisy daily entries), measurements, optional progress photos, correlated against training volume over time

**AI/ML as supporting layer (not the whole product):**
- Adaptive TDEE via exponential smoothing / linear regression on weight-vs-intake data
- Plateau detection on lift progression (trend analysis on working weights/volume)
- Macro-adjustment suggestions when weight trend deviates from goal rate

---

## 3. Architecture

```
+----------------------+         +-----------------------+        +------------------+
|  React (Vite) SPA     |  HTTPS  |   FastAPI Backend       |        |   PostgreSQL       |
|  TS + Tailwind         |<------->|   JWT auth, REST API     |<------>|   (relational +     |
|  Recharts for trends   |         |   SQLAlchemy + Alembic  |        |   time-series data) |
+----------------------+         +-----------+-----------+        +------------------+
                                              |
                                +-------------+-------------+
                                |   Adaptive Engine Module     |
                                |  - TDEE estimator (regression)|
                                |  - Plateau detector           |
                                |  - Macro re-target logic       |
                                +----------------------------+

Deployment: Frontend -> Vercel (auto-deploy from GitHub) | Backend -> Railway or Render (auto-deploy from GitHub, no Dockerfile needed — Nixpacks/buildpacks detect FastAPI automatically) | DB -> Railway Postgres or Supabase (hosted, no local install)
Local dev: run FastAPI directly via `uvicorn main:app --reload`, connect to the hosted Postgres instance — no Docker, no local DB install required
Monitoring: Sentry + structured logging
```

---

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind + Recharts | Fast to build, clean charts for trends |
| Backend | FastAPI (Python) | Async, auto-docs, Pydantic validation, easy stats/ML integration |
| ORM | SQLAlchemy 2.0 + Alembic | Type-safe queries, migrations |
| DB | PostgreSQL 15 | Relational integrity, good for structured logs + trend queries |
| Auth | JWT (access + refresh rotation), bcrypt | Standard, stateless, secure |
| Adaptive logic | NumPy/SciPy (simple regression/EMA — no heavy ML needed) | Lightweight, explainable, no GPU/training pipeline required |
| Testing | pytest + httpx (backend), Vitest + RTL (frontend) | Standard |
| Deployment | Docker Compose (local) -> Railway (backend+DB) + Vercel (frontend) | Free tier, quick |

---

## 5. Database Schema

```sql
-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    goal VARCHAR(20) NOT NULL,           -- bulk | cut | maintain
    goal_rate_kg_week NUMERIC(4,2),      -- target weight change rate
    height_cm NUMERIC(5,1),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== WORKOUT MODULE =====

CREATE TABLE exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    muscle_group VARCHAR(50) NOT NULL,     -- chest | back | legs | shoulders | arms | core
    equipment VARCHAR(50),                 -- barbell | dumbbell | machine | bodyweight
    is_custom BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id)   -- NULL for system default library
);

-- Routines (saved templates — Hevy's "routine planner")
CREATE TABLE routines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE routine_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routine_id UUID REFERENCES routines(id) ON DELETE CASCADE,
    exercise_id UUID REFERENCES exercises(id),
    order_index INTEGER NOT NULL,            -- position within the routine
    target_sets INTEGER,
    target_rep_range VARCHAR(20),            -- e.g. "8-12"
    target_rpe NUMERIC(3,1),
    rest_seconds INTEGER DEFAULT 90,         -- feeds the automatic rest timer
    notes TEXT                               -- per-exercise notes/cues
);
CREATE INDEX idx_routine_exercises_routine ON routine_exercises(routine_id);

CREATE TABLE workout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    routine_id UUID REFERENCES routines(id),  -- NULL if freestyle (not started from a routine)
    session_date DATE NOT NULL,
    notes TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

CREATE TABLE workout_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id UUID REFERENCES exercises(id),
    set_number INTEGER NOT NULL,
    weight_kg NUMERIC(6,2),
    reps INTEGER,
    rpe NUMERIC(3,1),                       -- rate of perceived exertion, 1-10
    set_type VARCHAR(10) DEFAULT 'normal',  -- warmup | normal | drop | failure
    notes TEXT,                             -- per-set exercise notes (Hevy has this too)
    is_pr BOOLEAN DEFAULT false              -- computed on insert
);
CREATE INDEX idx_sets_session ON workout_sets(session_id);
CREATE INDEX idx_sessions_user_date ON workout_sessions(user_id, session_date DESC);

-- ===== NUTRITION MODULE =====

CREATE TABLE foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    calories_per_100g NUMERIC(6,2),
    protein_per_100g NUMERIC(6,2),
    carbs_per_100g NUMERIC(6,2),
    fat_per_100g NUMERIC(6,2),
    is_custom BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id)
);

CREATE TABLE food_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    food_id UUID REFERENCES foods(id),
    log_date DATE NOT NULL,
    quantity_g NUMERIC(7,2) NOT NULL,
    meal_type VARCHAR(20)                    -- breakfast | lunch | dinner | snack
);
CREATE INDEX idx_food_logs_user_date ON food_logs(user_id, log_date DESC);

CREATE TABLE nutrition_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    effective_date DATE NOT NULL,
    calories INTEGER NOT NULL,
    protein_g INTEGER NOT NULL,
    carbs_g INTEGER NOT NULL,
    fat_g INTEGER NOT NULL,
    source VARCHAR(20) DEFAULT 'adaptive'    -- adaptive | manual
);

CREATE TABLE tdee_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    estimate_date DATE NOT NULL,
    estimated_tdee INTEGER NOT NULL,
    weight_trend_kg NUMERIC(5,2),            -- smoothed weight used in calc
    confidence VARCHAR(10)                    -- low | medium | high (based on data volume)
);

-- ===== PROGRESS MODULE =====

CREATE TABLE body_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    weight_kg NUMERIC(5,2),
    waist_cm NUMERIC(5,1),
    chest_cm NUMERIC(5,1),
    arm_cm NUMERIC(5,1),
    photo_url TEXT,
    UNIQUE(user_id, log_date)
);
CREATE INDEX idx_metrics_user_date ON body_metrics(user_id, log_date DESC);
```

---

## 6. Auth Flow

Same pattern as any production app:
1. `POST /auth/register` -> bcrypt-hash password, issue access (15 min) + refresh (7 day, httpOnly cookie, hashed in DB) tokens
2. `POST /auth/login` -> verify, issue tokens
3. `POST /auth/refresh` -> rotate refresh token, issue new access token
4. `POST /auth/logout` -> revoke refresh token
5. Rate limit auth endpoints (5/min/IP)

---

## 7. Core Business Logic (the "adaptive" part)

**Adaptive TDEE estimation** (this is your technical centerpiece — do this well):
- Take last 14-21 days of `body_metrics.weight_kg` + `food_logs` calorie totals
- Smooth raw daily weight with exponential moving average (EMA) to remove water-weight noise
- Compute actual weight change rate over the window
- Back-calculate TDEE: `TDEE = avg_daily_calories_in - (weight_change_kg * 7700 / days)` (7700 kcal ≈ 1kg body mass, standard approximation)
- Store as new `tdee_estimates` row; confidence = `low` if <7 days of data, `medium` if 7-14, `high` if 14+
- Recompute weekly (not daily — avoid noisy target-chasing)

**Adaptive macro re-targeting:**
- Compare actual weight-trend rate to `users.goal_rate_kg_week`
- If actual rate deviates >20% from goal for 2 consecutive weeks -> suggest calorie adjustment (±100-150 kcal), keep protein fixed (based on bodyweight), adjust carbs/fat
- User can accept suggestion (creates new `nutrition_targets` row) or dismiss it

**Plateau detection (workout side):**
- For each exercise, track best working set (weight × reps, i.e., estimated 1RM via Epley formula) over time
- If no improvement in estimated 1RM over last N sessions (e.g., 4) for a given exercise -> flag plateau, surface in dashboard

**PR detection:**
- Only `set_type = 'normal'` or `'failure'` sets count toward PRs and volume (warmup/drop sets are excluded — matches how lifters actually think about it)
- On each qualifying set insert, compare against user's historical best for that exercise (weight, reps, or estimated 1RM) -> mark `is_pr = true` if it's a new best

**Volume calculation (per muscle group, feeds the adaptive engine):**
- `volume = SUM(weight_kg * reps)` across qualifying sets, grouped by `exercises.muscle_group`, per week
- This is what the MEV/MAV/MRV landmark comparison and the nutrition-side "training load" overlay both read from

---

## 8. API Design (REST, `/api/v1`)

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

-- Workout
GET    /api/v1/exercises?muscle_group=
POST   /api/v1/exercises                      (custom exercise)
GET    /api/v1/routines                        (saved templates)
POST   /api/v1/routines
PUT    /api/v1/routines/{id}
DELETE /api/v1/routines/{id}
POST   /api/v1/workouts                        (start session, optional routine_id)
POST   /api/v1/workouts/{id}/sets              (log a set)
PATCH  /api/v1/workouts/{id}/sets/{set_id}     (edit a set — weight/reps/rpe/type)
DELETE /api/v1/workouts/{id}/sets/{set_id}
PATCH  /api/v1/workouts/{id}/complete
GET    /api/v1/workouts?from=&to=
GET    /api/v1/workouts/{id}
GET    /api/v1/exercises/{id}/history          (progression chart data)
GET    /api/v1/exercises/{id}/plateau-status
GET    /api/v1/volume/weekly?muscle_group=     (volume-per-muscle-group, feeds adaptive engine)

-- Nutrition
GET    /api/v1/foods?search=
POST   /api/v1/foods                            (custom food)
POST   /api/v1/nutrition/logs                   (log a food entry)
GET    /api/v1/nutrition/logs?date=
GET    /api/v1/nutrition/targets/current
POST   /api/v1/nutrition/targets/recompute       (trigger adaptive recalculation)
GET    /api/v1/nutrition/tdee-history

-- Progress
POST   /api/v1/progress/metrics                 (log weight/measurements)
GET    /api/v1/progress/metrics?from=&to=
GET    /api/v1/progress/trend                   (smoothed weight trend + training volume overlay)

-- Dashboard
GET    /api/v1/dashboard/summary                (today's macros, this week's volume, recent PRs, active plateaus)
```

---

## 9. Frontend Structure (minimal web dashboard)

```
/login, /register
/dashboard              - today's macros, weekly training volume, PR feed, plateau flags
/routines                - list/create/edit saved routine templates
/workout                - start from a routine or freestyle, exercise picker, set logging (weight/reps/RPE, set type), rest timer
/workout/history        - session list, per-exercise progression charts
/nutrition               - log food, view today's macros vs target
/nutrition/targets       - current target + adaptive suggestion banner (accept/dismiss)
/progress                - weight trend chart, measurements form, photo upload (optional)
```

Keep it to these 8 screens. No native app, no extra polish beyond a clean Tailwind layout — the value is in the logic, not visual flair. The rest timer is just a client-side countdown seeded from `routine_exercises.rest_seconds` — no backend logic needed.

---

## 10. Edge Cases

- **Missing data days** — TDEE calc must handle gaps (skip missing days in the regression window, don't treat as zero-calorie days)
- **Weight noise** — never use raw daily weight for TDEE math, always the EMA-smoothed value
- **New user, insufficient history** — TDEE estimate marked `low confidence`, fall back to a standard formula (Mifflin-St Jeor) until 7+ days of data exist
- **Mid-goal changes** — if user switches goal (bulk->cut), reset the adaptive window rather than blending old and new-goal data
- **Duplicate set logging / accidental double-taps** — idempotency check on rapid duplicate submissions within a few seconds
- **PR calculation across rep ranges** — use estimated 1RM (Epley: `weight * (1 + reps/30)`) to compare PRs fairly across different rep counts, not just raw weight
- **Custom exercises/foods** — scoped to the user who created them, not shown to others
- **Deleting a session/set** — must recompute affected PR flags and TDEE window if it falls within the active calculation range
- **Editing a past set** — if the edit changes weight/reps enough to affect PR status, re-run the PR check for that exercise (both to revoke a now-invalid PR and to check if it should newly qualify)
- **Deleting a routine that's mid-use** — sessions already store a snapshot reference (`workout_sessions.routine_id`); don't cascade-delete session history when a routine is deleted, just null the reference
- **Reordering routine exercises** — `order_index` must be resequenced atomically (single transaction) to avoid gaps/collisions

---

## 11. Security Checklist

- bcrypt password hashing, JWT short-lived + refresh rotation
- Pydantic validation on every input
- SQLAlchemy ORM (no raw SQL, no injection risk)
- Rate limiting on auth endpoints
- CORS restricted to frontend origin
- HTTPS enforced in production
- No sensitive data in logs
- Photo uploads (if implemented): size/type validation, stored in object storage (not DB), signed URLs

---

## 12. Testing Strategy

- **Backend:** unit tests for TDEE calculation (known input -> expected output), plateau detection logic, PR/1RM calculation, macro re-target logic; integration tests per API endpoint
- **Frontend:** component tests for set-logging form, macro dashboard rendering, trend chart with mock data
- Focus test effort on the **adaptive engine** — that's the part worth defending in an interview

---

## 13. Roadmap (3-4 weeks)

**Week 1 — Foundation**
- Repo, Docker Compose, DB schema + migrations
- Auth (register/login/refresh) + tests
- Exercise/food seed library

**Week 2 — Workout Module**
- Routines + routine_exercises CRUD APIs
- Session/set logging APIs (with set_type) + PR detection + 1RM calc + weekly volume calc + tests
- Frontend: routines screen, workout logging screens (with rest timer)

**Week 3 — Nutrition + Adaptive Engine**
- Food logging APIs
- TDEE estimator + macro re-targeting logic + tests (this is your core differentiator — give it real time)
- Frontend: nutrition screens + adaptive suggestion banner

**Week 4 — Progress + Polish + Ship**
- Body metrics logging + trend endpoint
- Dashboard aggregation endpoint
- Frontend: progress screen, dashboard summary
- Security pass, integration tests, deploy (Vercel + Railway), seed demo data, README with architecture diagram

---

## 14. Resume Framing

*"Built a unified training/nutrition/progress platform with an adaptive TDEE estimation engine (regression-based, self-correcting from real weight-trend data) and automatic plateau/PR detection — replacing the need for 3 separate fragmented apps. Full JWT auth, tested REST API, deployed production architecture."*
