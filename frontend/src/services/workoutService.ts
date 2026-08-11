import { apiCall } from './client'
import { getDb, mutate } from './db'
import {
  buildAllPlateaus,
  buildExerciseHistory,
  buildPlateauStatus,
  buildRecentPRs,
  buildSessionDetail,
  buildSessionSummary,
  buildWeeklyVolume,
  sessionSets,
  userSessions,
  userSets,
} from './derive'
import { generateId, markPersonalRecords } from '@/mock/seed'
import { today } from '@/lib/date'
import { ApiError } from '@/types'
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

/** Guards against double-tap duplicates (system design §10). */
const recentSubmissions = new Map<string, number>()
const DUPLICATE_WINDOW_MS = 2500

function recomputePrs(userId: string): void {
  mutate((db) => {
    const sessions = db.sessions.filter((s) => s.user_id === userId)
    const ids = new Set(sessions.map((s) => s.id))
    markPersonalRecords(
      db.sets.filter((s) => ids.has(s.session_id)),
      sessions,
    )
  })
}

export const workoutService = {
  // --- Exercises ------------------------------------------------------------

  /** GET /api/v1/exercises?muscle_group= */
  listExercises(userId: string, filters?: { muscle_group?: MuscleGroup; search?: string }): Promise<Exercise[]> {
    return apiCall('GET /exercises', () => {
      const db = getDb()
      const search = filters?.search?.trim().toLowerCase()
      return db.exercises
        .filter((e) => e.created_by === null || e.created_by === userId)
        .filter((e) => !filters?.muscle_group || e.muscle_group === filters.muscle_group)
        .filter((e) => !search || e.name.toLowerCase().includes(search))
        .sort((a, b) => a.name.localeCompare(b.name))
    })
  },

  /** POST /api/v1/exercises */
  createExercise(
    userId: string,
    payload: { name: string; muscle_group: MuscleGroup; equipment: Exercise['equipment'] },
  ): Promise<Exercise> {
    return apiCall('POST /exercises', () =>
      mutate((db) => {
        const name = payload.name.trim()
        const clash = db.exercises.find(
          (e) =>
            e.name.toLowerCase() === name.toLowerCase() &&
            (e.created_by === null || e.created_by === userId),
        )
        if (clash) throw new ApiError('You already have an exercise with that name.', 409, 'name')
        const exercise: Exercise = {
          id: generateId('ex'),
          name,
          muscle_group: payload.muscle_group,
          equipment: payload.equipment,
          is_custom: true,
          created_by: userId,
        }
        db.exercises.push(exercise)
        return exercise
      }),
    )
  },

  // --- Routines -------------------------------------------------------------

  /** GET /api/v1/routines */
  listRoutines(userId: string): Promise<RoutineDetail[]> {
    return apiCall('GET /routines', () => {
      const db = getDb()
      const exById = new Map(db.exercises.map((e) => [e.id, e]))
      return db.routines
        .filter((r) => r.user_id === userId)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((routine) => ({
          ...routine,
          exercises: db.routineExercises
            .filter((re) => re.routine_id === routine.id)
            .sort((a, b) => a.order_index - b.order_index)
            .flatMap((re) => {
              const exercise = exById.get(re.exercise_id)
              return exercise ? [{ ...re, exercise }] : []
            }),
        }))
    })
  },

  getRoutine(userId: string, routineId: string): Promise<RoutineDetail> {
    return apiCall('GET /routines/{id}', () => {
      const db = getDb()
      const routine = db.routines.find((r) => r.id === routineId && r.user_id === userId)
      if (!routine) throw new ApiError('Routine not found.', 404)
      const exById = new Map(db.exercises.map((e) => [e.id, e]))
      return {
        ...routine,
        exercises: db.routineExercises
          .filter((re) => re.routine_id === routine.id)
          .sort((a, b) => a.order_index - b.order_index)
          .flatMap((re) => {
            const exercise = exById.get(re.exercise_id)
            return exercise ? [{ ...re, exercise }] : []
          }),
      }
    })
  },

  /** POST /api/v1/routines */
  createRoutine(userId: string, input: RoutineInput): Promise<RoutineDetail> {
    return apiCall('POST /routines', () =>
      mutate((db) => {
        const now = new Date().toISOString()
        const routineId = generateId('rt')
        db.routines.push({
          id: routineId,
          user_id: userId,
          name: input.name.trim(),
          notes: input.notes,
          created_at: now,
          updated_at: now,
        })
        // order_index is written as one contiguous sequence — no gaps.
        input.exercises.forEach((ex, index) => {
          db.routineExercises.push({ id: generateId('rex'), routine_id: routineId, order_index: index, ...ex })
        })
        const exById = new Map(db.exercises.map((e) => [e.id, e]))
        const routine = db.routines.find((r) => r.id === routineId)!
        return {
          ...routine,
          exercises: db.routineExercises
            .filter((re) => re.routine_id === routineId)
            .sort((a, b) => a.order_index - b.order_index)
            .flatMap((re) => {
              const exercise = exById.get(re.exercise_id)
              return exercise ? [{ ...re, exercise }] : []
            }),
        }
      }),
    )
  },

  /** PUT /api/v1/routines/{id} */
  updateRoutine(userId: string, routineId: string, input: RoutineInput): Promise<RoutineDetail> {
    return apiCall('PUT /routines/{id}', () =>
      mutate((db) => {
        const routine = db.routines.find((r) => r.id === routineId && r.user_id === userId)
        if (!routine) throw new ApiError('Routine not found.', 404)
        routine.name = input.name.trim()
        routine.notes = input.notes
        routine.updated_at = new Date().toISOString()
        db.routineExercises = db.routineExercises.filter((re) => re.routine_id !== routineId)
        input.exercises.forEach((ex, index) => {
          db.routineExercises.push({ id: generateId('rex'), routine_id: routineId, order_index: index, ...ex })
        })
        const exById = new Map(db.exercises.map((e) => [e.id, e]))
        return {
          ...routine,
          exercises: db.routineExercises
            .filter((re) => re.routine_id === routineId)
            .sort((a, b) => a.order_index - b.order_index)
            .flatMap((re) => {
              const exercise = exById.get(re.exercise_id)
              return exercise ? [{ ...re, exercise }] : []
            }),
        }
      }),
    )
  },

  /** DELETE /api/v1/routines/{id} — history keeps its sessions, reference nulled. */
  deleteRoutine(userId: string, routineId: string): Promise<void> {
    return apiCall('DELETE /routines/{id}', () =>
      mutate((db) => {
        const routine = db.routines.find((r) => r.id === routineId && r.user_id === userId)
        if (!routine) throw new ApiError('Routine not found.', 404)
        db.routines = db.routines.filter((r) => r.id !== routineId)
        db.routineExercises = db.routineExercises.filter((re) => re.routine_id !== routineId)
        db.sessions.forEach((s) => {
          if (s.routine_id === routineId) s.routine_id = null
        })
      }),
    )
  },

  // --- Sessions -------------------------------------------------------------

  /** GET /api/v1/workouts?from=&to= */
  listSessions(
    userId: string,
    filters?: { from?: string; to?: string; limit?: number },
  ): Promise<SessionSummary[]> {
    return apiCall('GET /workouts', () => {
      const db = getDb()
      return userSessions(db, userId)
        .filter((s) => s.ended_at !== null)
        .filter((s) => !filters?.from || s.session_date >= filters.from)
        .filter((s) => !filters?.to || s.session_date <= filters.to)
        .slice(0, filters?.limit ?? 500)
        .map((s) => buildSessionSummary(db, s))
    })
  },

  /** GET /api/v1/workouts/{id} */
  getSession(userId: string, sessionId: string): Promise<SessionDetail> {
    return apiCall('GET /workouts/{id}', () => {
      const db = getDb()
      const session = db.sessions.find((s) => s.id === sessionId && s.user_id === userId)
      if (!session) throw new ApiError('Workout not found.', 404)
      return buildSessionDetail(db, session)
    })
  },

  /** An unfinished session (ended_at IS NULL) — resumed on load. */
  getActiveSession(userId: string): Promise<SessionDetail | null> {
    return apiCall('GET /workouts?active=true', () => {
      const db = getDb()
      const session = db.sessions.find((s) => s.user_id === userId && s.ended_at === null)
      return session ? buildSessionDetail(db, session) : null
    })
  },

  /** POST /api/v1/workouts */
  startSession(userId: string, routineId: string | null): Promise<SessionDetail> {
    return apiCall('POST /workouts', () =>
      mutate((db) => {
        if (db.sessions.some((s) => s.user_id === userId && s.ended_at === null)) {
          throw new ApiError('You already have a workout in progress.', 409)
        }
        const session = {
          id: generateId('ws'),
          user_id: userId,
          routine_id: routineId,
          session_date: today(),
          notes: null,
          started_at: new Date().toISOString(),
          ended_at: null,
        }
        db.sessions.push(session)
        return buildSessionDetail(db, session)
      }),
    )
  },

  /** POST /api/v1/workouts/{id}/sets */
  logSet(
    userId: string,
    sessionId: string,
    payload: LogSetPayload,
  ): Promise<{ set: WorkoutSet; is_pr: boolean }> {
    return apiCall('POST /workouts/{id}/sets', () => {
      const signature = `${sessionId}:${payload.exercise_id}:${payload.weight_kg}:${payload.reps}:${payload.set_type}`
      const last = recentSubmissions.get(signature)
      if (last && Date.now() - last < DUPLICATE_WINDOW_MS) {
        throw new ApiError('That exact set was just logged — check the list before adding it again.', 409)
      }
      recentSubmissions.set(signature, Date.now())

      const result = mutate((db) => {
        const session = db.sessions.find((s) => s.id === sessionId && s.user_id === userId)
        if (!session) throw new ApiError('Workout not found.', 404)
        if (session.ended_at) throw new ApiError('This workout is already finished.', 409)

        const existing = db.sets.filter(
          (s) => s.session_id === sessionId && s.exercise_id === payload.exercise_id,
        )
        const set: WorkoutSet = {
          id: generateId('set'),
          session_id: sessionId,
          exercise_id: payload.exercise_id,
          set_number: existing.length + 1,
          weight_kg: payload.weight_kg,
          reps: payload.reps,
          rpe: payload.rpe,
          set_type: payload.set_type,
          notes: payload.notes ?? null,
          is_pr: false,
        }
        db.sets.push(set)
        return set
      })

      recomputePrs(userId)
      const stored = getDb().sets.find((s) => s.id === result.id)!
      return { set: { ...stored }, is_pr: stored.is_pr }
    })
  },

  /** PATCH /api/v1/workouts/{id}/sets/{set_id} — re-runs PR detection. */
  updateSet(
    userId: string,
    sessionId: string,
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'rpe' | 'set_type' | 'notes'>>,
  ): Promise<WorkoutSet> {
    return apiCall('PATCH /workouts/{id}/sets/{set_id}', () => {
      mutate((db) => {
        const session = db.sessions.find((s) => s.id === sessionId && s.user_id === userId)
        if (!session) throw new ApiError('Workout not found.', 404)
        const set = db.sets.find((s) => s.id === setId && s.session_id === sessionId)
        if (!set) throw new ApiError('Set not found.', 404)
        Object.assign(set, patch)
      })
      recomputePrs(userId)
      return { ...getDb().sets.find((s) => s.id === setId)! }
    })
  },

  /** DELETE /api/v1/workouts/{id}/sets/{set_id} — resequences and re-runs PRs. */
  deleteSet(userId: string, sessionId: string, setId: string): Promise<void> {
    return apiCall('DELETE /workouts/{id}/sets/{set_id}', () => {
      mutate((db) => {
        const session = db.sessions.find((s) => s.id === sessionId && s.user_id === userId)
        if (!session) throw new ApiError('Workout not found.', 404)
        const target = db.sets.find((s) => s.id === setId)
        if (!target) throw new ApiError('Set not found.', 404)
        db.sets = db.sets.filter((s) => s.id !== setId)
        db.sets
          .filter((s) => s.session_id === sessionId && s.exercise_id === target.exercise_id)
          .sort((a, b) => a.set_number - b.set_number)
          .forEach((s, i) => {
            s.set_number = i + 1
          })
      })
      recomputePrs(userId)
    })
  },

  /** PATCH /api/v1/workouts/{id}/complete */
  completeSession(userId: string, sessionId: string, notes: string | null): Promise<SessionDetail> {
    return apiCall('PATCH /workouts/{id}/complete', () =>
      mutate((db) => {
        const session = db.sessions.find((s) => s.id === sessionId && s.user_id === userId)
        if (!session) throw new ApiError('Workout not found.', 404)
        if (sessionSets(db, sessionId).length === 0) {
          throw new ApiError('Log at least one set before finishing this workout.', 422)
        }
        session.ended_at = new Date().toISOString()
        session.notes = notes
        return buildSessionDetail(db, session)
      }),
    )
  },

  /** DELETE /api/v1/workouts/{id} — abandon an in-progress session. */
  discardSession(userId: string, sessionId: string): Promise<void> {
    return apiCall('DELETE /workouts/{id}', () => {
      mutate((db) => {
        const session = db.sessions.find((s) => s.id === sessionId && s.user_id === userId)
        if (!session) throw new ApiError('Workout not found.', 404)
        db.sessions = db.sessions.filter((s) => s.id !== sessionId)
        db.sets = db.sets.filter((s) => s.session_id !== sessionId)
      })
      recomputePrs(userId)
    })
  },

  // --- Analysis -------------------------------------------------------------

  /** GET /api/v1/exercises/{id}/history */
  exerciseHistory(userId: string, exerciseId: string): Promise<ExerciseHistoryPoint[]> {
    return apiCall('GET /exercises/{id}/history', () =>
      buildExerciseHistory(getDb(), userId, exerciseId),
    )
  },

  /** GET /api/v1/exercises/{id}/plateau-status */
  plateauStatus(userId: string, exerciseId: string): Promise<PlateauStatus | null> {
    return apiCall('GET /exercises/{id}/plateau-status', () =>
      buildPlateauStatus(getDb(), userId, exerciseId),
    )
  },

  plateaus(userId: string): Promise<PlateauStatus[]> {
    return apiCall('GET /exercises/plateau-status', () => buildAllPlateaus(getDb(), userId))
  },

  /** GET /api/v1/volume/weekly?muscle_group= */
  weeklyVolume(userId: string, weeks = 12): Promise<WeeklyVolumePoint[]> {
    return apiCall('GET /volume/weekly', () => buildWeeklyVolume(getDb(), userId, weeks))
  },

  recentPRs(userId: string, limit = 8): Promise<PersonalRecord[]> {
    return apiCall('GET /workouts/prs', () => buildRecentPRs(getDb(), userId, limit))
  },

  /** Exercises the user has actually trained — powers the progression picker. */
  trainedExercises(userId: string): Promise<Exercise[]> {
    return apiCall('GET /exercises?trained=true', () => {
      const db = getDb()
      const ids = new Set(userSets(db, userId).map((s) => s.exercise_id))
      return db.exercises.filter((e) => ids.has(e.id)).sort((a, b) => a.name.localeCompare(b.name))
    })
  },

  /** Last performance of an exercise — shown as "previous" hints while logging. */
  lastPerformance(
    userId: string,
    exerciseId: string,
    excludeSessionId?: string,
  ): Promise<{ date: string; sets: WorkoutSet[] } | null> {
    return apiCall('GET /exercises/{id}/last', () => {
      const db = getDb()
      const sessions = userSessions(db, userId).filter((s) => s.id !== excludeSessionId)
      for (const session of sessions) {
        const sets = db.sets
          .filter((s) => s.session_id === session.id && s.exercise_id === exerciseId)
          .sort((a, b) => a.set_number - b.set_number)
        if (sets.length > 0) return { date: session.session_date, sets }
      }
      return null
    })
  },
}
