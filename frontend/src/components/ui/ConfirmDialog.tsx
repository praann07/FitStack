import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

/**
 * Confirmation for destructive or irreversible actions. Always states what is
 * being lost, never just "are you sure?".
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  loading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onCancel}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-ink-muted',
          )}
          aria-hidden
        >
          <AlertTriangle className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          {description && (
            <p className="text-[13.5px] leading-relaxed text-ink-muted">{description}</p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
