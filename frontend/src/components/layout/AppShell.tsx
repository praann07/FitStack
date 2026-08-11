import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ClipboardList,
  Dumbbell,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Salad,
  Target,
  TrendingUp,
  X,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Toaster } from '@/components/ui/Toaster'
import { DevControls } from '@/components/layout/DevControls'
import { useAuthStore } from '@/stores/authStore'
import { useWorkoutStore } from '@/stores/workoutStore'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workout', label: 'Workout', icon: Dumbbell, live: true },
  { to: '/workout/history', label: 'History', icon: History },
  { to: '/routines', label: 'Routines', icon: ClipboardList },
  { to: '/nutrition', label: 'Nutrition', icon: Salad },
  { to: '/nutrition/targets', label: 'Targets', icon: Target },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
]

export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const refreshActive = useWorkoutStore((s) => s.refresh)

  useEffect(() => setDrawer(false), [location.pathname])

  useEffect(() => {
    if (user) void refreshActive(user.id)
  }, [user, refreshActive])

  if (!user) return null

  const nav = <NavItems onNavigate={() => setDrawer(false)} />

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">{nav}</nav>
        <div className="border-t border-line p-3">
          <DevControls />
          <div className="mt-1 flex items-center gap-2.5 px-2 py-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-volt-soft text-[12px] font-bold text-volt">
              {initials(user.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">{user.full_name}</p>
              <p className="truncate text-[11.5px] text-ink-faint">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout().then(() => navigate('/login'))}
              aria-label="Log out"
              title="Log out"
              className="flex size-8 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-2 hover:text-danger"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          className="-ml-1 flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          <Menu className="size-5" />
        </button>
        <Logo mark />
        <span className="w-9" aria-hidden />
      </header>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => setDrawer(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-slide-in-right flex-col border-r border-line bg-surface">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <Logo />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="-mr-1 flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">{nav}</nav>
            <div className="border-t border-line p-3">
              <div className="flex items-center gap-2.5 px-2 py-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-volt-soft text-[12px] font-bold text-volt">
                  {initials(user.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{user.full_name}</p>
                  <p className="truncate text-[11.5px] text-ink-faint">{user.email}</p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                block
                className="mt-2"
                onClick={() => void logout().then(() => navigate('/login'))}
              >
                <LogOut className="size-3.5" /> Log out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="md:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 sm:px-6 md:pt-8 lg:px-8">
          <Outlet />
        </div>
      </main>

      <Toaster />
    </div>
  )
}

function NavItems({ onNavigate }: { onNavigate: () => void }) {
  const hasActive = useWorkoutStore((s) => s.hasActive)

  return (
    <div className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/dashboard'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors',
              isActive ? 'bg-volt-soft text-volt' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
            )
          }
        >
          <item.icon className="size-4.5 shrink-0" />
          <span className="flex-1">{item.label}</span>
          {item.live && hasActive && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-volt">
              <span className="size-1.5 animate-pulse rounded-full bg-volt" aria-hidden />
              Live
            </span>
          )}
        </NavLink>
      ))}
    </div>
  )
}
