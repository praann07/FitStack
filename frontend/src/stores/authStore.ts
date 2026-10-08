import { create } from 'zustand'
import { authService } from '@/services'
import { supabase } from '@/lib/supabase'
import type { RegisterPayload, User } from '@/types'
import { ApiError } from '@/types'

type AuthStatus = 'restoring' | 'authenticated' | 'pending_approval' | 'pending_verification' | 'anonymous'

const PENDING_EMAIL_KEY = 'fitstack_pending_email'

// sessionStorage can throw (private-mode Safari, locked-down mobile browsers)
// -- losing this is just losing the reload-resilience below, never fatal.
function readPendingEmail(): string | null {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY)
  } catch {
    return null
  }
}
function writePendingEmail(email: string | null): void {
  try {
    if (email) sessionStorage.setItem(PENDING_EMAIL_KEY, email)
    else sessionStorage.removeItem(PENDING_EMAIL_KEY)
  } catch {
    // best-effort
  }
}

interface AuthState {
  status: AuthStatus
  user: User | null
  /** Email a code is in flight for, while status is 'pending_verification'. */
  pendingEmail: string | null
  /** When a code was last sent, so the verify screen can size its resend cooldown. Null = none sent this page-load. */
  codeSentAt: number | null
  restore: () => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  verifyCode: (code: string) => Promise<void>
  resendCode: () => Promise<void>
  logout: () => Promise<void>
}

function statusFor(user: User): AuthStatus {
  return user.approved ? 'authenticated' : 'pending_approval'
}

export const useAuthStore = create<AuthState>((set, get) => {
  // login()/register() briefly open then close a password-only session
  // (see authService) before the code is verified -- that fires the same
  // SIGNED_IN/SIGNED_OUT events logout()/verifyCode() do, so this listener
  // must not act on either while that internal open-then-close is in
  // flight. Suppressed only for the duration of that window.
  let suppressAuthEvents = false

  /**
   * Supabase's own email sends a clickable sign-in link alongside (or
   * instead of, depending on the active template) the 6-digit code --
   * `signInWithOtp` is a magic-link primitive underneath. Clicking it opens
   * a session the same way verifyCode() does, just without going through
   * this app's /verify form at all. SIGNED_IN here catches that path so the
   * store ends up in the right state either way.
   */
  async function syncFromLiveSession(): Promise<void> {
    try {
      const session = await authService.restore()
      if (!session) return
      writePendingEmail(null)
      set({ status: statusFor(session.user), user: session.user, pendingEmail: null, codeSentAt: null })
    } catch {
      // Leave current state alone -- a transient profile-fetch failure here
      // shouldn't knock a possibly-fine session back to anonymous.
    }
  }

  supabase.auth.onAuthStateChange((event) => {
    if (suppressAuthEvents) return
    if (event === 'SIGNED_OUT') {
      writePendingEmail(null)
      set({ status: 'anonymous', user: null, pendingEmail: null, codeSentAt: null })
    } else if (event === 'SIGNED_IN') {
      void syncFromLiveSession()
    }
  })

  /** Sends the code without letting a transient failure strand the caller on the login/register form -- the verify screen owns the retry. */
  async function trySend(email: string): Promise<void> {
    try {
      await authService.sendLoginCode(email)
      set({ codeSentAt: Date.now() })
    } catch {
      set({ codeSentAt: null })
    }
  }

  function enterPendingVerification(email: string): void {
    writePendingEmail(email)
    set({ status: 'pending_verification', user: null, pendingEmail: email, codeSentAt: null })
  }

  return {
    status: 'restoring',
    user: null,
    pendingEmail: null,
    codeSentAt: null,

    async restore() {
      try {
        const session = await authService.restore()
        if (session) {
          writePendingEmail(null)
          set({ status: statusFor(session.user), user: session.user, pendingEmail: null, codeSentAt: null })
          return
        }
        // No live session. If a login/signup was mid-verification when the
        // tab was reloaded, land back on /verify instead of bouncing to
        // /login -- the password step already succeeded.
        const pending = readPendingEmail()
        set(
          pending
            ? { status: 'pending_verification', user: null, pendingEmail: pending, codeSentAt: null }
            : { status: 'anonymous', user: null, pendingEmail: null, codeSentAt: null },
        )
      } catch {
        set({ status: 'anonymous', user: null, pendingEmail: null, codeSentAt: null })
      }
    },

    /** Signup always lands on verification -- creating the account proves nothing yet. */
    async register(payload) {
      suppressAuthEvents = true
      try {
        await authService.signUp(payload)
      } finally {
        suppressAuthEvents = false
      }
      enterPendingVerification(payload.email)
      await trySend(payload.email)
    },

    /** Password is the first factor only; the session stays closed until verifyCode(). */
    async login(email, password) {
      suppressAuthEvents = true
      try {
        await authService.login(email, password)
      } finally {
        suppressAuthEvents = false
      }
      enterPendingVerification(email)
      await trySend(email)
    },

    async verifyCode(code) {
      const email = get().pendingEmail
      if (!email) throw new ApiError('Nothing pending to verify -- log in again.', 400)
      const session = await authService.verifyLoginCode(email, code)
      writePendingEmail(null)
      set({ status: statusFor(session.user), user: session.user, pendingEmail: null, codeSentAt: null })
    },

    /** Throws on failure -- unlike trySend, the verify screen shows this one. */
    async resendCode() {
      const email = get().pendingEmail
      if (!email) return
      await authService.sendLoginCode(email)
      set({ codeSentAt: Date.now() })
    },

    async logout() {
      writePendingEmail(null)
      await authService.logout()
      set({ status: 'anonymous', user: null, pendingEmail: null, codeSentAt: null })
    },
  }
})
