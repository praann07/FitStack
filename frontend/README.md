# FitStack — Frontend

Unified training, nutrition and progress tracker. This package is the **React
SPA** described in `../fitstack-system-design.md` (§3, §4, §9), talking to the
FastAPI backend in `../backend/`.

## Running it

Start the backend first (see `../backend/README.md`), then:

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

`VITE_API_BASE_URL` (see `.env.example`) points the SPA at the backend —
defaults to `http://localhost:8000/api/v1` for local dev.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Typecheck (`tsc -b`) and produce a production bundle |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Oxlint |

Register a new account to get the empty-state experience: no routines, no
history, and a Mifflin-St Jeor baseline nutrition target until 7+ days of data
exist for the adaptive engine to take over (system design §10).

## Stack

React 19 · Vite · TypeScript · Tailwind CSS v4 · Recharts · React Router ·
Zustand · date-fns · lucide-react

## Structure

```
src/
  components/
    ui/          Button, Card, Field, Modal, ConfirmDialog, Badge, Segmented,
                 Stat, Ring, EmptyState/Skeleton, Toaster
    layout/      AppShell (sidebar + mobile drawer), PageHeader, AuthLayout,
                 RouteGuard
    charts/      TrendChart, VolumeChart, TdeeChart, ExerciseProgressChart
    macros/      MacroSummary, MacroBar, SuggestionCard
    exercises/   ExercisePicker
    workout/     RestTimerBar
  pages/         One file per route (see below)
  services/      HTTP client (client.ts) + one module per endpoint group
  lib/           adaptive.ts (EMA/TDEE/re-target), strength.ts (1RM/PR/volume/
                 plateau) — kept as reference; the backend is the source of truth
  stores/        auth, toast, workout (active session), restTimer
  types/         Domain types mirroring the DB schema 1:1
```

### Routes (system design §9)

| Route | Screen |
| --- | --- |
| `/login`, `/register` | Auth + onboarding (goal, rate, height, baseline weigh-in) |
| `/dashboard` | Today's macros, weekly volume, PR feed, plateau flags, adaptive suggestion |
| `/routines` `/routines/new` `/routines/:id` `/routines/:id/edit` | Routine templates |
| `/workout` | Start from routine or freestyle, exercise picker, set logging, rest timer |
| `/workout/history` | Session list + per-exercise progression charts |
| `/workout/:sessionId` | Session detail |
| `/nutrition` | Food logging by day vs target |
| `/nutrition/targets` | Current target, adaptive suggestion, TDEE history |
| `/progress` | Weigh-ins, smoothed trend, measurements |

## How auth works

`services/client.ts` holds the access token in memory and relies on an
httpOnly refresh cookie (`credentials: 'include'`) for silent refresh. A 401 on
an authenticated call triggers one refresh-and-retry; if that also fails,
`onSessionExpired` fires and `authStore` drops back to the login screen.

## Deploying

See `../DEPLOY.md`.
