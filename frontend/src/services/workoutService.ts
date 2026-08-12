import { request } from './client'
import type {
  Exercise,
  ExerciseHistoryPoint,
  MuscleGroup,
  PersonalRecord,
  PlateauStatus,
  RoutineDetail,
  SessionDetail,
  SessionSummary,
  SetType,
  WeeklyVolumePoint,
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

/**
 * Workout service (Phase 2 — real backend).
 *
 * `userId` parameters are kept in every signature so call sites elsewhere in
 * the app don't need to change, but they're unused here: the backend infers
 * the current user from the access token, not from a request param.
 */
export const workoutService = {
  // --- Exercises ------------------------------------------------------------

  /** GET /api/v1/exercises?muscle_group= */
  listExercises(
    _userId: string,
    filters?: { muscle_group?: MuscleGroup; search?: string },
  ): Promise<Exercise[]> {
    return request<Exercise[]>('GET', '/exercises', undefined, {
      query: { muscle_group: filters?.muscle_group, search: filters?.search },
    })
  },

  /** POST /api/v1/exercises */
  createExercise(
    _userId: string,
    payload: { name: string; muscle_group: MuscleGroup; equipment: Exercise['equipment'] },
  ): Promise<Exercise> {
    return request<Exercise>('POST', '/exercises', payload)
  },

  /** Exercises the user has actually trained — powers the progression picker. */
  trainedExercises(_userId: string): Promise<Exercise[]> {
    return request<Exercise[]>('GET', '/exercises', undefined, { query: { trained: true } })
  },

  /** Last performance of an exercise — shown as "previous" hints while logging. */
  lastPerformance(
    _userId: string,
    exerciseId: string,
    excludeSessionId?: string,
  ): Promise<{ date: string; sets: WorkoutSet[] } | null> {
    return request<{ date: string; sets: WorkoutSet[] } | null>(
      'GET',
      `/exercises/${exerciseId}/last`,
      undefined,
      { query: { exclude_session_id: excludeSessionId } },
    )
  },

  // --- Routines -------------------------------------------------------------

  /** GET /api/v1/routines */
  listRoutines(_userId: string): Promise<RoutineDetail[]> {
    return request<RoutineDetail[]>('GET', '/routines')
  },

  getRoutine(_userId: string, routineId: string): Promise<RoutineDetail> {
    return request<RoutineDetail>('GET', `/routines/${routineId}`)
  },

  /** POST /api/v1/routines */
  createRoutine(_userId: string, input: RoutineInput): Promise<RoutineDetail> {
    return request<RoutineDetail>('POST', '/routines', input)
  },

  /** PUT /api/v1/routines/{id} */
  updateRoutine(_userId: string, routineId: string, input: RoutineInput): Promise<RoutineDetail> {
    return request<RoutineDetail>('PUT', `/routines/${routineId}`, input)
  },

  /** DELETE /api/v1/routines/{id} — history keeps its sessions, reference nulled. */
  deleteRoutine(_userId: string, routineId: string): Promise<void> {
    return request<void>('DELETE', `/routines/${routineId}`)
  },

  // --- Sessions -------------------------------------------------------------

  /** GET /api/v1/workouts?from=&to= */
  listSessions(
    _userId: string,
    filters?: { from?: string; to?: string; limit?: number },
  ): Promise<SessionSummary[]> {
    return request<SessionSummary[]>('GET', '/workouts', undefined, {
      query: { from: filters?.from, to: filters?.to, limit: filters?.limit },
    })
  },

  /** GET /api/v1/workouts/{id} */
  getSession(_userId: string, sessionId: string): Promise<SessionDetail> {
    return request<SessionDetail>('GET', `/workouts/${sessionId}`)
  },

  /** An unfinished session (ended_at IS NULL) — resumed on load. */
  getActiveSession(_userId: string): Promise<SessionDetail | null> {
    return request<SessionDetail | null>('GET', '/workouts/active')
  },

  /** POST /api/v1/workouts */
  startSession(_userId: string, routineId: string | null): Promise<SessionDetail> {
    return request<SessionDetail>('POST', '/workouts', { routine_id: routineId })
  },

  /** POST /api/v1/workouts/{id}/sets */
  logSet(
    _userId: string,
    sessionId: string,
    payload: LogSetPayload,
  ): Promise<{ set: WorkoutSet; is_pr: boolean }> {
    return request<{ set: WorkoutSet; is_pr: boolean }>('POST', `/workouts/${sessionId}/sets`, payload)
  },

  /** PATCH /api/v1/workouts/{id}/sets/{set_id} — re-runs PR detection. */
  updateSet(
    _userId: string,
    sessionId: string,
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'rpe' | 'set_type' | 'notes'>>,
  ): Promise<WorkoutSet> {
    return request<WorkoutSet>('PATCH', `/workouts/${sessionId}/sets/${setId}`, patch)
  },

  /** DELETE /api/v1/workouts/{id}/sets/{set_id} — resequences and re-runs PRs. */
  deleteSet(_userId: string, sessionId: string, setId: string): Promise<void> {
    return request<void>('DELETE', `/workouts/${sessionId}/sets/${setId}`)
  },

  /** PATCH /api/v1/workouts/{id}/complete */
  completeSession(_userId: string, sessionId: string, notes: string | null): Promise<SessionDetail> {
    return request<SessionDetail>('PATCH', `/workouts/${sessionId}/complete`, { notes })
  },

  /** DELETE /api/v1/workouts/{id} — abandon an in-progress session. */
  discardSession(_userId: string, sessionId: string): Promise<void> {
    return request<void>('DELETE', `/workouts/${sessionId}`)
  },

  // --- Analysis -------------------------------------------------------------

  /** GET /api/v1/exercises/{id}/history */
  exerciseHistory(_userId: string, exerciseId: string): Promise<ExerciseHistoryPoint[]> {
    return request<ExerciseHistoryPoint[]>('GET', `/exercises/${exerciseId}/history`)
  },

  /** GET /api/v1/exercises/{id}/plateau-status */
  plateauStatus(_userId: string, exerciseId: string): Promise<PlateauStatus | null> {
    return request<PlateauStatus | null>('GET', `/exercises/${exerciseId}/plateau-status`)
  },

  plateaus(_userId: string): Promise<PlateauStatus[]> {
    return request<PlateauStatus[]>('GET', '/exercises/plateau-status')
  },

  /** GET /api/v1/volume/weekly?muscle_group= */
  weeklyVolume(_userId: string, weeks = 12): Promise<WeeklyVolumePoint[]> {
    return request<WeeklyVolumePoint[]>('GET', '/volume/weekly', undefined, { query: { weeks } })
  },

  recentPRs(_userId: string, limit = 8): Promise<PersonalRecord[]> {
    return request<PersonalRecord[]>('GET', '/workouts/prs', undefined, { query: { limit } })
  },
}
