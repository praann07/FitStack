# FitStack — Project Overview (for external review)

> **Purpose of this document.** A neutral, ground-truth description of the
> project as it exists on `main` today (2026-08-28), written to be handed to
> another instance of Claude for an *honest* evaluation of what is solid and
> what is not. It is deliberately not a pitch: weak spots, half-done work, and
> things I would reconsider are called out where they are true. Where a claim
> about the code is made, the file path is given so it can be verified.
>
> Everything below was checked against the actual repo state, not memory, at
> the time of writing (`git log` tip: `38773ff`).

---

## 1. What it is

**Product.** FitStack is a single-page web app that merges three things a
serious lifter normally juggles across separate apps: **workout logging**,
**nutrition/macro tracking**, and **body-composition progress tracking** —
with the differentiation that these are *unified* (one login, one data model)
and that the nutrition engine is **adaptive** (it re-estimates your TDEE from
your real weight-trend + intake data and suggests macro re-targeting, rather
than using a static Mifflin-St Jeor formula).

**Target user.** Intermediate-to-serious lifters who are bulking/cutting,
tracking macros, and following a program — people who today cross-reference
Hevy/Strong + MacroFactor/MyFitnessPal + a weight log.

**Core value proposition.** One login, one data model. Nutrition targets adapt
to *your* actual trends; training and body-composition data live in the same
place so trends are visible across both **and** correlated (e.g. weight trend
vs. training volume).

**Current state.** Working frontend + working database/auth, wired to a live
Supabase project, with a complete end-to-end path (register → approve → log
workout → log food → dashboard) verified in a browser. **Not yet deployed to a
public URL** — it runs locally (`npm run dev` → `http://localhost:5173`).
Access is gated behind a **manual approval flag** (`profiles.approved`), so
real usage is effectively pilot/testers only. This is a **pilot-stage
prototype with a solid foundation**, not a shipped product.

**Repo.** `C:\Users\mspb2\Desktop\FitStack`, git repo, `origin` =
`https://github.com/praann07/FitStack.git`, branch `main`. Supabase project
`mdqcaqksvqkanhgjrlwa` (already provisioned).

---

## 2. Architecture

### 2.1 High-level shape

```
React SPA (frontend/)  ──supabase-js──▶  Supabase (Postgres + Auth + RLS)
        ▲                                    │
        └────────  NO backend server  ───────┘
```

**There is no backend server and no REST API.** The frontend talks directly to
Supabase (`supabase-js`) and all authorization is done by **Postgres Row Level
Security (RLS)** policies, not application code. This is the result of a
deliberate replatform (see §3): the project originally had a FastAPI + Neon
backend, which was deleted.

### 2.2 Full tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend framework | React 19 (`react@^19.2.8`) | Function components, hooks |
| Build | Vite 8 + TypeScript 6 | `tsc -b && vite build` |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) | Utility-first, design tokens |
| Routing | React Router 7 | Client-side; `vercel.json` rewrites for SPA refresh |
| State | Zustand 5 | 4 stores: auth, toast, workout (active session), restTimer |
| Charts | Recharts 3 | >500 kB — see §5 known limitation |
| Icons | lucide-react | |
| Dates | date-fns 4 | |
| Data access | `@supabase/supabase-js` 2 | Direct Postgres queries + RLS |
| Lint | oxlint | `npm run lint` |
| Database/Auth | Supabase (PostgreSQL) | Migrations in `supabase/migrations/` |
| CI | GitHub Actions | `.github/workflows/ci.yml` — lint + build only |
| Deploy | Vercel (frontend only), config in `frontend/vercel.json` | **Not yet executed** |
| Tests | **None** | No unit/integration tests exist |

### 2.3 Frontend folder / module structure

(Real names — verified against disk.)

