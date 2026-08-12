import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useAuthStore } from '@/stores/authStore'
import { email as emailRule } from '@/lib/validate'
import { errorMessage } from '@/hooks/useAsync'
import type { ApiError } from '@/types'

export function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errors: typeof fieldErrors = {}
    const emailError = emailRule()(email)
    if (emailError) errors.email = emailError
    if (!password) errors.password = 'Password is required'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setLoading(true)
    setFormError(null)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setFormError(errorMessage(err))
      if (err instanceof Error && 'field' in err) {
        const field = (err as ApiError).field
        if (field === 'email') setFieldErrors((f) => ({ ...f, email: (err as ApiError).message }))
        if (field === 'password') setFieldErrors((f) => ({ ...f, password: (err as ApiError).message }))
      }
    } finally {
      setLoading(false)
    }
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
          Log in to pick up where you left off.
        </p>

        {formError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger"
          >
            {formError}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="email" error={fieldErrors.email}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              aria-invalid={!!fieldErrors.email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password" error={fieldErrors.password}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              aria-invalid={!!fieldErrors.password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" block loading={loading}>
            Log in
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}
