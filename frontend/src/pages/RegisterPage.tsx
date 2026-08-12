import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { OtpForm } from '@/components/auth/OtpForm'
import { useAuthStore } from '@/stores/authStore'

export function RegisterPage() {
  const navigate = useNavigate()

  function handleVerified() {
    const status = useAuthStore.getState().status
    navigate(status === 'needs_onboarding' ? '/onboarding' : '/dashboard', { replace: true })
  }

  return (
    <AuthLayout
      footer={
        <p className="text-center text-[13px] text-ink-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-volt hover:text-volt-dim">
            Log in
          </Link>
        </p>
      }
    >
      <div className="animate-scale-in rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-pop)] sm:p-7">
        <h1 className="text-xl font-bold tracking-tight text-ink">Create your account</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          Enter your email and we'll send you a one-time code to get started — no password to set.
        </p>
        <OtpForm onVerified={handleVerified} />
      </div>
    </AuthLayout>
  )
}
