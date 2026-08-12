# Weight calendar — design

## Context

The Progress page (`frontend/src/pages/ProgressPage.tsx`) currently shows a
weigh-in form, an EMA-smoothed trend line chart, and a flat newest-first list
of entries. The user asked for a calendar view of daily weight — a month grid
is a more scannable way to see logging consistency and day-to-day change than
a line chart or a long list, and lets you spot/fill gaps at a glance.

Decided in brainstorming: add it as a new section alongside the existing
trend chart and list (neither is replaced); clicking a day opens a
weight-only quick-entry; each logged day is colored by whether the smoothed
trend moved toward or away from the user's goal; month navigation (prev/next).

## Backend change

`GET /api/v1/progress/trend` gains an optional `end_date` query param
(default `today`, so existing callers are unaffected). `derive.build_trend`
gains a matching `end_date: date | None = None` parameter; `end = end_date or
date.today()` replaces the hardcoded `date.today()`, and the existing
`weekly_rate(db, user_id, 21, end_date=...)` call (that function already
accepts an end_date) is passed `end` instead of implicitly using today.

The calendar requests `days = (last_visible_grid_day - first_visible_grid_day)
+ 1` with `end_date = last_visible_grid_day`, covering the full 6-row month
grid (including the leading/trailing days from adjacent months) in one call.

## Frontend

New `frontend/src/components/progress/WeightCalendar.tsx`, self-contained
(month-grid + the quick-entry modal as an internal subcomponent, matching how
`ProgressPage.tsx` already colocates `WeighInCard`/`MetricList`). Rendered
as a new `Card` in `ProgressPage.tsx`, between the trend chart and the
weigh-in history list.

**State:** `viewedMonth` (first-of-month `Date`). On change (or mount), fetch:
- `progressService.listMetrics(userId, { from: firstVisibleDay, to:
  lastVisibleDay })` — raw weights for the grid
- `progressService.getTrend(userId, days, lastVisibleDay)` — smoothed trend
  points for the same range, for coloring

**Grid:** Monday-start 6x7 grid (matches `weekStart()` convention used
elsewhere), built from `date-fns` (`startOfWeek`, `endOfWeek`, `addDays`) —
no new dependency. Leading/trailing days from adjacent months are shown
muted but are real, clickable days (not disabled) — only days after today
are disabled, matching the existing form's `max={today()}` constraint.

**Cell content:** day number; if a raw weight is logged for that day, show
it (1 decimal). Days with nothing logged are blank aside from the day
number — the empty cell is itself the "log this day" affordance.

**Cell color:** only applied to days with a logged raw weight. Look up
`trend_kg` for that day and the day before from the fetched trend points.
If either is missing, no color. Otherwise `delta = trend[d] - trend[d-1]`,
compared against a small deadzone (`0.005` kg) to avoid noise right at zero:
- `goal === 'cut'`: `delta < -deadzone` → green, `delta > deadzone` → red,
  else neutral
- `goal === 'bulk'`: inverse of the above
- `goal === 'maintain'`: `|delta| <= deadzone` → green, else amber (no red —
  there's no "wrong direction" for maintain, just drift)

**Quick-entry:** clicking an enabled day opens a small modal (existing
`Modal` component) with a single `NumberField` for weight. On save, it calls
`progressService.saveMetric` with `weight_kg` set to the input and
`waist_cm`/`chest_cm`/`arm_cm`/`photo_url` carried over from that day's
existing metric if one was already loaded (or `null` if the day had no prior
entry) — **not** hardcoded `null`.

This matters: `POST /progress/metrics`'s upsert always overwrites every
field in the payload (only `photo_url` has a "skip if null" carve-out), so a
weight-only save that sent `null` for the others would silently erase any
existing waist/chest/arm measurements for that day. The existing top-of-page
form has this same latent bug (it always sends all four fields from its own
form state), but it's low-risk there since a user editing that form sees all
four fields at once. It becomes a real risk here since the calendar's whole
point is fast weight-only edits, so the merge-not-overwrite behavior is
implemented in the calendar's save call as part of this work.

On successful save, the modal closes, the calendar's local cell data updates
optimistically from the response, and a parent-supplied `onChanged` callback
fires so the trend chart and weigh-in list above (which have their own
separate data) reload too.

**Types:** no new domain types — `BodyMetric` and `TrendPoint` already cover
everything needed. `progressService.getTrend` gains an optional third
`endDate?: string` parameter.

## Testing

- Backend: extend `tests/integration/test_progress.py` with a case asserting
  `end_date` shifts the returned window (e.g. request with an `end_date` a
  week in the past and confirm the last point's `date` matches).
- Frontend: no test harness exists yet for this project (documented gap) —
  verified manually via the running dev servers instead.

## Out of scope

- Waist/chest/arm/photo display on the calendar (weight-only, per the
  brainstorming decision).
- Fixing the same upsert-overwrite footgun in the top-of-page form — noted
  above but not touched, since it's not part of what this feature exercises.
