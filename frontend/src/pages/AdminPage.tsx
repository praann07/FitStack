import { AlertTriangle, ShieldCheck, ShieldOff } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { useAction, useAsync } from '@/hooks/useAsync'
import { adminService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { relativeDays } from '@/lib/date'
import { initials } from '@/lib/format'
import type { AdminUser } from '@/services/adminService'

/**
 * Pilot access-control panel. Hidden from non-admins by the route guard in
 * App.tsx, and every action re-checks is_admin() server-side inside the
 * SECURITY DEFINER RPC (see supabase/migrations/0010_admin_role_unique.sql),
 * so this screen is a convenience, not the security boundary.
 */
export function AdminPage() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null
  return <AdminView currentUserId={user.id} />
}

function AdminView({ currentUserId }: { currentUserId: string }) {
  const push = useToastStore((s) => s.push)
  const users = useAsync(() => adminService.listUsers(), [])
  const flip = useAction((row: AdminUser, approved: boolean) => adminService.setApproved(row.id, approved))

  async function handleFlip(row: AdminUser, approve: boolean) {
    if (row.id === currentUserId) return
    const ok = await flip.run(row, approve)
    if (ok === null) return
    push(`${approve ? 'Approved' : 'Suspended'}: ${row.full_name || row.email}`, 'success')
    users.reload()
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Admin" subtitle="Approve and manage pilot accounts." />

      {users.loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {users.error && (
        <Card className="p-6">
          <EmptyState
            icon={<AlertTriangle className="size-5" />}
            title="Couldn't load accounts"
            description={users.error}
            action={<Button onClick={users.reload}>Try again</Button>}
          />
        </Card>
      )}

      {!users.loading && !users.error && (users.data?.length ?? 0) === 0 && (
        <Card>
          <EmptyState icon={<ShieldCheck className="size-5" />} title="No accounts yet" description="Accounts appear here as soon as they sign up." />
        </Card>
      )}

      {users.data && users.data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {users.data.map((row) => {
            const isSelf = row.id === currentUserId
            return (
              <Card key={row.id} className="flex items-center gap-3 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-volt-soft text-[13px] font-bold text-volt">
                  {initials(row.full_name || row.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-semibold text-ink">{row.full_name || 'Unnamed'}</p>
                    {row.role === 'admin' && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">
                        Admin
                      </span>
                    )}
                    <span
                      className={`ml-1 size-1.5 rounded-full ${row.approved ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      aria-hidden
                    />
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
                    {row.email} · joined {relativeDays(row.created_at.slice(0, 10))}
                  </p>
                </div>
                <div className="shrink-0">
                  {isSelf ? (
                    <span className="text-[11.5px] text-ink-faint">You</span>
                  ) : row.role === 'admin' ? (
                    <span className="text-[11.5px] text-ink-faint">Admin</span>
                  ) : (
                    <Button
                      variant={row.approved ? 'ghost' : 'secondary'}
                      size="sm"
                      loading={flip.loading}
                      onClick={() => void handleFlip(row, !row.approved)}
                    >
                      {row.approved ? (
                        <>
                          <ShieldOff className="size-3.5" /> Suspend
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="size-3.5" /> Approve
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
