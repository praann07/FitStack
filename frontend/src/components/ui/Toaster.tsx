import { createPortal } from 'react-dom'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { useToastStore } from '@/stores/toastStore'
import { cn } from '@/lib/cn'

const ICON = {
  success: <CheckCircle2 className="size-4.5 text-positive" aria-hidden />,
  error: <XCircle className="size-4.5 text-danger" aria-hidden />,
  info: <Info className="size-4.5 text-info" aria-hidden />,
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  // Positioned below the mobile top bar and clear of page-header actions on
  // desktop, so a toast never covers the control the user just pressed.
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4 sm:top-20 sm:items-end sm:pr-4"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          aria-label={`${toast.message}. Dismiss notification.`}
          className={cn(
            'pointer-events-auto flex max-w-md animate-slide-in-right items-center gap-2.5 rounded-xl',
            'border border-line bg-surface-2 px-3.5 py-2.5 text-left text-[13px] text-ink',
            'shadow-[var(--shadow-pop)] transition-opacity hover:opacity-85',
          )}
        >
          {ICON[toast.kind]}
          <span className="leading-snug">{toast.message}</span>
        </button>
      ))}
    </div>,
    document.body,
  )
}
