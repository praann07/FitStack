import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { errorMessage } from '@/hooks/useAsync'

const COOLDOWN_SECONDS = 60

/**
 * Second step after a correct password, for both login and signup. The
 * password step already closed its own session (see authService), so
 * there's nothing to read here except the pending email -- entering the
 * right code is what actually opens a usable session.
 */
export function VerifyCodePage() {
  const pendingEmail = useAuthStore((s) => s.pendingEmail)
  const verifyCode = useAuthStore((s) => s.verifyCode)
  const resendCode = useAuthStore((s) => s.resendCode)
  const logout = useAuthStore((s) => s.logout)
  const codeSentAt = useAuthStore((s) => s.codeSentAt)
  const navigate = useNavigate()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(() =>
    codeSentAt ? Math.max(0, COOLDOWN_SECONDS - Math.floor((Date.now() - codeSentAt) / 1000)) : 0,
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const sentOnMount = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /**
   * Reaching this screen without a code in flight happens whenever the send
   * that kicked it off failed (rate limit, flaky network) or a page reload
   * restored pending_verification from sessionStorage. Send once in that
   * case, or the user is stuck waiting on an email nobody actually sent.
   *
   * The ref guards React 19 StrictMode's double-invoke in development, which
   * would otherwise fire two sends and trip the server's own cooldown.
   */
  useEffect(() => {
    if (codeSentAt !== null || sentOnMount.current) return
    sentOnMount.current = true
    void resendCode()
      .then(() => setCooldown(COOLDOWN_SECONDS))
      .catch((err) => setError(errorMessage(err)))
  }, [codeSentAt, resendCode])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return setError('Enter all six digits.')
    setLoading(true)
    setError(null)
    try {
      await verifyCode(code)
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
      inputRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      await resendCode()
      setCooldown(COOLDOWN_SECONDS)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <AuthLayout>
      <div className="animate-scale-in rounded-2xl border border-line bg-surface p-6 text-center shadow-[var(--shadow-pop)] sm:p-7">
        <h1 className="text-xl font-bold tracking-tight text-ink">Check your email</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
          We sent a 6-digit code{pendingEmail ? ` to ${pendingEmail}` : ''}. It expires in 10 minutes.
        </p>

        {error && (
          <div role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
          <input
            ref={inputRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            aria-label="6-digit verification code"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full rounded-xl border border-line bg-surface-2 py-3 text-center text-[28px] font-semibold tracking-[0.4em] text-ink outline-none focus:border-volt"
            placeholder="000000"
          />
          <Button type="submit" size="lg" block loading={loading}>
            Verify
          </Button>
        </form>

        <button
          type="button"
          onClick={() => void resend()}
          disabled={cooldown > 0}
          className="mt-4 text-[13px] font-semibold text-volt hover:text-volt-dim disabled:text-ink-faint"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>

        <div>
          <Button variant="ghost" className="mt-3" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}
