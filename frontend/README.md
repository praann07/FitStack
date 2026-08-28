# FitStack — Frontend

Unified training, nutrition and progress tracker. This package is the **React
SPA** — it talks to Supabase (Postgres + Auth) directly via `supabase-js`;
there is no backend server.

## Running it

```bash
cd frontend
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev          # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Typecheck (`tsc -b`) and produce a production bundle |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Oxlint |

Register a new account to get the empty-state experience: no routines, no
history, and a Mifflin-St Jeor baseline nutrition target until 7+ days of data
exist for the adaptive engine to take over.

## Stack

React 19 · Vite · TypeScript · Tailwind CSS v4 · Recharts · React Router ·
Zustand · date-fns · lucide-react · supabase-js

## Structure

```
src/
  components/
    ui/          Button, Card, Field, Modal, ConfirmDialog, Badge, Segmented,
                 Stat, Ring, EmptyState/Skeleton, Toaster
    layout/      AppShell (sidebar + mobile drawer), PageHeader, AuthLayout
    charts/      TrendChart, VolumeChart, TdeeChart, ExerciseProgressChart
    macros/      MacroSummary, MacroBar, SuggestionCard
    exercises/   ExercisePicker
    workout/     RestTimerBar
    progress/    WeightCalendar
  pages/         One file per route (see below)
  services/      One module per domain, querying Supabase directly:
                 queries.ts (shared bulk-fetch helpers), derive.ts (read-model
                 builders -- session summaries, PR/plateau detection, trend,
                 TDEE, macro suggestions), workout/nutrition/progress/
                 dashboard/authService.ts
  lib/           supabase.ts (client singleton), adaptive.ts (EMA/TDEE/
                 re-target math), strength.ts (1RM/PR/volume/plateau math) --
                 these are the actual business logic now, not a reference copy
  stores/        auth, toast, workout (active session), restTimer
  types/         Domain types mirroring the Supabase schema 1:1
```

### Routes

| Route | Screen |
| --- | --- |
| `/login`, `/register` | Email + password auth; register collects name, body, and goal inline |
| `/pending-approval` | Shown until `profiles.approved` is flipped in the Supabase dashboard |
| `/dashboard` | Today's macros, weekly volume, PR feed, plateau flags, adaptive suggestion |
| `/routines` `/routines/new` `/routines/:id` `/routines/:id/edit` | Routine templates |
| `/workout` | Start from routine or freestyle, exercise picker, set logging, rest timer |
| `/workout/history` | Session list + per-exercise progression charts |
| `/workout/:sessionId` | Session detail |
| `/nutrition` | Food logging by day vs target |
| `/nutrition/targets` | Current target, adaptive suggestion, TDEE history |
| `/progress` | Weigh-ins, smoothed trend, weight calendar, measurements |

## How auth works

`lib/supabase.ts` holds the `supabase-js` client; session persistence and
token refresh are handled by the SDK itself (not hand-rolled). Auth is email
+ password (`supabase.auth.signUp` / `signInWithPassword`). A database
trigger stub-creates a `profiles` row on first signup, and the register flow
completes the profile inline (name, body, goal) — there's no separate
onboarding screen anymore. Every `profiles` row starts with `approved =
false`, and `authStore`'s status mapping (`approved → authenticated`,
otherwise `pending_approval`) routes a not-yet-approved user to
`/pending-approval` instead of the dashboard. Every query that follows is
authorized by Postgres Row Level Security, not application code.

## Deploying

See `../DEPLOY.md`.