```
frontend/
  src/
    main.tsx                     Entry; mounts <App/>
    App.tsx                      Route table + auth guards (RequireAuth,
                                 RequirePendingApproval) + route code-splitting
    lib/                         Pure business logic (no I/O)
      supabase.ts                supabase-js client singleton + env
      adaptive.ts                EMA, TDEE estimator, macro re-target / proposeRetarget
      strength.ts                1RM (Epley), PR, volume, plateau, volume landmarks
      derive.ts  → NOT here; see services/  (actually services/derive.ts)
      date.ts, format.ts, cn.ts, validate.ts, export.ts (CSV)
    services/                    Query layer + read-model builders
      index.ts                   Barrel — components import only from here
      queries.ts                 Shared bulk-fetch helpers
      authService.ts             signUp/signIn/restore/logout
      workoutService.ts          routines, sessions, sets, worklog
      nutritionService.ts        foods, food logs, targets, TDEE recompute
      progressService.ts         body metrics, weigh-ins
      dashboardService.ts        dashboard summary aggregate
      derive.ts                  Read-model builders (session summaries, PR/
                                 plateau, trend, TDEE, macro suggestions) — pure
                                 functions, client port of old backend derive.py
    stores/                      Zustand stores
      authStore.ts               Auth status machine (see §2.4)
      workoutStore.ts            Active in-progress session
      toastStore.ts              Toast notifications
      restTimerStore.ts          Rest timer
    hooks/
      useAsync.ts                Data-fetching hook (loading/error/data + action)
    types/
      index.ts                   Domain types mirroring the Supabase schema 1:1
    pages/                       One file per route
      LoginPage, RegisterPage, PendingApprovalPage
      DashboardPage
      WorkoutPage, WorkoutHistoryPage, WorkoutDetailPage
      RoutinesPage, RoutineDetailPage, RoutineEditorPage
      NutritionPage, NutritionTargetsPage
      ProgressPage
    components/
      ui/        Button, Card, Field, Modal, ConfirmDialog, Badge, Segmented,
                 Stat, Ring, EmptyState/Skeleton, Toaster
      layout/    AppShell (sidebar + mobile drawer), PageHeader, AuthLayout,
                 RouteGuard  ← DEAD CODE (see §5)
      charts/    TrendChart, VolumeChart, TdeeChart, ExerciseProgressChart,
                 ChartTooltip
      macros/    MacroSummary, MacroBar, SuggestionCard
      exercises/ ExercisePicker
      workout/   RestTimerBar
      progress/  WeightCalendar
```

`supabase/` (migrations 0001–0008 + seed):
```
  migrations/
    0001_profiles.sql            auth.users → public.profiles trigger, RLS
    0002_training.sql            exercises, routines, routine_exercises,
                                 workout_sessions, workout_sets
    0003_nutrition.sql           foods, food_logs, nutrition_targets,
                                 tdee_estimates, dismissed_suggestions
    0004_progress.sql            body_metrics (incl. photo_url)
    0005_seed_library.sql        built-in exercise + food library seed
    0006_rls_perf_hardening.sql  indexes + RLS perf fixes
    0007_approval_gate.sql       profiles.approved + RLS approval gating
    0008_fix_signup_approval_deadlock.sql  signup no longer requires approval
  seed/
    demo_seed.sql / demo_teardown.sql  ~3 weeks of consistent demo data
  config.toml                    Supabase CLI local config
```

Other root files: `README.md`, `DEPLOY.md`, `frontend/README.md`,
`fitstack-system-design.md`, `docs/` (design specs + the paused 2FA plan),
`.github/workflows/ci.yml`, `.gitignore`, `skills-lock.json`.

### 2.4 How the major pieces connect

1. **Auth.** `lib/supabase.ts` holds the `supabase-js` client; session
   persistence/refresh is the SDK's job. `authStore.status` is a 4-state
   machine: `restoring → authenticated | pending_approval | anonymous`, where
   `authenticated` requires the user's `profiles.approved === true`
   (`stores/authStore.ts:17-19`). `App.tsx` routes:
   - not signed in → `/login`
   - signed in but unapproved → `/pending-approval`
   - signed in + approved → the app shell (`/dashboard` + nested routes)
   Registration collects name/body/goal inline (no separate onboarding screen).
   **Every subsequent data query is authorized by RLS, not by the client** — an
   unapproved-but-signed-up user has a valid session but RLS blocks reads/writes
   on all user-data tables (`0007_approval_gate.sql`).

2. **Data flow.** Components import services from `services/index.ts` (they
   never touch `supabase-js` directly). Each service fetches raw rows from
   Supabase **in bulk** (one query per table per operation, never per-item),
   then passes them to pure functions in `services/derive.ts` which shape the
   exact response types the pages consume. Business math (1RM/PR/volume/plateau,
   EMA/TDEE/macro re-target) lives in `lib/strength.ts` and `lib/adaptive.ts`.
   `types/index.ts` mirrors the DB schema 1:1 so a transport change would not be
   a modeling change.

3. **Dashboard.** `dashboardService` fetches across body/training/nutrition and
   assembles one `DashboardSummary` (macros today, weekly volume, recent PRs,
   plateaus, adaptive suggestion, streak).

