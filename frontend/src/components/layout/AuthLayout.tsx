import { Logo } from '@/components/Logo'
import type { ReactNode } from 'react'

export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full opacity-[0.05]"
        style={{ background: 'radial-gradient(closest-side, var(--color-volt), transparent)' }}
      />
      <div className="relative z-10 flex w-full max-w-[26rem] flex-col gap-8">
        <div className="flex justify-center">
          <Logo />
        </div>
        {children}
        {footer}
      </div>
      <p className="relative z-10 mt-10 text-center text-[11.5px] text-ink-faint">
        FitStack · unified training, nutrition &amp; progress tracking
      </p>
    </div>
  )
}
