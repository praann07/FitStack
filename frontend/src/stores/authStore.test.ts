import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession, RegisterPayload, User } from '@/types'
import { ApiError } from '@/types'

const { authServiceMock, authStateHandlers, triggerAuthEvent } = vi.hoisted(() => {
  const handlers: Array<(event: string) => void> = []
  return {
    authServiceMock: {
      signUp: vi.fn(),
      login: vi.fn(),
      sendLoginCode: vi.fn(),
      verifyLoginCode: vi.fn(),
      restore: vi.fn(),
      logout: vi.fn(),
    },
    authStateHandlers: handlers,
    triggerAuthEvent: (event: string) => handlers.forEach((h) => h(event)),
  }
})

vi.mock('@/services', () => ({ authService: authServiceMock }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string) => void) => {
        authStateHandlers.push(cb)
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  },
}))

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'person@example.com',
    full_name: 'Test Person',
    goal: 'maintain',
    goal_rate_kg_week: 0,
    height_cm: 170,
    created_at: '2026-01-01T00:00:00Z',
    approved: true,
    role: 'user',
    timezone: 'UTC',
    ...overrides,
  }
}

function fakeRegisterPayload(overrides: Partial<RegisterPayload> = {}): RegisterPayload {
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

// `useAuthStore` wires up supabase.auth.onAuthStateChange and the
// suppressAuthEvents closure once, at module-eval time -- every test needs a
// fresh module instance (same convention as services/queries.test.ts) so
// mock call counts and the registered listener don't leak across cases.
async function freshStore() {
  vi.resetModules()
  authStateHandlers.length = 0
  const mod = await import('./authStore')
  return mod.useAuthStore
}

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('restore', () => {
    it('authenticates an approved user with a live session', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.restore.mockResolvedValue({ user: fakeUser({ approved: true }) } satisfies AuthSession)

      await useAuthStore.getState().restore()

      expect(useAuthStore.getState().status).toBe('authenticated')
      expect(useAuthStore.getState().user?.approved).toBe(true)
    })

    it('routes an unapproved user with a live session to pending_approval, not authenticated', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.restore.mockResolvedValue({ user: fakeUser({ approved: false }) } satisfies AuthSession)

      await useAuthStore.getState().restore()

      expect(useAuthStore.getState().status).toBe('pending_approval')
    })

    it('goes anonymous when there is no live session and nothing pending', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.restore.mockResolvedValue(null)

      await useAuthStore.getState().restore()

      expect(useAuthStore.getState().status).toBe('anonymous')
    })

    it('falls back to anonymous when authService.restore() throws', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.restore.mockRejectedValue(new Error('network down'))

      await useAuthStore.getState().restore()

      expect(useAuthStore.getState().status).toBe('anonymous')
    })

    it('recovers pending_verification from sessionStorage when a reload lands with no live session', async () => {
      const store = new Map<string, string>()
      vi.stubGlobal('sessionStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      })
      store.set('fitstack_pending_email', 'mid-verify@example.com')

      const useAuthStore = await freshStore()
      authServiceMock.restore.mockResolvedValue(null)

      await useAuthStore.getState().restore()

      // This is the exact case the comment in authStore.ts calls out: the
      // password step already succeeded, so a reload must not bounce the
      // user back to /login and make them re-enter their password.
      expect(useAuthStore.getState().status).toBe('pending_verification')
      expect(useAuthStore.getState().pendingEmail).toBe('mid-verify@example.com')
      expect(useAuthStore.getState().codeSentAt).toBeNull()
    })
  })

  describe('register', () => {
    it('lands on pending_verification with the signup email, never authenticated directly', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.signUp.mockResolvedValue({ user: fakeUser({ approved: true }) } satisfies AuthSession)
      authServiceMock.sendLoginCode.mockResolvedValue(undefined)
      const payload = fakeRegisterPayload({ email: 'new@example.com' })

      await useAuthStore.getState().register(payload)

      const state = useAuthStore.getState()
      expect(state.status).toBe('pending_verification')
      expect(state.pendingEmail).toBe('new@example.com')
      expect(state.user).toBeNull() // creating the account proves nothing yet
      expect(authServiceMock.sendLoginCode).toHaveBeenCalledWith('new@example.com')
    })

    it('sets codeSentAt on a successful send', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.signUp.mockResolvedValue({ user: fakeUser() } satisfies AuthSession)
      authServiceMock.sendLoginCode.mockResolvedValue(undefined)

      await useAuthStore.getState().register(fakeRegisterPayload())

      expect(useAuthStore.getState().codeSentAt).not.toBeNull()
    })

    it('still lands on pending_verification, with codeSentAt null, when the send fails', async () => {
      // trySend()'s whole job: a transient send failure must not strand the
      // caller on the register form. VerifyCodePage relies on codeSentAt
      // being null to trigger its own resend-on-mount.
      const useAuthStore = await freshStore()
      authServiceMock.signUp.mockResolvedValue({ user: fakeUser() } satisfies AuthSession)
      authServiceMock.sendLoginCode.mockRejectedValue(new ApiError('cooldown', 429))

      await useAuthStore.getState().register(fakeRegisterPayload())

      const state = useAuthStore.getState()
      expect(state.status).toBe('pending_verification')
      expect(state.codeSentAt).toBeNull()
    })

    it('propagates a signUp failure and never reaches pending_verification', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.signUp.mockRejectedValue(new ApiError('Email already registered', 400))

      await expect(useAuthStore.getState().register(fakeRegisterPayload())).rejects.toThrow(
        'Email already registered',
      )
      expect(useAuthStore.getState().status).not.toBe('pending_verification')
      expect(authServiceMock.sendLoginCode).not.toHaveBeenCalled()
    })

    it('never emits anonymous for the SIGNED_OUT event signUp() fires internally', async () => {
      // authService.signUp() closes the password-only session with signOut()
      // before returning (see authService.ts), which fires the same
      // SIGNED_OUT event logout() does. Regression target: that event must
      // not flip this store to 'anonymous', not even transiently -- any
      // component subscribed to `status` (e.g. RequireAuth) would otherwise
      // redirect to /login mid-signup for one render.
      const useAuthStore = await freshStore()
      authServiceMock.signUp.mockImplementation(async () => {
        triggerAuthEvent('SIGNED_OUT') // simulates the internal signOut() call
        return { user: fakeUser() } satisfies AuthSession
      })
      authServiceMock.sendLoginCode.mockResolvedValue(undefined)

      const seenStatuses: string[] = []
      const unsubscribe = useAuthStore.subscribe((state) => seenStatuses.push(state.status))

      await useAuthStore.getState().register(fakeRegisterPayload())
      unsubscribe()

      expect(seenStatuses).not.toContain('anonymous')
      expect(useAuthStore.getState().status).toBe('pending_verification')
    })
  })

  describe('login', () => {
    it('lands on pending_verification with the login email, never authenticated directly', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.login.mockResolvedValue(undefined)
      authServiceMock.sendLoginCode.mockResolvedValue(undefined)

      await useAuthStore.getState().login('person@example.com', 'hunter2')

      const state = useAuthStore.getState()
      expect(state.status).toBe('pending_verification')
      expect(state.pendingEmail).toBe('person@example.com')
      expect(authServiceMock.sendLoginCode).toHaveBeenCalledWith('person@example.com')
    })

    it('propagates a wrong-password failure and never reaches pending_verification', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.login.mockRejectedValue(new ApiError('Invalid credentials', 401))

      await expect(useAuthStore.getState().login('person@example.com', 'wrong')).rejects.toThrow(
        'Invalid credentials',
      )
      expect(useAuthStore.getState().status).not.toBe('pending_verification')
    })

    it('never emits anonymous for the SIGNED_OUT event login() fires internally', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.login.mockImplementation(async () => {
        triggerAuthEvent('SIGNED_OUT')
      })
      authServiceMock.sendLoginCode.mockResolvedValue(undefined)

      const seenStatuses: string[] = []
      const unsubscribe = useAuthStore.subscribe((state) => seenStatuses.push(state.status))

      await useAuthStore.getState().login('person@example.com', 'hunter2')
      unsubscribe()

      expect(seenStatuses).not.toContain('anonymous')
    })
  })

  describe('verifyCode', () => {
    it('authenticates an approved user on a correct code', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.login.mockResolvedValue(undefined)
      authServiceMock.sendLoginCode.mockResolvedValue(undefined)
      await useAuthStore.getState().login('person@example.com', 'hunter2')

      authServiceMock.verifyLoginCode.mockResolvedValue({
        user: fakeUser({ approved: true }),
      } satisfies AuthSession)
      await useAuthStore.getState().verifyCode('123456')

      const state = useAuthStore.getState()
      expect(state.status).toBe('authenticated')
      expect(state.pendingEmail).toBeNull()
      expect(authServiceMock.verifyLoginCode).toHaveBeenCalledWith('person@example.com', '123456')
    })

    it('routes an unapproved user to pending_approval on a correct code', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.login.mockResolvedValue(undefined)
      authServiceMock.sendLoginCode.mockResolvedValue(undefined)
      await useAuthStore.getState().login('person@example.com', 'hunter2')

      authServiceMock.verifyLoginCode.mockResolvedValue({
        user: fakeUser({ approved: false }),
      } satisfies AuthSession)
      await useAuthStore.getState().verifyCode('123456')

      expect(useAuthStore.getState().status).toBe('pending_approval')
    })

    it('refuses to verify with nothing pending, and does not call authService', async () => {
      const useAuthStore = await freshStore()

      await expect(useAuthStore.getState().verifyCode('123456')).rejects.toThrow(
        'Nothing pending to verify -- log in again.',
      )
      expect(authServiceMock.verifyLoginCode).not.toHaveBeenCalled()
    })

    it('leaves status at pending_verification on a wrong code', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.login.mockResolvedValue(undefined)
      authServiceMock.sendLoginCode.mockResolvedValue(undefined)
      await useAuthStore.getState().login('person@example.com', 'hunter2')

      authServiceMock.verifyLoginCode.mockRejectedValue(new ApiError('That code is not right.', 400))

      await expect(useAuthStore.getState().verifyCode('000000')).rejects.toThrow('That code is not right.')
      expect(useAuthStore.getState().status).toBe('pending_verification')
    })
  })

  describe('resendCode', () => {
    it('does nothing when there is no pending email', async () => {
      const useAuthStore = await freshStore()

      await useAuthStore.getState().resendCode()

      expect(authServiceMock.sendLoginCode).not.toHaveBeenCalled()
      expect(useAuthStore.getState().codeSentAt).toBeNull()
    })

    it('throws on failure, unlike the silent trySend() used by login/register', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.login.mockResolvedValue(undefined)
      authServiceMock.sendLoginCode.mockResolvedValueOnce(undefined) // the initial send during login()
      await useAuthStore.getState().login('person@example.com', 'hunter2')

      authServiceMock.sendLoginCode.mockRejectedValueOnce(new ApiError('cooldown', 429))

      await expect(useAuthStore.getState().resendCode()).rejects.toThrow('cooldown')
    })
  })

  describe('logout', () => {
    it('resets to anonymous and clears pending state', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.login.mockResolvedValue(undefined)
      authServiceMock.sendLoginCode.mockResolvedValue(undefined)
      await useAuthStore.getState().login('person@example.com', 'hunter2')
      authServiceMock.logout.mockResolvedValue(undefined)

      await useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.status).toBe('anonymous')
      expect(state.user).toBeNull()
      expect(state.pendingEmail).toBeNull()
      expect(state.codeSentAt).toBeNull()
    })
  })

  describe('the SIGNED_IN listener (magic-link-click path)', () => {
    it('authenticates when a session appears with no explicit verifyCode() call', async () => {
      // Supabase's email includes a clickable sign-in link alongside/instead
      // of the code -- clicking it establishes a session the same way
      // verifyCode() does, just without this app's /verify form in the
      // loop at all.
      const useAuthStore = await freshStore()
      authServiceMock.restore.mockResolvedValue({ user: fakeUser({ approved: true }) } satisfies AuthSession)

      triggerAuthEvent('SIGNED_IN')
      await vi.waitFor(() => {
        expect(useAuthStore.getState().status).toBe('authenticated')
      })
    })

    it('leaves state untouched when the live-session fetch fails', async () => {
      const useAuthStore = await freshStore()
      authServiceMock.login.mockResolvedValue(undefined)
      authServiceMock.sendLoginCode.mockResolvedValue(undefined)
      await useAuthStore.getState().login('person@example.com', 'hunter2')
      authServiceMock.restore.mockRejectedValue(new Error('profile fetch failed'))

      triggerAuthEvent('SIGNED_IN')
      // Give the async handler a tick to run and confirm it did NOT
      // knock a possibly-fine pending_verification state back to anonymous.
      await Promise.resolve()
      await Promise.resolve()

      expect(useAuthStore.getState().status).toBe('pending_verification')
    })
  })
})
