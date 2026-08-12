import { supabase, currentUserId } from '@/lib/supabase'
import * as derive from './derive'
import { today } from '@/lib/date'
import { fetchExercises, fetchSessions, fetchAllSets, groupSetsBySession, indexById } from './queries'
import { ApiError } from '@/types'
import type {
  Exercise,
  ExerciseHistoryPoint,
  MuscleGroup,
  PersonalRecord,
  PlateauStatus,
  Routine,
  RoutineDetail,
  RoutineExercise,
  SessionDetail,
  SessionSummary,
  SetType,
  WeeklyVolumePoint,
  WorkoutSession,
  WorkoutSet,
} from '@/types'

export interface LogSetPayload {
  exercise_id: string
  weight_kg: number
  reps: number
  rpe: number | null
  set_type: SetType
  notes?: string | null
}

export interface RoutineInput {
  name: string
  notes: string | null
  exercises: {
    exercise_id: string
    target_sets: number
    target_rep_range: string
    target_rpe: number | null
    rest_seconds: number
    notes: string | null
  }[]
}

// --- Duplicate-set guard ----------------------------------------------------
// Same 2.5s debounce the old backend used, but scoped to this browser tab
// instead of a global in-memory dict on a shared server process (which was a
// latent cross-user bug there -- harmless here since there's no server).
const DUPLICATE_WINDOW_MS = 2500
const recentSubmissions = new Map<string, number>()

// --- Shared helpers ----------------------------------------------------------

async function routineName(routineId: string | null): Promise<string | null> {
  if (!routineId) return null
  const { data } = await supabase.from('routines').select('name').eq('id', routineId).maybeSingle()
  return data?.name ?? null
}

async function attachRoutineExercises(routines: Routine[]): Promise<RoutineDetail[]> {
  if (routines.length === 0) return []
  const { data, error } = await supabase
    .from('routine_exercises')
    .select('*, exercise:exercises(*)')
    .in('routine_id', routines.map((r) => r.id))
    .order('order_index')
  if (error) throw new ApiError(error.message, 500)

  const byRoutine = new Map<string, (RoutineExercise & { exercise: Exercise })[]>()
  for (const row of (data ?? []) as (RoutineExercise & { exercise: Exercise })[]) {
    if (!byRoutine.has(row.routine_id)) byRoutine.set(row.routine_id, [])
    byRoutine.get(row.routine_id)!.push(row)
  }
  return routines.map((r) => ({ ...r, exercises: byRoutine.get(r.id) ?? [] }))
}

/** Runs the same full chronological PR pass the old backend ran after every
 * write, but only persists rows whose is_pr actually flipped (the original
 * rewrote every set in history unconditionally on every log/edit/delete). */
