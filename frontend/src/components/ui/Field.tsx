import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-muted">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-faint">{hint}</p>
      ) : null}
    </div>
  )
}

const CONTROL =
  'w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-faint ' +
  'transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20 ' +
  'disabled:opacity-55 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(CONTROL, 'h-9.5', className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(CONTROL, 'py-2 leading-relaxed', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(CONTROL, 'select-chevron h-9.5 appearance-none pr-9', className)}
        {...rest}
      >
        {children}
      </select>
    )
  },
)

/** Number input that always parses commas/decimals and strips units. */
export function NumberField({
  id,
  value,
  onValueChange,
  suffix,
  placeholder,
  min,
  step,
  className,
  inputClassName,
  autoFocus,
}: {
  id?: string
  value: number | null
  onValueChange: (v: number | null) => void
  suffix?: string
  placeholder?: string
  min?: number
  step?: number
  className?: string
  inputClassName?: string
  autoFocus?: boolean
}) {
  return (
    <div
      className={cn(
        'flex h-9.5 items-center overflow-hidden rounded-lg border border-line bg-surface-2',
        'transition-colors focus-within:border-volt focus-within:ring-2 focus-within:ring-volt/20',
        className,
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        className={cn(
          'h-full w-full bg-transparent px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none',
          inputClassName,
        )}
        placeholder={placeholder}
        value={value === null || Number.isNaN(value) ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.')
          if (raw === '') {
            onValueChange(null)
            return
          }
          const n = Number(raw)
          onValueChange(Number.isNaN(n) ? value : n)
        }}
        onBlur={(e) => {
          const raw = e.target.value.replace(',', '.')
          if (raw === '') {
            onValueChange(null)
            return
          }
          const n = Number(raw)
          if (Number.isNaN(n)) return
          const clamped = min !== undefined ? Math.max(min, n) : n
          const stepped = step && step > 0 && step % 1 !== 0 ? Math.round(clamped * 10) / 10 : clamped
          onValueChange(stepped)
          e.target.value = String(stepped)
        }}
      />
      {suffix && (
        <span className="shrink-0 pr-3 text-[12.5px] font-medium text-ink-faint">{suffix}</span>
      )}
    </div>
  )
}
