import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { WorkoutPage } from '@/pages/WorkoutPage'
import { WorkoutHistoryPage } from '@/pages/WorkoutHistoryPage'
import { WorkoutDetailPage } from '@/pages/WorkoutDetailPage'
import { RoutinesPage } from '@/pages/RoutinesPage'
import { RoutineDetailPage } from '@/pages/RoutineDetailPage'
import { RoutineEditorPage } from '@/pages/RoutineEditorPage'
import { NutritionPage } from '@/pages/NutritionPage'
import { NutritionTargetsPage } from '@/pages/NutritionTargetsPage'
import { ProgressPage } from '@/pages/ProgressPage'
import { useAuthStore } from '@/stores/authStore'

export default function App() {
  const status = useAuthStore((s) => s.status)
  const restore = useAuthStore((s) => s.restore)

  useEffect(() => {
    void restore()
  }, [restore])

  if (status === 'restoring') return <SplashScreen />

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/workout" element={<WorkoutPage />} />
        <Route path="/workout/history" element={<WorkoutHistoryPage />} />
        <Route path="/workout/:sessionId" element={<WorkoutDetailPage />} />
        <Route path="/routines" element={<RoutinesPage />} />
        <Route path="/routines/new" element={<RoutineEditorPage />} />
        <Route path="/routines/:routineId" element={<RoutineDetailPage />} />
        <Route path="/routines/:routineId/edit" element={<RoutineEditorPage />} />
        <Route path="/nutrition" element={<NutritionPage />} />
        <Route path="/nutrition/targets" element={<NutritionTargetsPage />} />
        <Route path="/progress" element={<ProgressPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'restoring') return <SplashScreen />
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

function SplashScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas">
      <Logo />
      <p className="text-[13px] text-ink-faint">Restoring your session…</p>
    </div>
  )
}

export { SplashScreen }
