/**
 * Shared bulk-fetch helpers used by workoutService/nutritionService/
 * progressService/dashboardService. RLS already scopes every SELECT to rows
 * the caller owns (or, for exercises/foods, owns-or-is-library) -- these
 * never need an explicit `.eq('user_id', ...)` filter. Each fetches its whole
 * table in one query, matching how backend/app/services/derive.py's helpers
 * loaded full history rather than windowing it (see Phase 3 plan notes: the
 * audit's N+1 was from looping *queries* per item, not from full-table loads
 * -- one query for a user's whole history is exactly the safe pattern).
 */
import { supabase } from '@/lib/supabase'
import { ApiError } from '@/types'
import type { BodyMetric, Exercise, Food, FoodLog, NutritionTarget, TdeeEstimate, WorkoutSession, WorkoutSet } from '@/types'

function unwrap<T>(data: T | null, error: { message: string } | null, label: string): T {
  if (error) throw new ApiError(`${label}: ${error.message}`, 500)
  return data as T
}

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select('*').order('name')
  return unwrap(data, error, 'Loading exercises')
}

/** onlyFinished=true excludes the in-progress session (ended_at IS NULL), if any. */
export async function fetchSessions(opts?: { onlyFinished?: boolean }): Promise<WorkoutSession[]> {
  let query = supabase.from('workout_sessions').select('*').order('session_date', { ascending: false })
  if (opts?.onlyFinished) query = query.not('ended_at', 'is', null)
  const { data, error } = await query
  return unwrap(data, error, 'Loading workouts')
}

/** Every set visible to the caller (RLS-scoped via session ownership) -- one query, no session_id filter needed. */
export async function fetchAllSets(): Promise<WorkoutSet[]> {
  const { data, error } = await supabase.from('workout_sets').select('*').order('set_number')
  return unwrap(data, error, 'Loading sets')
}

/** A session plus the routine style attributed to it for style-filtering:
 * from the session's own routine_snapshot when present, else the live
 * routines.style join, else null (freestyle / routine since deleted). */
export interface RoutedSession extends WorkoutSession {
  routine_style: string | null
}

/** Like fetchSessions but resolves each session's routine_style. */
export async function fetchSessionsWithStyle(opts?: { onlyFinished?: boolean }): Promise<RoutedSession[]> {
  const sessions = await fetchSessions(opts)
  if (sessions.length === 0) return []

  const styleBySession = new Map<string, string | null>()
  const liveRoutineIds = new Set<string>()

  for (const s of sessions) {
    const snap = (s as WorkoutSession & { routine_snapshot?: { style?: string | null } | null }).routine_snapshot
    if (snap && snap.style !== undefined && snap.style !== null) {
      styleBySession.set(s.id, snap.style)
    } else if (s.routine_id) {
      liveRoutineIds.add(s.routine_id)
    }
  }

  if (liveRoutineIds.size > 0) {
    const { data: routines } = await supabase
      .from('routines')
      .select('id, style')
      .in('id', [...liveRoutineIds])
    for (const s of sessions) {
      if (styleBySession.has(s.id)) continue
      if (!s.routine_id) {
        styleBySession.set(s.id, null)
        continue
      }
      const live = (routines ?? []).find((r) => r.id === s.routine_id)
      styleBySession.set(s.id, live?.style ?? null)
    }
  } else {
    for (const s of sessions) {
      if (!styleBySession.has(s.id)) styleBySession.set(s.id, null)
    }
  }

  return sessions.map((s) => ({
    ...s,
    routine_style: styleBySession.get(s.id) ?? null,
  }))
}

export async function fetchFoods(): Promise<Food[]> {
  const { data, error } = await supabase.from('foods').select('*')
  return unwrap(data, error, 'Loading foods')
}

export async function fetchFoodLogs(): Promise<FoodLog[]> {
  const { data, error } = await supabase.from('food_logs').select('*')
  return unwrap(data, error, 'Loading food logs')
}

export async function fetchNutritionTargets(): Promise<NutritionTarget[]> {
  const { data, error } = await supabase.from('nutrition_targets').select('*').order('effective_date', { ascending: false })
  return unwrap(data, error, 'Loading nutrition targets')
}

export async function fetchTdeeEstimates(): Promise<TdeeEstimate[]> {
  const { data, error } = await supabase.from('tdee_estimates').select('*').order('estimate_date')
  return unwrap(data, error, 'Loading TDEE history')
}

export async function fetchDismissedSuggestionIds(): Promise<string[]> {
  const { data, error } = await supabase.from('dismissed_suggestions').select('suggestion_id')
  unwrap(data, error, 'Loading dismissed suggestions')
  return (data ?? []).map((r) => r.suggestion_id)
}

export async function fetchBodyMetrics(filters?: { from?: string; to?: string }): Promise<BodyMetric[]> {
  let query = supabase.from('body_metrics').select('*').order('log_date', { ascending: false })
  if (filters?.from) query = query.gte('log_date', filters.from)
  if (filters?.to) query = query.lte('log_date', filters.to)
  const { data, error } = await query
  return unwrap(data, error, 'Loading body metrics')
}

export function groupSetsBySession(sets: WorkoutSet[]): Map<string, WorkoutSet[]> {
  const map = new Map<string, WorkoutSet[]>()
  for (const s of sets) {
    if (!map.has(s.session_id)) map.set(s.session_id, [])
    map.get(s.session_id)!.push(s)
  }
  return map
}

export function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]))
}