4. **Workout flow.** Create a routine → start a session from a routine or
   freestyle → log sets → `workoutStore` holds the active session → on finish,
   sets are written to `workout_sets` and `is_pr` is recomputed
   (`derive.recomputePRs`) and persisted.

### 2.5 Database schema (key tables)

- `profiles (id→auth.users, approved, ...)`
- `routines (id, user_id, name, notes, created_at, updated_at)` — **no style/versioning**
- `routine_exercises (id, routine_id→routines, exercise_id, order_index, target_sets, target_rep_range, target_rpe, rest_seconds, notes)`
- `workout_sessions (id, user_id, routine_id→routines ON DELETE SET NULL, session_date, notes, started_at, ended_at)`
- `workout_sets (id, session_id, exercise_id, set_number, weight_kg, reps, rpe, set_type, notes, is_pr)`
- `exercises`, `foods`, `food_logs`, `nutrition_targets (effective_date)`,
  `tdee_estimates`, `dismissed_suggestions`, `body_metrics (incl. photo_url)`

---

## 3. Key design decisions

**D1 — Replatform off a FastAPI backend onto Supabase-only.** Originally the app
had a FastAPI + Neon backend (backend app + `/backend/*` + REST API + JWT auth).
It was fully deleted and replaced by: frontend talking to Supabase directly,
RLS for authorization, and client-side read-model builders. *Why:* a solo
build, no ops burden, auth/infra free, and RLS gives per-row security without
a server. *Honest caveats:* business logic now runs in the browser
(`lib/adaptive.ts`, `derive.ts`) and is duplicated nowhere server-side, so a
malicious client could change the math it reports (though it cannot read/write
data RLS forbids). The harder-to-reverse consequence is **no server-side place
to put trusted, non-SQL logic or background jobs** (e.g. the intended email
approval automation — see §6), and multi-user/SSR patterns would need a rethink.

**D2 — Manual `profiles.approved` gate as the pilot access control.** Instead
of OTP or open signup, registration is email+password and every account starts
`approved=false`; an admin flips the flag by hand in the Supabase dashboard,
enforced in RLS on every user-data table (`0007`). *Why:* for 10–15 known
testers it's the simplest thing that actually restricts access (a "pending
approval" screen alone would be bypassable by a direct API call; RLS makes it a
real boundary). *Honest caveats:* does not scale, every signup waits on a human,
and it's explicitly a temporary pilot measure. The original plan to automate it
via email (login-2FA spec) is **paused** — see §6.

**D3 — Adaptive TDEE + macro re-targeting as the product's "intelligence."**
Rather than a static calorie formula, `lib/adaptive.ts` estimates TDEE from
weight-trend + intake regression and, when your weekly rate deviates from your
goal, proposes a calorie + macro shift (`proposeRetarget`), surfaced as a
dismissible suggestion banner with a recompute path. This is the differentiation
against static macro apps. *Honest caveats:* works only with enough data (stated
7+ days / ~4+ points thresholds); the math is deliberately conservative and the
"suggestion" is a recommendation, not an auto-apply.

**D4 — Unauthenticated app data = a handful of library tables, everything else
RLS-gated.** `exercises` (built-in) and `foods` (built-in) are readable by all
signed-in users; custom rows are owner-scoped. All user data is owner-only via
RLS. This mirrors a shared-catalog + private-data model.

**D5 — Client-side read-model/derive layer (no server).** All aggregation
(per-session summaries, weekly volume, PR flags, plateau detection, trend,
TDEE) is computed client-side from bulk-fetched raw rows in `services/derive.ts`,
a 1:1 port of the old Python `derive.py`. *Honest caveats:* this is the largest
single file of business logic and is untested (see §5); bugs here affect every
screen.

**D6 — Routine redesign currently OVERWRITES structure in place** (`workoutService.updateRoutine`
at `workoutService.ts:202-217` deletes + re-inserts `routine_exercises` on the
**same** routine row). Past sessions keep `routine_id` pointing at the live
routine, so editing a routine retroactively rewrites what past sessions "were."
**This is a recognized design weakness** that is the subject of an approved but
**not-yet-implemented** plan (item 3 in §6 — versioned routine structures).
I would reverse/improve this; it is the clearest current flaw in the data model.

**D7 — Weight used as EMA-smoothed trend, not raw daily values, for every
calculation and chart.** `buildTrend`/`weeklyRate` and `recentWeighInTrend`
explicitly avoid raw daily noise (the chart exists to show the smooth trend vs
the noisy dots). Deliberate, and matches the product's framing.

