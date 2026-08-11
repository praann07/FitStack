# FitStack — Frontend

Unified training, nutrition and progress tracker. This package is the **React
SPA** described in `../fitstack-system-design.md` (§3, §4, §9).

> **Phase 1 — frontend only.** There is no backend yet. Every screen runs
> against a mock service layer that mirrors the documented REST API, so Phase 2
> can swap transports without touching the UI.

## Running it

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Typecheck (`tsc -b`) and produce a production bundle |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Oxlint |

### Demo account

The seeded account has 16 weeks of coherent history — a 4-day upper/lower
program with real progression (and one deliberately stalled lift), daily
weigh-ins with noise, and food logs whose calories actually explain the weight
trend, so the adaptive TDEE engine lands on a real number.

```
demo@fitstack.app
fitstack123
```

Registering a new account instead gives you the **empty-state** experience: no
routines, no history, and a Mifflin-St Jeor baseline target until 7+ days of
data exist (system design §10).

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
                 RouteGuard, DevControls
    charts/      TrendChart, VolumeChart, TdeeChart, ExerciseProgressChart
    macros/      MacroSummary, MacroBar, SuggestionCard
    exercises/   ExercisePicker
    workout/     RestTimerBar
  pages/         One file per route (see below)
  services/      Mock API layer — one module per documented endpoint group
  lib/           adaptive.ts (EMA/TDEE/re-target), strength.ts (1RM/PR/volume/
                 plateau), date, format, validate
  mock/          Seed data: exercise library, food library, history generator
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

## How the mock backend works

`src/services/*` are the only modules that know data is fake. Each method is
annotated with the endpoint it will call in Phase 2:

```ts
/** POST /api/v1/workouts/{id}/sets */
logSet(userId, sessionId, payload) {
  return apiCall('POST /workouts/{id}/sets', () => { /* … */ })
}
```

- `client.ts` simulates latency and can be told to fail the next N requests.
- `db.ts` persists the whole store to `localStorage` (`fitstack.db.v4`).
- `derive.ts` builds the read models the API is expected to return.

Business logic that will live server-side (TDEE estimation, macro re-targeting,
PR detection, plateau detection, weekly volume) is implemented in `src/lib/` so
the numbers on screen are real, not hard-coded.

### Demo controls

The sidebar has a **Demo** panel (`components/layout/DevControls.tsx`) to switch
network latency, force the next request to fail (to exercise error states), and
reset the seeded database.

## Phase 2 integration

1. Replace the body of `apiCall` in `services/client.ts` with `fetch` against
   `API_BASE_URL`, adding the access token and refresh-rotation interceptor.
2. Delete `services/db.ts`, `services/derive.ts` and `src/mock/` — the backend
   owns those read models.
3. Keep `src/lib/adaptive.ts` and `src/lib/strength.ts` as reference
   implementations for the Python engine, or delete them once the API returns
   the computed values.

No page or component imports the mock store directly, so nothing above the
service layer needs to change.
