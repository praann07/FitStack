import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'

/**
 * Shown when authStore status is 'pending_approval' -- the account exists
 * (profiles row created) but profiles.approved is still false. Pilot-stage
 * access control: an admin flips that flag manually from the Supabase
 * dashboard (see supabase/migrations/0007_approval_gate.sql). There's no
 * in-app action to take here besides checking back or signing out.
 */
export function PendingApprovalPage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <AuthLayout>
      <div className="animate-scale-in rounded-2xl border border-line bg-surface p-6 text-center shadow-[var(--shadow-pop)] sm:p-7">
        <h1 className="text-xl font-bold tracking-tight text-ink">Awaiting approval</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
          Your account{user?.email ? ` (${user.email})` : ''} has been created but hasn't been
          approved yet. Check back once you've heard it's been approved.
        </p>
        <Button variant="ghost" className="mt-5" onClick={() => void logout()}>
          Log out
        </Button>
      </div>
    </AuthLayout>
  )
}
