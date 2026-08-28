# Deploying FitStack

Frontend → Vercel, database + auth → Supabase (already provisioned, project
`mdqcaqksvqkanhgjrlwa`). There's no backend service to deploy — the frontend
talks to Supabase directly via `supabase-js`, authorized entirely by Row Level
Security. Just one thing to click through.

## 1. Supabase — one manual step

Schema, RLS policies, and the exercise/food library are already applied (see
`supabase/migrations/`). The one thing that has to be done by hand, in the
Supabase dashboard (no API/CLI covers it):

- **Approve new accounts** — registration is email + password, but every new
  `profiles` row starts with `approved = false` (`0007_approval_gate.sql`), so
  the sign-up lands on a "pending approval" screen. To let a user in, set
  `approved = true` on their row (Authentication → Users → the user's
  `profiles` row, or a plain SQL edit). RLS on the user-facing tables enforces
  this gate regardless of the screen a user happens to land on.
- Supabase's built-in SMTP is fine for early testing but is rate-limited to a
  handful of emails/hour and explicitly not for production — set up a real
  SMTP provider (e.g. Resend) under Authentication → SMTP Settings before
  real users sign up (used for password email confirmation / reset).

## 2. Frontend → Vercel

1. [vercel.com](https://vercel.com) → New Project → import this repo.
2. Set **Root Directory** to `frontend`. Vercel auto-detects Vite; the
   `rewrites` rule in `frontend/vercel.json` handles React Router's
   client-side routes on refresh/deep-link.
3. Set environment variables (see `frontend/.env.example`):
   - `VITE_SUPABASE_URL` — `https://mdqcaqksvqkanhgjrlwa.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` — the publishable key (`mcp__supabase__get_publishable_keys`,
     or Supabase dashboard → Project Settings → API)
4. Deploy.

## Verify

- Visit the Vercel URL, register an account (email + password — name, body,
  and training goal are collected on the same screen), approve the new user's
  `profiles.approved` flag in the Supabase dashboard, then log in, log a
  workout and a food entry, and check the dashboard populates.
- Refresh the page on a non-root route (e.g. `/nutrition`) — should load, not
  404 (confirms the SPA rewrite is working).

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: frontend lint +
typecheck + build only. It doesn't touch Supabase or Vercel — Supabase schema
changes are applied directly via migration (`mcp__supabase__apply_migration`
or the Supabase CLI), and Vercel deploys happen via its own GitHub
integration (auto-deploy on push, configured when you connect the repo in
step 2), not through this workflow.
