import { apiCall } from './client'
import { getDb, mutate } from './db'
import { createNewUserData } from '@/mock/seed'
import { mifflinStJeor } from '@/lib/adaptive'
import { ApiError } from '@/types'
import type { AuthSession, Goal, RegisterPayload, User } from '@/types'

const SESSION_KEY = 'fitstack.session'

interface StoredSession {
  access_token: string
  user_id: string
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

function writeStoredSession(session: StoredSession | null): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(SESSION_KEY)
}

/**
 * Auth service.
 *
 * Phase 1 keeps a fake token in localStorage purely so the routing/guard
 * behaviour is real. Phase 2 replaces the bodies with the documented calls:
 * the access token moves to memory and the refresh token to an httpOnly
 * cookie, with rotation handled by an interceptor around `apiCall`.
 */
export const authService = {
  /** POST /api/v1/auth/login */
  login(email: string, password: string): Promise<AuthSession> {
    return apiCall('POST /auth/login', () => {
      const db = getDb()
      const normalised = email.trim().toLowerCase()
      const user = db.users.find((u) => u.email.toLowerCase() === normalised)
      if (!user) throw new ApiError('No account found with that email address.', 401, 'email')
      if (db.credentials[user.email] !== password) {
        throw new ApiError('That password is incorrect.', 401, 'password')
      }
      const session = { access_token: `mock.${user.id}.${Date.now()}`, user_id: user.id }
      writeStoredSession(session)
      return { access_token: session.access_token, user }
    })
  },

  /** POST /api/v1/auth/register */
  register(payload: RegisterPayload): Promise<AuthSession> {
    return apiCall('POST /auth/register', () =>
      mutate((db) => {
        const normalised = payload.email.trim().toLowerCase()
        if (db.users.some((u) => u.email.toLowerCase() === normalised)) {
          throw new ApiError('An account with that email already exists.', 409, 'email')
        }
        const user: User = {
          id: `usr-${Date.now().toString(36)}`,
          email: payload.email.trim(),
          full_name: payload.full_name.trim(),
          goal: payload.goal,
          goal_rate_kg_week: payload.goal_rate_kg_week,
          height_cm: payload.height_cm,
          created_at: new Date().toISOString(),
        }
        db.users.push(user)
        db.credentials[user.email] = payload.password

        // No history yet -> Mifflin-St Jeor baseline until 7+ days of data exist.
        const baseline = mifflinStJeor({
          weight_kg: payload.weight_kg,
          height_cm: payload.height_cm,
          age: payload.age,
          sex: payload.sex,
          activity_level: payload.activity_level,
        })
        const { bodyMetric, target } = createNewUserData(user, payload.weight_kg, baseline)
        db.bodyMetrics.push(bodyMetric)
        db.nutritionTargets.push(target)

        const session = { access_token: `mock.${user.id}.${Date.now()}`, user_id: user.id }
        writeStoredSession(session)
        return { access_token: session.access_token, user }
      }),
    )
  },

  /** Resolves the stored session on boot. Phase 2: POST /auth/refresh */
  restore(): Promise<AuthSession | null> {
    return apiCall('POST /auth/refresh', () => {
      const stored = readStoredSession()
      if (!stored) return null
      const user = getDb().users.find((u) => u.id === stored.user_id)
      if (!user) {
        writeStoredSession(null)
        return null
      }
      return { access_token: stored.access_token, user }
    })
  },

  /** POST /api/v1/auth/logout */
  logout(): Promise<void> {
    return apiCall('POST /auth/logout', () => {
      writeStoredSession(null)
    })
  },

  /** PATCH /api/v1/users/me — profile + goal changes. */
  updateProfile(
    userId: string,
    patch: Partial<Pick<User, 'full_name' | 'goal' | 'goal_rate_kg_week' | 'height_cm'>>,
  ): Promise<User> {
    return apiCall('PATCH /users/me', () =>
      mutate((db) => {
        const user = db.users.find((u) => u.id === userId)
        if (!user) throw new ApiError('Account not found.', 404)
        const goalChanged = patch.goal !== undefined && patch.goal !== user.goal
        Object.assign(user, patch)
        if (goalChanged) {
          // Switching goal resets the adaptive window instead of blending
          // old- and new-goal data (system design §10).
          db.tdeeEstimates = db.tdeeEstimates.filter((t) => t.user_id !== userId)
          db.dismissedSuggestions = []
        }
        return { ...user }
      }),
    )
  },

  goalRateDefault(goal: Goal): number {
    if (goal === 'bulk') return 0.25
    if (goal === 'cut') return -0.5
    return 0
  },
}
