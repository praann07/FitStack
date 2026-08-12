import { create } from 'zustand'
import { authService } from '@/services'
import { supabase } from '@/lib/supabase'
import type { RegisterPayload, User } from '@/types'

type AuthStatus = 'restoring' | 'authenticated' | 'pending_approval' | 'anonymous'

interface AuthState {
  status: AuthStatus
  user: User | null
  restore: () => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

function statusFor(user: User): AuthStatus {
  return user.approved ? 'authenticated' : 'pending_approval'
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

    async register(payload) {
      const session = await authService.signUp(payload)
      set({ status: statusFor(session.user), user: session.user })
    },

    async login(email, password) {
      const session = await authService.login(email, password)
      set({ status: statusFor(session.user), user: session.user })
    },

    async logout() {
      await authService.logout()
      set({ status: 'anonymous', user: null })
    },
  }
})