async function recomputeAndPersistPRs(): Promise<WorkoutSet[]> {
  const [sessions, sets] = await Promise.all([fetchSessions(), fetchAllSets()])
  const recomputed = derive.recomputePRs(sessions, sets)
  const changed = recomputed.filter((s, i) => s.is_pr !== sets[i].is_pr)
  // Plain UPDATE, not upsert: an upsert's INSERT-path candidate row omits every
  // column but id/is_pr, which fails the "own sets" RLS policy's WITH CHECK
  // (it needs a real session_id to resolve session ownership) even though the
  // row already exists and only its is_pr needs to change.
  const results = await Promise.all(
    changed.map((s) => supabase.from('workout_sets').update({ is_pr: s.is_pr }).eq('id', s.id)),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new ApiError(failed.error.message, 500)
  return recomputed
}

async function loadSessionDetail(session: WorkoutSession): Promise<SessionDetail> {
  const [{ data: sets, error }, exercises, name] = await Promise.all([
    supabase.from('workout_sets').select('*').eq('session_id', session.id).order('set_number'),
    fetchExercises(),
    routineName(session.routine_id),
  ])
  if (error) throw new ApiError(error.message, 500)
  return derive.buildSessionDetail(session, (sets ?? []) as WorkoutSet[], indexById(exercises), name)
}

/**
 * Workout service (Supabase replatform Phase 3). `userId` parameters are kept
 * for call-site compatibility but unused: identity comes from the Supabase
 * session, and RLS scopes every query to the caller's own (or, for exercises,
 * owns-or-library) rows.
 */
export const workoutService = {
  // --- Exercises ------------------------------------------------------------

  async listExercises(
    _userId: string,
    filters?: { muscle_group?: MuscleGroup; search?: string },
  ): Promise<Exercise[]> {
    let query = supabase.from('exercises').select('*').order('name')
    if (filters?.muscle_group) query = query.eq('muscle_group', filters.muscle_group)
    if (filters?.search) query = query.ilike('name', `%${filters.search.trim()}%`)
    const { data, error } = await query
    if (error) throw new ApiError(error.message, 500)
    return data as Exercise[]
  },

  async createExercise(
    _userId: string,
    payload: { name: string; muscle_group: MuscleGroup; equipment: Exercise['equipment'] },
  ): Promise<Exercise> {
    const name = payload.name.trim()
    const { data: clash } = await supabase.from('exercises').select('id').ilike('name', name).limit(1)
    if (clash && clash.length > 0) throw new ApiError('You already have an exercise with that name.', 409)

    const userId = await currentUserId()
    const { data, error } = await supabase
      .from('exercises')
      .insert({ ...payload, name, is_custom: true, created_by: userId })
      .select()
      .single()
    if (error) throw new ApiError(error.message, 500)
    return data as Exercise
  },

  async trainedExercises(_userId: string): Promise<Exercise[]> {
    const sets = await fetchAllSets()
    const ids = [...new Set(sets.map((s) => s.exercise_id))]
    if (ids.length === 0) return []
    const { data, error } = await supabase.from('exercises').select('*').in('id', ids).order('name')
    if (error) throw new ApiError(error.message, 500)
    return data as Exercise[]
  },

  async lastPerformance(
    _userId: string,
    exerciseId: string,
    excludeSessionId?: string,
  ): Promise<{ date: string; sets: WorkoutSet[] } | null> {
    const [sessions, sets] = await Promise.all([fetchSessions(), fetchAllSets()])
    const setsBySession = groupSetsBySession(sets)
    for (const session of sessions) {
      if (session.id === excludeSessionId) continue
      const matching = (setsBySession.get(session.id) ?? []).filter((s) => s.exercise_id === exerciseId)
      if (matching.length > 0) return { date: session.session_date, sets: matching }
    }
    return null
  },

  // --- Routines ---------------------------------------------------------------

  async listRoutines(_userId: string): Promise<RoutineDetail[]> {
    const { data, error } = await supabase.from('routines').select('*').order('updated_at', { ascending: false })
    if (error) throw new ApiError(error.message, 500)
    return attachRoutineExercises(data as Routine[])
  },

  async getRoutine(_userId: string, routineId: string): Promise<RoutineDetail> {
    const { data, error } = await supabase.from('routines').select('*').eq('id', routineId).maybeSingle()
    if (error) throw new ApiError(error.message, 500)
    if (!data) throw new ApiError('Routine not found.', 404)
    const [detail] = await attachRoutineExercises([data as Routine])
    return detail
  },

  async createRoutine(_userId: string, input: RoutineInput): Promise<RoutineDetail> {
    const userId = await currentUserId()
    const { data: routine, error } = await supabase
      .from('routines')
      .insert({ user_id: userId, name: input.name.trim(), notes: input.notes })
      .select()
      .single()
    if (error) throw new ApiError(error.message, 500)

    if (input.exercises.length > 0) {
      const rows = input.exercises.map((ex, index) => ({ ...ex, routine_id: routine.id, order_index: index }))
      const { error: exError } = await supabase.from('routine_exercises').insert(rows)
      if (exError) throw new ApiError(exError.message, 500)
    }
    return workoutService.getRoutine(_userId, routine.id)
  },

  async updateRoutine(_userId: string, routineId: string, input: RoutineInput): Promise<RoutineDetail> {
    const { error } = await supabase
      .from('routines')
      .update({ name: input.name.trim(), notes: input.notes, updated_at: new Date().toISOString() })
      .eq('id', routineId)
    if (error) throw new ApiError(error.message, 500)

    const { error: deleteError } = await supabase.from('routine_exercises').delete().eq('routine_id', routineId)
    if (deleteError) throw new ApiError(deleteError.message, 500)

    if (input.exercises.length > 0) {
      const rows = input.exercises.map((ex, index) => ({ ...ex, routine_id: routineId, order_index: index }))
      const { error: insertError } = await supabase.from('routine_exercises').insert(rows)
      if (insertError) throw new ApiError(insertError.message, 500)
    }
    return workoutService.getRoutine(_userId, routineId)
  },

  /** History keeps its sessions — routine_id is nulled via ON DELETE SET NULL, not cascaded. */
  async deleteRoutine(_userId: string, routineId: string): Promise<void> {
    const { error } = await supabase.from('routines').delete().eq('id', routineId)
    if (error) throw new ApiError(error.message, 500)
  },

  // --- Sessions -----------------------------------------------------------------

  async listSessions(
    _userId: string,
    filters?: { from?: string; to?: string; limit?: number },
  ): Promise<SessionSummary[]> {
    let query = supabase
      .from('workout_sessions')
      .select('*')
      .not('ended_at', 'is', null)
      .order('session_date', { ascending: false })
      .limit(filters?.limit ?? 500)
    if (filters?.from) query = query.gte('session_date', filters.from)
    if (filters?.to) query = query.lte('session_date', filters.to)
    const { data, error } = await query
    if (error) throw new ApiError(error.message, 500)
    const sessions = data as WorkoutSession[]

    const [{ data: sets, error: setsError }, exercises] = await Promise.all([
      sessions.length > 0
        ? supabase.from('workout_sets').select('*').in('session_id', sessions.map((s) => s.id))
        : Promise.resolve({ data: [], error: null }),
      fetchExercises(),
    ])
    if (setsError) throw new ApiError(setsError.message, 500)
    const setsBySession = groupSetsBySession((sets ?? []) as WorkoutSet[])
    const exerciseById = indexById(exercises)

    const routineIds = [...new Set(sessions.map((s) => s.routine_id).filter((id): id is string => id !== null))]
    const { data: routines } = routineIds.length > 0 ? await supabase.from('routines').select('id, name').in('id', routineIds) : { data: [] }
    const nameById = new Map((routines ?? []).map((r) => [r.id, r.name as string]))

    return sessions.map((session) =>
      derive.buildSessionSummary(
        derive.buildSessionDetail(
          session,
          setsBySession.get(session.id) ?? [],
          exerciseById,
          session.routine_id ? (nameById.get(session.routine_id) ?? null) : null,
        ),
      ),
    )
  },

  async getSession(_userId: string, sessionId: string): Promise<SessionDetail> {
    const { data, error } = await supabase.from('workout_sessions').select('*').eq('id', sessionId).maybeSingle()
    if (error) throw new ApiError(error.message, 500)
    if (!data) throw new ApiError('Workout not found.', 404)
    return loadSessionDetail(data as WorkoutSession)
  },

  async getActiveSession(_userId: string): Promise<SessionDetail | null> {
    const { data, error } = await supabase.from('workout_sessions').select('*').is('ended_at', null).maybeSingle()
    if (error) throw new ApiError(error.message, 500)
    return data ? loadSessionDetail(data as WorkoutSession) : null
  },

  async startSession(_userId: string, routineId: string | null): Promise<SessionDetail> {
    const { data: active } = await supabase.from('workout_sessions').select('id').is('ended_at', null).maybeSingle()
    if (active) throw new ApiError('You already have a workout in progress.', 409)

    const userId = await currentUserId()
    const { data, error } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: userId,
        routine_id: routineId,
        session_date: today(),
        started_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (error) throw new ApiError(error.message, 500)
    return loadSessionDetail(data as WorkoutSession)
  },

  async logSet(
    _userId: string,
    sessionId: string,
    payload: LogSetPayload,
  ): Promise<{ set: WorkoutSet; is_pr: boolean }> {
    const signature = `${sessionId}:${payload.exercise_id}:${payload.weight_kg}:${payload.reps}:${payload.set_type}`
    const now = performance.now()
    const last = recentSubmissions.get(signature)
    if (last !== undefined && now - last < DUPLICATE_WINDOW_MS) {
      throw new ApiError('That exact set was just logged — check the list before adding it again.', 409)
    }
    recentSubmissions.set(signature, now)

    const { data: session, error: sessionError } = await supabase
      .from('workout_sessions')
      .select('ended_at')
      .eq('id', sessionId)
      .maybeSingle()
    if (sessionError) throw new ApiError(sessionError.message, 500)
    if (!session) throw new ApiError('Workout not found.', 404)
    if (session.ended_at !== null) throw new ApiError('This workout is already finished.', 409)

    const { count } = await supabase
      .from('workout_sets')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('exercise_id', payload.exercise_id)

    const { data: inserted, error: insertError } = await supabase
      .from('workout_sets')
      .insert({
        session_id: sessionId,
        exercise_id: payload.exercise_id,
        set_number: (count ?? 0) + 1,
        weight_kg: payload.weight_kg,
        reps: payload.reps,
        rpe: payload.rpe,
        set_type: payload.set_type,
        notes: payload.notes ?? null,
        is_pr: false,
      })
      .select()
      .single()
    if (insertError) throw new ApiError(insertError.message, 500)

    const recomputed = await recomputeAndPersistPRs()
    const final = recomputed.find((s) => s.id === inserted.id)!
    return { set: final, is_pr: final.is_pr }
  },

  async updateSet(
    _userId: string,
    sessionId: string,
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'rpe' | 'set_type' | 'notes'>>,
  ): Promise<WorkoutSet> {
    // Scoped by session_id too, same as deleteSet -- without it, a set id that
    // happens to belong to one of the caller's *other* sessions would still
    // match (RLS only checks ownership, not which session the caller meant).
    const { error, count } = await supabase
      .from('workout_sets')
      .update(patch, { count: 'exact' })
      .eq('id', setId)
      .eq('session_id', sessionId)
    if (error) throw new ApiError(error.message, 500)
    if (!count) throw new ApiError('Set not found.', 404)
    const recomputed = await recomputeAndPersistPRs()
    return recomputed.find((s) => s.id === setId)!
  },

  /** Scoped by session_id too, mirroring the audit-#1 fix -- RLS already blocks
   * cross-user deletion, but this still guards against deleting the wrong set
   * if a caller's own session/set ids get mismatched. */
  async deleteSet(_userId: string, sessionId: string, setId: string): Promise<void> {
    const { data: target, error: fetchError } = await supabase
      .from('workout_sets')
      .select('exercise_id')
      .eq('id', setId)
      .eq('session_id', sessionId)
      .maybeSingle()
    if (fetchError) throw new ApiError(fetchError.message, 500)
    if (!target) throw new ApiError('Set not found.', 404)

    const { error: deleteError } = await supabase.from('workout_sets').delete().eq('id', setId)
    if (deleteError) throw new ApiError(deleteError.message, 500)

    const { data: remaining, error: remainingError } = await supabase
      .from('workout_sets')
      .select('id, set_number')
      .eq('session_id', sessionId)
      .eq('exercise_id', target.exercise_id)
      .order('set_number')
    if (remainingError) throw new ApiError(remainingError.message, 500)
    const renumbered = (remaining ?? [])
      .map((s, i) => ({ id: s.id, set_number: i + 1 }))
      .filter((s, i) => s.set_number !== remaining![i].set_number)
    // Plain UPDATE per row, not upsert -- see recomputeAndPersistPRs for why.
    const renumberResults = await Promise.all(
      renumbered.map((s) => supabase.from('workout_sets').update({ set_number: s.set_number }).eq('id', s.id)),
    )
    const renumberFailed = renumberResults.find((r) => r.error)
    if (renumberFailed?.error) throw new ApiError(renumberFailed.error.message, 500)

    await recomputeAndPersistPRs()
  },

  async completeSession(_userId: string, sessionId: string, notes: string | null): Promise<SessionDetail> {
    const { count } = await supabase
      .from('workout_sets')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
    if (!count) throw new ApiError('Log at least one set before finishing this workout.', 422)

    const { data, error } = await supabase
      .from('workout_sessions')
      .update({ ended_at: new Date().toISOString(), notes })
      .eq('id', sessionId)
      .select()
      .single()
    if (error) throw new ApiError(error.message, 500)
    return loadSessionDetail(data as WorkoutSession)
  },

  /** Cascades to its sets via ON DELETE CASCADE, then re-runs PR detection
   * since a deleted session's sets may have held PRs later sets should inherit. */
  async discardSession(_userId: string, sessionId: string): Promise<void> {
    const { error } = await supabase.from('workout_sessions').delete().eq('id', sessionId)
    if (error) throw new ApiError(error.message, 500)
    await recomputeAndPersistPRs()
  },

  // --- Analysis -------------------------------------------------------------

  async exerciseHistory(_userId: string, exerciseId: string): Promise<ExerciseHistoryPoint[]> {
    const [sessions, sets] = await Promise.all([fetchSessions(), fetchAllSets()])
    return derive.buildExerciseHistory(sessions, groupSetsBySession(sets), exerciseId)
  },

  async plateauStatus(_userId: string, exerciseId: string): Promise<PlateauStatus | null> {
    const { data: exercise } = await supabase.from('exercises').select('*').eq('id', exerciseId).maybeSingle()
    if (!exercise) return null
    const [sessions, sets] = await Promise.all([fetchSessions(), fetchAllSets()])
    const history = derive.buildExerciseHistory(sessions, groupSetsBySession(sets), exerciseId)
    return derive.buildPlateauStatus(exercise as Exercise, history)
  },

  async plateaus(_userId: string): Promise<PlateauStatus[]> {
    const [sessions, sets, exercises] = await Promise.all([fetchSessions(), fetchAllSets(), fetchExercises()])
    return derive.buildAllPlateaus(sessions, groupSetsBySession(sets), indexById(exercises))
  },

  async weeklyVolume(_userId: string, weeks = 12): Promise<WeeklyVolumePoint[]> {
    const [sessions, sets, exercises] = await Promise.all([fetchSessions(), fetchAllSets(), fetchExercises()])
    return derive.buildWeeklyVolume(sessions, groupSetsBySession(sets), indexById(exercises), weeks)
  },

  async recentPRs(_userId: string, limit = 8): Promise<PersonalRecord[]> {
    const [sessions, exercises, { data: prSets, error }] = await Promise.all([
      fetchSessions(),
      fetchExercises(),
      supabase.from('workout_sets').select('*').eq('is_pr', true),
    ])
    if (error) throw new ApiError(error.message, 500)
    return derive.buildRecentPRs(sessions, indexById(exercises), (prSets ?? []) as WorkoutSet[], limit)
  },
}
