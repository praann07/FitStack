import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Field, Input, NumberField, Select } from '@/components/ui/Field'
import { useAuthStore } from '@/stores/authStore'
import { compose, email as emailRule, minLength, range, required } from '@/lib/validate'
import { passwordScore } from '@/lib/validate'
import { errorMessage } from '@/hooks/useAsync'
import { cn } from '@/lib/cn'
import { GOAL_DESCRIPTION } from '@/lib/format'
import type { Goal } from '@/types'

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
] as const

const GOALS: { value: Goal; label: string; hint: string; rate: number }[] = [
  { value: 'bulk', label: 'Bulk', hint: '+0.25 kg / week', rate: 0.25 },
  { value: 'cut', label: 'Cut', hint: '−0.5 kg / week', rate: -0.5 },
  { value: 'maintain', label: 'Maintain', hint: 'hold weight', rate: 0 },
]

interface Errors {
  full_name?: string
  email?: string
  password?: string
  confirm?: string
  height_cm?: string
  weight_kg?: string
  age?: string
}

export function RegisterPage() {
  const register = useAuthStore((s) => s.register)
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [height, setHeight] = useState<number | null>(null)
  const [weight, setWeight] = useState<number | null>(null)
  const [age, setAge] = useState<number | null>(null)
  const [sex, setSex] = useState<'male' | 'female'>('male')
  const [activity, setActivity] = useState<(typeof ACTIVITY_LEVELS)[number]['value']>('moderate')
  const [goal, setGoal] = useState<Goal>('bulk')
  const [goalRate, setGoalRate] = useState(0.25)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const score = useMemo(() => passwordScore(password), [password])

  function chooseGoal(g: Goal) {
    setGoal(g)
    setGoalRate(GOALS.find((x) => x.value === g)?.rate ?? 0.25)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Errors = {}
    const req = required()
    const num = (v: number | null, min: number, max: number, label: string) =>
      v === null ? `${label} is required` : range(min, max, label)(String(v))

    const fn = compose(req, minLength(2, 'Full name'))
    if (fn(fullName)) errs.full_name = fn(fullName) ?? undefined
    if (emailRule()(email)) errs.email = emailRule()(email) ?? undefined
    if (req(password)) errs.password = 'Password is required'
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (confirm !== password) errs.confirm = 'Passwords do not match'
    if (num(height, 120, 230, 'Height')) errs.height_cm = num(height, 120, 230, 'Height') ?? undefined
    if (num(weight, 30, 250, 'Weight')) errs.weight_kg = num(weight, 30, 250, 'Weight') ?? undefined
    if (num(age, 13, 90, 'Age')) errs.age = num(age, 13, 90, 'Age') ?? undefined

    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return

    setLoading(true)
    setFormError(null)
    try {
      await register({
        email,
        password,
        full_name: fullName,
        goal,
        goal_rate_kg_week: goalRate,
        height_cm: height as number,
        weight_kg: weight as number,
        age: age as number,
        sex,
        activity_level: activity,
      })
      const status = useAuthStore.getState().status
      navigate(status === 'pending_approval' ? '/pending-approval' : '/dashboard', { replace: true })
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setLoading(false)
    }
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
          One account for training, nutrition and progress. New accounts need approval before
          they can log in — you'll get access once that's done.
        </p>

        {formError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger"
          >
            {formError}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 flex flex-col gap-5" noValidate>
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
              Account
            </legend>
            <Field label="Full name" htmlFor="full_name" error={errors.full_name}>
              <Input
                id="full_name"
                autoComplete="name"
                placeholder="Daniel Okafor"
                value={fullName}
                aria-invalid={!!errors.full_name}
                onChange={(e) => setFullName(e.target.value)}
              />
            </Field>
            <Field label="Email" htmlFor="reg-email" error={errors.email}>
              <Input
                id="reg-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                aria-invalid={!!errors.email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password" htmlFor="reg-password" error={errors.password}>
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                aria-invalid={!!errors.password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {password && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex h-1 flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          'flex-1 rounded-full transition-colors',
                          i < score.score
                            ? score.score <= 1
                              ? 'bg-danger'
                              : score.score <= 2
                                ? 'bg-warning'
                                : 'bg-positive'
                            : 'bg-surface-3',
                        )}
                      />
                    ))}
                  </div>
                  <span className="w-16 text-right text-[11.5px] text-ink-faint">{score.label}</span>
                </div>
              )}
            </Field>
            <Field label="Confirm password" htmlFor="reg-confirm" error={errors.confirm}>
              <Input
                id="reg-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat the password"
                value={confirm}
                aria-invalid={!!errors.confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
              Body &amp; activity
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Height (cm)" htmlFor="height" error={errors.height_cm}>
                <NumberField
                  id="height"
                  value={height}
                  onValueChange={setHeight}
                  suffix="cm"
                  placeholder="180"
                  min={120}
                />
              </Field>
              <Field label="Current weight (kg)" htmlFor="weight" error={errors.weight_kg}>
                <NumberField
                  id="weight"
                  value={weight}
                  onValueChange={setWeight}
                  suffix="kg"
                  placeholder="83.5"
                  min={30}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Age" htmlFor="age" error={errors.age}>
                <NumberField id="age" value={age} onValueChange={setAge} suffix="yrs" placeholder="29" min={13} />
              </Field>
              <Field label="Sex">
                <Select value={sex} onChange={(e) => setSex(e.target.value as 'male' | 'female')}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </Select>
              </Field>
            </div>
            <Field label="Activity level">
              <Select value={activity} onChange={(e) => setActivity(e.target.value as typeof activity)}>
                {ACTIVITY_LEVELS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
              Training goal
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => chooseGoal(g.value)}
                  aria-pressed={goal === g.value}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-xl border px-2 py-3 text-[13px] font-semibold transition-colors',
                    goal === g.value
                      ? 'border-volt bg-volt-soft text-volt'
                      : 'border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  {g.label}
                  <span
                    className={cn(
                      'text-[11px] font-normal',
                      goal === g.value ? 'text-volt/70' : 'text-ink-faint',
                    )}
                  >
                    {g.hint}
                  </span>
                </button>
              ))}
            </div>
            <p className="-mt-1 text-[12.5px] leading-snug text-ink-muted">{GOAL_DESCRIPTION[goal]}</p>

            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <label htmlFor="rate" className="text-[12.5px] font-medium text-ink-muted">
                  Target rate
                </label>
                <span className="text-[13px] font-semibold tabular-nums text-ink">
                  {goalRate > 0 ? `+${goalRate.toFixed(2)}` : goalRate.toFixed(2)} kg / week
                </span>
              </div>
              <input
                id="rate"
                type="range"
                min={goal === 'maintain' ? -0.1 : -1}
                max={goal === 'maintain' ? 0.1 : 1}
                step={0.05}
                value={goalRate}
                disabled={goal === 'maintain'}
                onChange={(e) => setGoalRate(Number(e.target.value))}
                className="mt-3 w-full accent-[var(--color-volt)]"
              />
              <div className="mt-1 flex justify-between text-[11px] text-ink-faint">
                <span>{goal === 'maintain' ? '—' : 'Fast loss'}</span>
                <span>{goal === 'maintain' ? 'hold' : 'Fast gain'}</span>
              </div>
            </div>
          </fieldset>

          <Button type="submit" size="lg" block loading={loading}>
            Create account
          </Button>
          <p className="text-center text-[11.5px] leading-snug text-ink-faint">
            Your first target is a Mifflin-St Jeor baseline. After ~7 days of weigh-ins and food
            logs it switches to your adaptive TDEE.
          </p>
        </form>
      </div>
    </AuthLayout>
  )
}
