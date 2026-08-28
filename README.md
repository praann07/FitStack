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
  noise), a weight calendar, measurements, correlated against training
  volume over time
- **One dashboard** — today's macros, this week's volume, recent PRs, active
  plateaus, and the adaptive suggestion, all in one summary

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, Recharts, Zustand |
| Backend | None — the frontend talks to Supabase directly via `supabase-js` |
| Database | PostgreSQL (Supabase), authorized entirely by Row Level Security |
| Auth | Supabase Auth, email + password, with a manual approval gate (`profiles.approved`) |
| Deployment | Vercel (frontend only), GitHub Actions CI (lint + build) |

See [`fitstack-system-design.md`](fitstack-system-design.md) for the original
design doc — still accurate for the business logic (§7); superseded for
architecture/schema/auth/API (see the note at the top of that file).

## Project layout

```
frontend/              React SPA — see frontend/README.md
  src/lib/              Pure business logic (adaptive TDEE, PR/plateau math)
  src/services/         Supabase queries + read-model builders (derive.ts)
supabase/migrations/   Schema, RLS policies, and library seed, applied to the live project
DEPLOY.md              Deploy runbook (Vercel + Supabase)
```

## Quick start

```bash
cd frontend
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

Open `http://localhost:5173`, register with an email + password (name, body,
and training goal are collected on the same screen), and go. New accounts
start with `profiles.approved = false`, so they land on a "pending approval"
screen until that flag is flipped in the Supabase dashboard — see
[`DEPLOY.md`](DEPLOY.md).

## Deploying

See [`DEPLOY.md`](DEPLOY.md).

## Status

Schema, RLS policies, auth (email + password with the approval gate), and the
full service layer are built and wired to a live Supabase project (see
`supabase/migrations/` for the schema/RLS, and `frontend/src/services/` for
the client). A full end-to-end run (register → approve → log a workout → log
food → check the dashboard) has been verified against live Supabase in a
browser. The frontend passes lint, typecheck, and a production build. Not yet
done: frontend unit test coverage and an actual live deployment to Vercel.
