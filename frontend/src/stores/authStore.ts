import { create } from 'zustand'
import { authService } from '@/services'
import { supabase } from '@/lib/supabase'
import type { OnboardingPayload, User } from '@/types'

type AuthStatus = 'restoring' | 'authenticated' | 'needs_onboarding' | 'anonymous'

interface AuthState {
  status: AuthStatus
  user: User | null
  restore: () => Promise<void>
  requestOtp: (email: string) => Promise<void>
  verifyOtp: (email: string, code: string) => Promise<void>
  completeOnboarding: (payload: OnboardingPayload) => Promise<void>
  logout: () => Promise<void>
}

function statusFor(user: User): AuthStatus {
  return user.onboarded ? 'authenticated' : 'needs_onboarding'
}

export const useAuthStore = create<AuthState>((set) => {
  // Keeps the store in sync with token refresh / cross-tab sign-out, which
  // supabase-js handles on its own once a session exists.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') set({ status: 'anonymous', user: null })
  })

  return {
    status: 'restoring',
    user: null,

    async restore() {
      try {
        const session = await authService.restore()
        set(session ? { status: statusFor(session.user), user: session.user } : { status: 'anonymous', user: null })
      } catch {
        set({ status: 'anonymous', user: null })
      }
    },

    async requestOtp(email) {
      await authService.requestOtp(email)
    },

    async verifyOtp(email, code) {
      const session = await authService.verifyOtp(email, code)
      set({ status: statusFor(session.user), user: session.user })
    },

    async completeOnboarding(payload) {
      const user = await authService.completeOnboarding(payload)
      set({ status: statusFor(user), user })
    },

    async logout() {
      await authService.logout()
      set({ status: 'anonymous', user: null })
    },
  }
})
