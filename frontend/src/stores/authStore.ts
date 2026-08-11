import { create } from 'zustand'
import { authService } from '@/services'
import type { RegisterPayload, User } from '@/types'

type AuthStatus = 'restoring' | 'authenticated' | 'anonymous'

interface AuthState {
  status: AuthStatus
  user: User | null
  restore: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'restoring',
  user: null,

  async restore() {
    try {
      const session = await authService.restore()
      set(session ? { status: 'authenticated', user: session.user } : { status: 'anonymous', user: null })
    } catch {
      set({ status: 'anonymous', user: null })
    }
  },

  async login(email, password) {
    const session = await authService.login(email, password)
    set({ status: 'authenticated', user: session.user })
  },

  async register(payload) {
    const session = await authService.register(payload)
    set({ status: 'authenticated', user: session.user })
  },

  async logout() {
    await authService.logout()
    set({ status: 'anonymous', user: null })
  },
}))
