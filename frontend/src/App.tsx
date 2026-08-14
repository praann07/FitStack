import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { PendingApprovalPage } from '@/pages/PendingApprovalPage'
import { useAuthStore } from '@/stores/authStore'

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const WorkoutPage = lazy(() => import('@/pages/WorkoutPage').then((m) => ({ default: m.WorkoutPage })))
const WorkoutHistoryPage = lazy(() => import('@/pages/WorkoutHistoryPage').then((m) => ({ default: m.WorkoutHistoryPage })))
const WorkoutDetailPage = lazy(() => import('@/pages/WorkoutDetailPage').then((m) => ({ default: m.WorkoutDetailPage })))
const RoutinesPage = lazy(() => import('@/pages/RoutinesPage').then((m) => ({ default: m.RoutinesPage })))
const RoutineDetailPage = lazy(() => import('@/pages/RoutineDetailPage').then((m) => ({ default: m.RoutineDetailPage })))
const RoutineEditorPage = lazy(() => import('@/pages/RoutineEditorPage').then((m) => ({ default: m.RoutineEditorPage })))
const NutritionPage = lazy(() => import('@/pages/NutritionPage').then((m) => ({ default: m.NutritionPage })))
const NutritionTargetsPage = lazy(() => import('@/pages/NutritionTargetsPage').then((m) => ({ default: m.NutritionTargetsPage })))
const ProgressPage = lazy(() => import('@/pages/ProgressPage').then((m) => ({ default: m.ProgressPage })))

export default function App() {
  const status = useAuthStore((s) => s.status)
  const restore = useAuthStore((s) => s.restore)

  useEffect(() => {
    void restore()
  }, [restore])

  if (status === 'restoring') return <SplashScreen />

  return (
    <Suspense fallback={<SplashScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/pending-approval" element={<RequirePendingApproval />} />

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
    </Suspense>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'restoring') return <SplashScreen />
  if (status === 'pending_approval') return <Navigate to="/pending-approval" replace />
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

function RequirePendingApproval() {
  const status = useAuthStore((s) => s.status)

  if (status === 'restoring') return <SplashScreen />
  if (status === 'anonymous') return <Navigate to="/login" replace />
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />
  return <PendingApprovalPage />
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
