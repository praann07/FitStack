import { request, setAccessToken } from './client'
import type { AuthSession, Goal, RegisterPayload, User } from '@/types'

interface TokenResponseDTO {
  access_token: string
  token_type: string
  user: User
}

/**
 * Auth service (Phase 2 — real backend).
 *
 * The access token lives in memory (`client.ts`); the refresh token is an
 * httpOnly cookie the browser manages on its own. `restore()` exchanges
 * that cookie for a fresh access token on app boot.
 */
export const authService = {
  /** POST /api/v1/auth/login */
  async login(email: string, password: string): Promise<AuthSession> {
    const data = await request<TokenResponseDTO>(
      'POST',
      '/auth/login',
      { email, password },
      { skipAuth: true },
    )
    setAccessToken(data.access_token)
    return { access_token: data.access_token, user: data.user }
  },

  /** POST /api/v1/auth/register */
  async register(payload: RegisterPayload): Promise<AuthSession> {
    const data = await request<TokenResponseDTO>('POST', '/auth/register', payload, { skipAuth: true })
    setAccessToken(data.access_token)
    return { access_token: data.access_token, user: data.user }
  },

  /** Exchanges the httpOnly refresh cookie for a fresh access token on boot. */
  async restore(): Promise<AuthSession | null> {
    try {
      const data = await request<TokenResponseDTO>('POST', '/auth/refresh', undefined, {
        skipAuth: true,
        skipRefresh: true,
      })
      setAccessToken(data.access_token)
      return { access_token: data.access_token, user: data.user }
    } catch {
      return null
    }
  },

  /** POST /api/v1/auth/logout */
  async logout(): Promise<void> {
    try {
      await request<void>('POST', '/auth/logout')
    } finally {
      setAccessToken(null)
    }
  },

  /** PATCH /api/v1/users/me — profile + goal changes. */
  updateProfile(
    _userId: string,
    patch: Partial<Pick<User, 'full_name' | 'goal' | 'goal_rate_kg_week' | 'height_cm'>>,
  ): Promise<User> {
    return request<User>('PATCH', '/auth/me', patch)
  },

  goalRateDefault(goal: Goal): number {
    if (goal === 'bulk') return 0.25
    if (goal === 'cut') return -0.5
    return 0
  },
}
