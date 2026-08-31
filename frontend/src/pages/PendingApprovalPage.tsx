import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { useAsync } from '@/hooks/useAsync'
import { authService } from '@/services'

export function PendingApprovalPage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  // Poll approval status every 3 seconds
  const profile = useAsync(
    async () => {
      if (!user?.id) return null
      return await authService.getCurrentProfile()
    },
    [user?.id],
    { interval: 3000 }
  )

  // Auto-redirect to dashboard when approved
  useEffect(() => {
    if (profile.data?.approved) {
      navigate('/', { replace: true })
    }
  }, [profile.data?.approved, navigate])

  const createdMinutesAgo = user?.created_at
    ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / 60000)
    : 0

  return (
    <AuthLayout>
      <div className="animate-scale-in space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-pop)] sm:p-8">
        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <Clock className="size-6 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Account pending approval</h1>
          <p className="text-[13.5px] text-ink-muted">
            {user?.email ? `(${user.email})` : 'Your account'} was created {createdMinutesAgo > 0 ? `${createdMinutesAgo} minute${createdMinutesAgo > 1 ? 's' : ''} ago` : 'just now'}.
          </p>
        </div>

        {/* Timeline */}
        <div className="space-y-3 py-4">
          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <CheckCircle className="size-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-ink">Account created</p>
              <p className="text-[12px] text-ink-muted">Sign-up complete</p>
            </div>
          </div>

          <div className="ml-2.5 h-3 border-l border-dashed border-line" />

          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              {profile.data?.approved ? (
                <CheckCircle className="size-5 text-emerald-500" />
              ) : (
                <div className="size-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              )}
            </div>
            <div>
              <p className="text-[13px] font-medium text-ink">
                {profile.data?.approved ? 'Approved!' : 'Awaiting admin review'}
              </p>
              <p className="text-[12px] text-ink-muted">
                {profile.data?.approved
                  ? 'Redirecting you to the dashboard...'
                  : 'Our team is reviewing your account. This usually takes a few hours.'}
              </p>
            </div>
          </div>
        </div>

        {/* Info box */}
        {!profile.data?.approved && (
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <p className="text-[12px] leading-relaxed text-ink-muted">
              💡 <strong>Approval timeline:</strong> We review new accounts during business hours (typically within a few hours). You'll be able to start logging your workouts as soon as you're approved. The page refreshes automatically.
            </p>
          </div>
        )}

        {/* Error state */}
        {profile.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex gap-2">
              <AlertCircle className="size-4 shrink-0 text-red-600 mt-0.5" />
              <div className="text-[12px] text-red-700">
                <p className="font-medium">Couldn't check approval status</p>
                <p className="mt-0.5 text-red-600">{profile.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => void logout()}
          >
            Log out
          </Button>
          {!profile.data?.approved && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => void profile.reload()}
              disabled={profile.loading}
            >
              {profile.loading ? 'Checking...' : 'Check now'}
            </Button>
          )}
        </div>
      </div>
    </AuthLayout>
  )
}
