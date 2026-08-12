import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useAuthStore } from '@/stores/authStore'
import { email as emailRule } from '@/lib/validate'
import { errorMessage } from '@/hooks/useAsync'

/**
 * Two-step email OTP form shared by LoginPage and RegisterPage -- Supabase's
 * signInWithOtp treats a new and returning email identically (it creates the
 * account on first use), so there's nothing login-specific or register-specific
 * about the flow itself, only the page copy around it.
 */
export function OtpForm({ onVerified }: { onVerified: () => void }) {
  const requestOtp = useAuthStore((s) => s.requestOtp)
  const verifyOtp = useAuthStore((s) => s.verifyOtp)

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    const err = emailRule()(email)
    setEmailError(err)
    if (err) return

    setLoading(true)
    setFormError(null)
    try {
      await requestOtp(email.trim())
      setStep('code')
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) {
      setCodeError('Enter the code from your email')
      return
    }
    setCodeError(null)
    setLoading(true)
    setFormError(null)
    try {
      await verifyOtp(email.trim(), code.trim())
      onVerified()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (step === 'email') {
    return (
      <form onSubmit={submitEmail} className="mt-5 flex flex-col gap-4" noValidate>
        {formError && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            {formError}
          </div>
        )}
        <Field label="Email" htmlFor="email" error={emailError ?? undefined}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            aria-invalid={!!emailError}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" block loading={loading}>
          Send code
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={submitCode} className="mt-5 flex flex-col gap-4" noValidate>
      {formError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {formError}
        </div>
      )}
      <p className="text-[13px] text-ink-muted">
        We sent a code to <span className="font-medium text-ink">{email}</span>.
      </p>
      <Field label="Verification code" htmlFor="code" error={codeError ?? undefined}>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          value={code}
          aria-invalid={!!codeError}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" block loading={loading}>
        Verify
      </Button>
      <button
        type="button"
        className="text-center text-[12.5px] font-medium text-ink-muted hover:text-ink"
        onClick={() => {
          setStep('email')
          setCode('')
          setFormError(null)
        }}
      >
        Use a different email
      </button>
    </form>
  )
}
