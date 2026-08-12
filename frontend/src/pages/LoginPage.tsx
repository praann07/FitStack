import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { OtpForm } from '@/components/auth/OtpForm'
import { useAuthStore } from '@/stores/authStore'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  function handleVerified() {
    const status = useAuthStore.getState().status
    navigate(status === 'needs_onboarding' ? '/onboarding' : from, { replace: true })
  }

  return (
    <AuthLayout
      footer={
        <p className="text-center text-[13px] text-ink-muted">
          No account yet?{' '}
          <Link to="/register" className="font-semibold text-volt hover:text-volt-dim">
            Create one
          </Link>
        </p>
      }
    >
      <div className="animate-scale-in rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-pop)] sm:p-7">
        <h1 className="text-xl font-bold tracking-tight text-ink">Welcome back</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          Enter your email and we'll send you a one-time code — no password needed.
        </p>
        <OtpForm onVerified={handleVerified} />
      </div>
    </AuthLayout>
  )
}
