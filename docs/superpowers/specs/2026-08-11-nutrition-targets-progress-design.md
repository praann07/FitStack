# FitStack — Nutrition, Targets & Progress Pages

## Design Document (approved)

**Date:** 2026-08-11

## Context

The FitStack MVP already has a complete mock service layer and types for the
nutrition and progress modules, plus reusable components (`MacroSummary`,
`MacroBar`, `SuggestionCard`, `TdeeChart`, `TrendChart`, `VolumeChart`, `Modal`,
`EmptyState`, `Skeleton`, `Field`/`Input`/`NumberField`/`Select`). The dashboard
already composes most of these. The three screens behind those modules are still
placeholder stubs:

- `/nutrition` (`NutritionPage`) — "Nutrition isn't built yet"
- `/nutrition/targets` (`NutritionTargetsPage`) — "Targets aren't built yet"
- `/progress` (`ProgressPage`) — "Progress isn't built yet"

This spec completes them. It is pure UI composition — no service-layer, db, or
type changes are required, with one exception: a latent data-shape bug in
`TdeeChart` must be fixed for the TDEE history chart to render.

## Decisions

- **Scope:** all three pages. Progress photos are skipped (system design marks
  them optional; YAGNI).
- **Structure:** self-contained page files with page-local helper components,
  matching the established `DashboardPage` pattern. No new shared-component
  directories — the pages are the only consumers.
- **Approach:** reuse the existing services (`nutritionService`,
  `progressService`) and components as-is wherever possible.

## 1. `/nutrition` — food logging by day

- `PageHeader title="Nutrition"` with a date navigator: prev/next day arrows,
  `friendlyDate(date)` badge, and a "Today" shortcut when the selected day is
  not today. State: `date` (ISO, defaults `today()`).
- `MacroSummary` for the selected day (`nutritionService.getDay` →
  `day.totals`, `day.target`). Add an optional `label` prop to `MacroSummary`
  (default `"Today's macros"`, dashboard unchanged) so the header reflects the
  selected day.
- Four meal sections from `day.by_meal` (breakfast/lunch/dinner/snack). Each
  entry: food name, brand, grams, kcal + P/C/F; per-entry edit (quantity + meal
  type) and delete. Mutations via `updateLog` / `deleteLog`, then reload day.
- **Add food** button opens a `Modal`:
  - Search box (debounced) → `searchFoods`; when query is empty show
    `frequentFoods` (default list).
  - Food row → quick-log form: quantity grams, meal type, Add
    (`logFood`). Serving hint shown when `serving_label` exists.
  - "Create custom food" toggle → name/brand/calories/protein/carbs/fat
    per 100 g (+ optional serving label & grams) → `createFood`, then log it.
- **Copy from yesterday** action when the day has no entries → `copyDay`
  (yesterday → selected day); toast, reload.
- Errors: `useAsync`/`useAction` pattern; `EmptyState` with retry; form field
  errors via `Field` `error` prop; mutation toasts.

## 2. `/nutrition/targets` — targets + adaptive engine UI

- `PageHeader title="Targets"` with a "Recalculate TDEE" action →
  `nutritionService.recompute` → toast/alert with returned `message`, reload all
  data.
- **Current target card:** kcal + P/C/F, source badge (`adaptive`/`manual`),
  "Edit manually" → `Modal` with calorie input, `previewMacros` breakdown
  (live), `setManualTarget`. Manual source pauses adaptive overwrites (service
  behavior; surfaced via badge + hint).
- **SuggestionCard** when `currentSuggestion()` returns one: Accept →
  `acceptSuggestion` + reload; Dismiss → `dismissSuggestion`.
- **TDEE history** card: `TdeeChart` (fixed, see below) + latest estimate
  summary (kcal, confidence badge, trend weight used) from `tdeeHistory`.
- **Target history** list from `targetHistory`: effective date, macros, source.

## 3. `/progress` — weigh-ins + trend

- **Log measurement** card: date (defaults today), weight kg, optional
  waist/chest/arm cm → `progressService.saveMetric` (upsert by date), toast,
  reload.
- **Trend chart** card: `TrendChart` from `progressService.getTrend(userId,
  90)`; stats row from `ProgressTrend`: current trend, `rate_kg_week`,
  `total_change_kg`.
- **History list** from `listMetrics`: date, weight + measurements, per-row
  delete (`deleteMetric`).
- Empty states: "Log your first weigh-in".

## Fix: `TdeeChart` shape mismatch

`TdeeChart` maps `e.value` / `e.lo` / `e.hi`, but `TdeeEstimate` carries
`estimated_tdee`, `weight_trend_kg`, `confidence`. Fix the data mapping to use
`estimated_tdee` and drop the fabricated "95% range" tooltip row; keep a single
"Estimated TDEE" row. Add a confidence badge row in the surrounding card instead
of a fake band.

## Error handling & states

Every async load uses `useAsync` (loading skeleton → error EmptyState with
retry → data). Every mutation uses `useAction` with toast on success and
inline/alert error on failure. No global error boundary changes.

## Verification

1. `npx tsc --noEmit` (typecheck) and the project lint command — confirm.
2. Playwright (Edge, headless) harness already in use: register fresh account →
   `/nutrition` log a food + create a custom food; `/nutrition/targets`
   recalculate + chart renders; `/progress` log a weigh-in → trend renders;
   assert zero console errors on every page.