**D8 — Photo progress tracking is designed (column `photo_url` on `body_metrics`)
but not implemented as a feature.** The column is preserved through upserts;
there's no storage bucket, upload, or gallery UI. Kept out of scope deliberately.

**D9 — Auth uses React Router guards + a Zustand status machine** with route
code-splitting (`lazy()` per page). `RouteGuard.tsx` exists but is **dead code**
(exported, never imported — the live-gate logic lives in `App.tsx`). See §5.

**Uncertain / would-reconsider list** (for the reviewer):
1. The **overwrite-in-place routine edit** (D6) and the general lack of
   routine/session *versioning* or snapshots — history attribution is weaker
   than it should be.
2. **No tests** at all for the core math/derive layer (and none anywhere).
3. Client-side-only business logic — no trusted server, so the "smart" numbers
   are what a client says they are.
4. Supabase built-in SMTP is rate-limited and explicitly non-production; the
   Deploy doc flags this as a pre-real-users task.
5. Recharts >500 kB bundle advisory (see §5).
6. The `fitstack-system-design.md` is **partially superseded** — §3/5/6/8 still
   describe the old FastAPI/Neon system; §7 (business logic) is accurate. The
   header note documents this, but the file is a trap for a reader who doesn't
   read the note.

---

## 4. Current status

### Built and working (verified)

- **Complete service layer** querying live Supabase for workout, nutrition,
  progress, dashboard, and auth domains (`frontend/src/services/`).
- **Full authentication loop** with the approval gate: email+password signup
  (name/body/goal collected inline), pending-approval screen, RLS-enforced
  gate, session restore/refresh. Verified end-to-end in a browser.
- **All 13 pages** built: Login, Register, PendingApproval, Dashboard,
  Workout (active session + rest timer), WorkoutHistory (sessions + per-exercise
  progression charts + plateau), WorkoutDetail, Routines (list/detail/edit/
  new), Nutrition (daily food vs target), NutritionTargets (adaptive suggestion
  + TDEE history), Progress (weigh-ins, trend chart, weight calendar,
  measurements).
- **Charts**: TrendChart, VolumeChart (weekly volume by muscle group with
  MEV/MAV/MRV colouring), TdeeChart, ExerciseProgressChart, WeightCalendar.
- **Adaptive engine**: `estimateTdee`, `proposeRetarget`, suggestion banner.
- **CSV export** (nutrition + workout history), custom-exercise and custom-food
  creation with muscle/equipment pickers.
- **PR detection** (Epley 1RM-based, `recomputePRs`), plateau detection,
  weekly volume per muscle group.
- **Demo seed** (`supabase/seed/demo_seed.sql`) — ~3 weeks of internally
  consistent data for the review account so every screen has content.
- **Release gates currently green at last verified run:** `npm run lint` (0/0),
  `tsc -b` (exit 0), `npm run build` (exit 0, only the pre-existing Recharts
  >500 kB advisory).
- **CI** (`.github/workflows/ci.yml`): lint + typecheck + build on push/PR to
  `main`. Supabase migrations are applied directly; Vercel deploys via Vercel's
  own GitHub integration. **N.B.** CI has no Supabase/Vercel steps and has not
  necessarily run green on the live project (lint/build are deterministic and
  pass locally).

### Half-done / not started

- **No frontend unit/integration tests** (nothing under `*.test.*`/`*.spec.*`).
  The adaptive/derive math — the product's core differentiator — is completely
  unprotected by tests.
- **No live deployment.** `vercel.json` + `DEPLOY.md` ready, but Vercel deploy
  has not been executed; only local dev + a production `build` output.
