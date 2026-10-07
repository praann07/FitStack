# Deploying FitStack

Frontend → GitHub Pages, database + auth → Supabase (already provisioned,
project `mdqcaqksvqkanhgjrlwa`). There's no backend service to deploy — the
frontend talks to Supabase directly via `supabase-js`, authorized entirely by
Row Level Security.

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
- Under Authentication → URL Configuration, set **Site URL** to
  `https://weighsfit.in` and add it to **Redirect URLs** once the domain is
  live, so password-reset / email links point at the real site instead of
  localhost.

## 2. Frontend → GitHub Pages

`.github/workflows/deploy-pages.yml` builds the Vite app and deploys it to
GitHub Pages on every push to `main`. `frontend/public/CNAME` pins the custom
domain (`weighsfit.in`) so it survives every deploy.

1. **Repo secrets** — Settings → Secrets and variables → Actions → New
   repository secret:
   - `VITE_SUPABASE_URL` = `https://mdqcaqksvqkanhgjrlwa.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the publishable key
     (`mcp__supabase__get_publishable_keys`, or Supabase dashboard → Project
     Settings → API)
2. **Enable Pages** — Settings → Pages → Build and deployment → Source:
   **GitHub Actions**.
3. Push to `main` (or run the workflow manually) to trigger the first deploy.
4. **Custom domain** — Settings → Pages → Custom domain → enter
   `weighsfit.in` → Save. GitHub will check DNS (step 3 below) and provision
   an HTTPS certificate once it resolves; tick **Enforce HTTPS** once that
   option becomes available.

## 3. Point weighsfit.in at GitHub Pages (GoDaddy DNS)

In GoDaddy's DNS management for `weighsfit.in`, add:

| Type | Name | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | praann07.github.io |

Remove any existing parked `A`/`CNAME` records on `@` and `www` first — GoDaddy
won't let the new ones coexist with them. Propagation is usually quick but can
take a few hours; don't leave this to the last minute before a demo.

## Verify

- Visit `https://weighsfit.in`, register an account (email + password — name,
  body, and training goal are collected on the same screen).
- Approve the new user's `profiles.approved` flag in the Supabase dashboard,
  then log in, log a workout and a food entry, and check the dashboard
  populates.
- Refresh the page on a non-root route (e.g. `/nutrition`) — should load, not
  404 (confirms the GitHub Pages 404→index.html fallback is working).

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: frontend lint +
typecheck + build only. `.github/workflows/deploy-pages.yml` is the separate
workflow that actually builds and publishes to GitHub Pages on pushes to
`main`. Supabase schema changes are applied directly via migration
(`mcp__supabase__apply_migration` or the Supabase CLI) — this repo has no CD
step for Supabase.

## Optional: Vercel as a backup URL

`frontend/vercel.json` is kept around so you can also import this repo on
[vercel.com](https://vercel.com) (Root Directory: `frontend`, same two env
vars as above) for a free `*.vercel.app` fallback link — handy if GoDaddy DNS
hasn't propagated yet on demo day. It auto-deploys on every push once
connected; no extra steps needed beyond the initial import.
