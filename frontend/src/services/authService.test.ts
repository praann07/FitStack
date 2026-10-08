import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegisterPayload } from '@/types'

// Generic Supabase query-builder double: every chainable method returns the
// same object, and awaiting it (via `.then()`) resolves success. signUp()'s
// body_metrics/nutrition_targets/profiles writes only branch on `.error`, and
// `toUser()` tolerates a sparse profile object, so one shape covers all three
// tables -- this test is about call ORDER, not row contents.
function makeBuilder() {
  const builder = {
    upsert: () => builder,
    insert: () => builder,
    update: () => builder,
    eq: () => builder,
    select: () => builder,
    single: () => builder,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: {}, error: null }).then(resolve),
  }
  return builder
}

const { supabaseAuthMock, supabaseFromMock } = vi.hoisted(() => ({
  supabaseAuthMock: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    getSession: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
  },
  supabaseFromMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: supabaseAuthMock, from: supabaseFromMock },
  supabaseUrl: 'https://project.supabase.co',
  supabaseAnonKey: 'anon-key',
}))

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function fakePayload(overrides: Partial<RegisterPayload> = {}): RegisterPayload {
  return {
    email: 'new@example.com',
    password: 'password123',
    full_name: 'New Person',
    goal: 'maintain',
    goal_rate_kg_week: 0,
    height_cm: 170,
    weight_kg: 70,
    age: 30,
    sex: 'male',
    activity_level: 'moderate',
    ...overrides,
  }
}

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseFromMock.mockImplementation(() => makeBuilder())
    supabaseAuthMock.signOut.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('signUp / login close the session only after the notification email settles', () => {
    // Regression test for a bug found in live testing: sendAuthEmail() used
    // to be fire-and-forget, racing supabase.auth.signOut() (which revokes
    // the session server-side) over the network with no ordering guarantee.
    // The fix awaits sendAuthEmail() -- not its result, just its completion
    // -- before either call site signs out.

    it('signUp: does not call signOut() until the welcome email request settles', async () => {
      supabaseAuthMock.signUp.mockResolvedValue({
        data: { user: { id: 'user-1', email: 'new@example.com' }, session: { access_token: 'tok-1' } },
        error: null,
      })
      const emailGate = deferred<Response>()
      const fetchMock = vi.fn(() => emailGate.promise)
      vi.stubGlobal('fetch', fetchMock)

      const { authService } = await import('./authService')
      const signUpPromise = authService.signUp(fakePayload())

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
      expect(supabaseAuthMock.signOut).not.toHaveBeenCalled()

      emailGate.resolve(new Response(null, { status: 200 }))
      await signUpPromise

      expect(supabaseAuthMock.signOut).toHaveBeenCalledTimes(1)
    })

    it('login: does not call signOut() until the login-notification email request settles', async () => {
      supabaseAuthMock.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'tok-2' } },
        error: null,
      })
      const emailGate = deferred<Response>()
      const fetchMock = vi.fn(() => emailGate.promise)
      vi.stubGlobal('fetch', fetchMock)

      const { authService } = await import('./authService')
      const loginPromise = authService.login('person@example.com', 'hunter2')

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
      expect(supabaseAuthMock.signOut).not.toHaveBeenCalled()

      emailGate.resolve(new Response(null, { status: 200 }))
      await loginPromise

      expect(supabaseAuthMock.signOut).toHaveBeenCalledTimes(1)
    })

    it('still signs out and resolves normally when the email request fails', async () => {
      // The "never block signup/login" half of the contract: awaiting the
      // email must not mean a slow/failed send can break signup/login.
      supabaseAuthMock.signUp.mockResolvedValue({
        data: { user: { id: 'user-1', email: 'new@example.com' }, session: { access_token: 'tok-1' } },
        error: null,
      })
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('network down'))),
      )

      const { authService } = await import('./authService')
      const result = await authService.signUp(fakePayload())

      expect(result.user.email).toBe('new@example.com')
      expect(supabaseAuthMock.signOut).toHaveBeenCalledTimes(1)
    })
  })

  describe('signUp', () => {
    it('throws without calling signOut when Supabase rejects the signup itself', async () => {
      supabaseAuthMock.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered', status: 422 },
      })

      const { authService } = await import('./authService')

      await expect(authService.signUp(fakePayload())).rejects.toThrow('User already registered')
      expect(supabaseAuthMock.signOut).not.toHaveBeenCalled()
    })
  })

  describe('login', () => {
    it('throws on a wrong password without calling signOut or sending a notification', async () => {
      supabaseAuthMock.signInWithPassword.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid login credentials', status: 400 },
      })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const { authService } = await import('./authService')

      await expect(authService.login('person@example.com', 'wrong')).rejects.toThrow('Invalid login credentials')
      expect(supabaseAuthMock.signOut).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('verifyLoginCode', () => {
    it('throws on an invalid code without touching profiles', async () => {
      supabaseAuthMock.verifyOtp.mockResolvedValue({
        data: { user: null },
        error: { message: 'Token has expired or is invalid', status: 403 },
      })

      const { authService } = await import('./authService')

      await expect(authService.verifyLoginCode('person@example.com', '000000')).rejects.toThrow(
        'Token has expired or is invalid',
      )
      expect(supabaseFromMock).not.toHaveBeenCalled()
    })
  })
})