- **No progress-photo feature** (see D8).
- **RouteGuard.tsx is dead code** — a leftover to delete (decision pending;
  it's harmless but noise).
- **The demo seed** requires a manual "Recompute" tap on the NutritionTargets
  page to write the `tdee_estimates` row (by design, so the estimate is really
  computed — but it's an easy-to-miss manual step for a reviewer).
- Two `.pptx` presentation files in the repo root are intentionally
  **untracked/excluded** from git (local only).

### Known bugs / limitations / tech debt

1. **Routine edits overwrite history** (D6) — editing a routine changes what
   past sessions point at. Pending fix (item 3, §6).
2. **No tests** for core logic — regression risk high on any change to derive/
   adaptive/strength.
3. **Client-side-only business logic** — no trusted server; the "adaptive" math
   is what the browser computes.
4. **Recharts bundle advisory** (>500 kB) — accepted for now.
5. **Supabase built-in SMTP rate-limited / non-prod** — must be swapped before
   real users (DEPLOY.md).
6. **Manual approval gate** — operational friction, not scalable (by design,
   pilot-stage).
7. **`fitstack-system-design.md` is partially stale** — useful only with its
   superseded-header caveat read; architecture/schema/auth sections describe a
   deleted system.
8. **Empty root `package-lock.json`** and stray `.playwright-mcp/` dir are
   gitignored but indicate a little root-level cruft; two `.pptx` files sit
   untracked in the repo root.

---

## 5. Dead / suspicious code worth a reviewer's eye

- `frontend/src/components/layout/RouteGuard.tsx` — exported but **never
  imported** anywhere (`grep RouteGuard` → only its own definition). The real
  guard is inline in `App.tsx`. Safe to delete.
- `photo_url` on `body_metrics` — present but unused by any UI (future hook).
- `frontend/src/lib/date.ts` / `format.ts` / `validate.ts` / `export.ts` —
  used by services/pages; `export.ts` is new (CSV), fine.

---

## 6. Roadmap / planned features / open questions

### In progress (design approved, code NOT yet written — as of 2026-08-28)

A brainstorming session has produced an **approved design** for three frontend
features to land "before Review 2." The design is **not yet implemented**
(no code, no migration, no commit). It covers:

1. **Set-by-set progress view.** A new multi-line chart in the WorkoutHistory
   Progression tab where each set number (Set 1 / Set 2 / Set 3 …) is its own
   series for a chosen exercise over time; "plot what exists, gap where missing"
   when set counts differ between sessions. No schema change needed (leverages
   `workout_sets.set_number`). New pure derive fn `buildSetHistory` + a
   `SetProgressionChart`.
2. **Training-style tags on routines** (`style` column: push/pull/legs/upper/
   lower/full-body/arms/core) so progress is compared within the same style; a
   style dropdown filters **both** the new set chart and the existing top-set
   progression chart.
3. **Versioned routine structures** (the fix for D6): add a `routine_versions`
   table; editing a routine creates a new immutable version; sessions link to
   the exact version they were created against; backfill existing data as
   "version 1." **This is the riskiest item** — it's a real schema change with a
   data-backfill migration on live tables and ripples through the routine
   service/editor/hydration. Approach (copy-on-edit vs. snapshot-on-session vs.
   version tables) was explicitly decided via user choice → **version tables**.

The intended next step after this overview is to write the design doc to
`docs/superpowers/specs/`, then a plan, then implement + verify (lint/typecheck/
build), then deploy.

### Documented but paused / explicitly out-of-scope now

- **Item 4 — Deploy to a public URL + onboard a group.** Deploy runnable
  (`DEPLOY.md`) but not executed. Needs: Vercel deploy of `frontend/`, swap SMTP
  to a real provider, manual approval of the first real users. Out of scope for
  the current frontend-only round.
- **Item 5 — Automate approval by email (weighsfit.in).** The approved-but-
  **paused** "login 2FA" design (`docs/superpowers/specs/2026-08-17-login-2fa-design.md`)
  would remove the manual gate and replace password-only with email-OTP as a
  second factor. **Blocked** on Resend domain verification for `weighsfit.in`,
  whose KYC code goes to an unreachable phone. No code changed for it. Resume =
  clear domain KYC, then execute `docs/superpowers/plans/2026-08-17-login-2fa.md`.
- **Progress photos** (D8), **admin panel** (deliberately excluded — no
  admin-side UI by directive), **multi-user sharing** (not designed).

### Open questions not yet resolved

- Whether to **delete `RouteGuard.tsx`** (pending user decision).
- **How far to invest in the versioned-routine migration's backfill** given
  there's minimal real production data (could be a clean reset or a careful
  backfill — trade-off not yet decided).
- **Verification/quality bar:** whether to add unit tests for the derive/
  adaptive/strength layer *before* adding more features (currently zero tests;
  I lean strongly toward yes, but not yet approved).
- **Chart metric for set-by-set** (e1RM vs raw weight) — default chosen as e1RM
  for coherence with the PR system, but not hard-locked.
- Whether the **adaptive suggestion** should ever auto-apply vs. remain a
  user-confirmed recommendation (currently user-confirmed).
- Long-term: accept the browser-computed-logic model, or reintroduce a thin
  trusted server for calculation/background jobs (would partially reverse D1).

---

*End of overview. Written 2026-08-28 against `38773ff` on `main`. Intended for
honest external review; flag anything here that doesn't match what you actually
find in the repo.*
