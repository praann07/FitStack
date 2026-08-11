import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'volt-soft'
type Size = 'xs' | 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
}

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-volt text-canvas hover:bg-volt-dim active:bg-volt-dim disabled:hover:bg-volt font-semibold',
  'volt-soft':
    'bg-volt-soft text-volt hover:bg-[#263017] disabled:hover:bg-volt-soft font-medium',
  secondary:
    'bg-surface-2 text-ink hover:bg-surface-3 active:bg-surface-3 disabled:hover:bg-surface-2 font-medium border border-line',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-2 disabled:hover:bg-transparent',
  danger: 'bg-danger-soft text-danger hover:bg-[#3a1a1d] active:bg-[#3a1a1d] disabled:hover:bg-danger-soft font-medium',
  outline:
    'border border-line-strong text-ink hover:border-ink-faint hover:bg-surface-2 disabled:hover:bg-transparent font-medium',
}

const SIZE: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9.5 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, block, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt',
        'disabled:pointer-events-none disabled:opacity-55',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})
