import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { useAuthStore } from '@/stores/authStore'
import { useWorkoutStore } from '@/stores/workoutStore'

export function BootSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas">
      <Logo />
      <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-3">
        <div className="skeleton h-full w-full" />
      </div>
      <p className="text-[12.5px] text-ink-faint">Restoring session…</p>
    </div>
  )
}

/** Keeps unauthenticated users out; refreshes the workout "live" badge on entry. */
export function RouteGuard() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const refreshActive = useWorkoutStore((s) => s.refresh)

  useEffect(() => {
    if (status === 'authenticated' && user) void refreshActive(user.id)
  }, [status, user, refreshActive])

  if (status === 'restoring') return <BootSplash />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <Outlet />
}
