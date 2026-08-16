# Email OTP as a real second factor

**Date:** 2026-08-17
**Status:** Approved, **not implemented — paused 2026-08-17.** Blocked on Resend
domain verification for `weighsfit.in`, whose KYC one-time code is delivered to
a phone the user cannot reach. No code, migrations, or Supabase settings were
changed; the app still runs password signup with the manual `profiles.approved`
gate. Resume by clearing the domain KYC, then execute
`docs/superpowers/plans/2026-08-17-login-2fa.md` from Task 1.

## Problem

FitStack currently uses email + password signup with a manual approval gate:
`profiles.approved` defaults to `false`, and an admin flips it by hand in the
Supabase dashboard before the account can do anything. That gate is enforced in
RLS on every user-data table (migration `0007`), so it is a real boundary, not
just a screen — but it does not scale past a handful of testers and it makes
every signup wait on a human.

Two things change here:

1. **Approval becomes automatic.** Proving you control the email address is the
   gate. `profiles.approved` and the pending-approval screen are removed.
2. **Login gains a second factor.** Password alone stops being sufficient to
   reach any data. After the password step the user must enter a 6-digit code
   emailed to them before the session can read or write anything.

## What "second factor" has to mean here

Supabase Auth has no native email-OTP factor — MFA supports TOTP apps and
phone, not email. The obvious workaround (sign in with password, call
`signOut()`, then `signInWithOtp()`, then `verifyOtp()`) is **rejected**: a
fully valid session exists between the password check and the sign-out, and the
client controls whether the rest of the flow happens at all. An attacker with a
stolen password simply stops after step one. That version looks correct in a
demo and provides zero security.

The design below instead lets the password create a session, and makes the
session **useless until verified** — enforced in RLS, not in the router. A
stolen password yields a session that cannot select a single row.

## Architecture

### Flow

```
Register  email + password + profile  ->  account created  ->  code emailed  ->  /verify
Login     email + password            ->  session created  ->  code emailed  ->  /verify
/verify   6-digit code                ->  session marked verified            ->  /dashboard
```

Signup and login converge on the same verification screen and the same pair of
Edge Functions. There is one code-entry component, not two.

### Trust boundary

The browser cannot be trusted to generate or check its own second factor, so
code generation and verification live server-side in Supabase Edge Functions
holding the Resend API key as a secret. This is a deliberate, scoped exception
to the replatform decision that FitStack has no server compute layer (see
`docs/superpowers/specs/` history and the auth decisions memory): the exception
covers authentication only. Fitness math stays client-side.

### Component boundaries

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `login_challenges` table | Stores one outstanding/consumed challenge per session | — |
| `public.session_verified()` | Answers "is the calling session verified?" for RLS and for the client | `login_challenges`, JWT claims |
| `send-login-code` Edge Function | Generate code, store hash, send via Resend | `login_challenges`, Resend API |
| `verify-login-code` Edge Function | Check code, stamp verification | `login_challenges` |
| `authService` | Frontend seam over the two functions | `supabase.functions.invoke` |
| `VerifyCodePage` | Code entry + resend UI | `authStore` |

Each is independently testable: the SQL function via a direct query, the Edge
Functions via HTTP with a crafted JWT, the page via its store.

## Database — migration `0009_session_verification.sql`

### `public.login_challenges`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | `gen_random_uuid()` |
| `user_id` | uuid not null | FK `auth.users(id)` on delete cascade |
| `session_id` | uuid not null unique | Supabase session this challenge belongs to |
| `code_hash` | text not null | bcrypt via `pgcrypto` (`crypt`/`gen_salt`); plaintext never stored |
| `expires_at` | timestamptz not null | issue time + 10 minutes |
| `attempts` | int not null default 0 | challenge is dead at 5 |
| `verified_at` | timestamptz | null until the correct code is entered |
| `verified_until` | timestamptz | set to `verified_at + 12 hours` |
| `created_at` | timestamptz not null default `now()` | drives the 60s resend cooldown |

Keying on `session_id` rather than `user_id` is what makes this a genuine second
factor: signing in on a second device creates a second session, which has no
verified challenge and therefore starts unverified. Re-issuing a code for a
session overwrites its row (`on conflict (session_id) do update`).

RLS is enabled with **no policies for `anon` or `authenticated`**. The table is
reachable only by the service role (Edge Functions) and by the SECURITY DEFINER
helper below. `code_hash` is therefore never exposed to a client, even hashed.

### `public.session_verified()`

```sql
create function public.session_verified() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.login_challenges c
    where c.session_id = (auth.jwt() ->> 'session_id')::uuid
      and c.verified_at is not null
      and c.verified_until > now()
  );
$$;

revoke execute on function public.session_verified() from public, anon;
grant execute on function public.session_verified() to authenticated;
```

`SECURITY DEFINER` is required because RLS policies that query another table are
subject to that table's RLS, and `login_challenges` is closed to
`authenticated`.

It lives in `public` rather than a private schema — a deliberate departure from
the usual "hide SECURITY DEFINER functions" rule — because the **frontend must
call it too**: `authStore.restore()` has to determine whether a restored session
is still verified, and it cannot read `login_challenges` directly. Exposing it
over PostgREST as `supabase.rpc('session_verified')` is the whole point.

Three properties keep that safe, and any future edit must preserve all three:

1. It takes **no arguments**, so there is no parameter to manipulate.
2. It reads only `auth.jwt()` — the caller's own token. A caller can only ever
   ask about themselves.
3. It returns a **boolean**, never row data, so it cannot leak `code_hash` or
   another user's challenge.

`EXECUTE` is revoked from `PUBLIC` and `anon` so only signed-in users can call
it.

### Policy changes

Every policy that currently reads
`exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved)`
has that clause replaced with `(select public.session_verified())`. The
`(select ...)` wrapper preserves the initplan caching that migration `0006`
introduced for performance.

Affected tables, matching migration `0007` exactly:
`routines`, `routine_exercises`, `workout_sessions`, `workout_sets`,
`exercises` (custom-row policies), `foods` (custom-row policies), `food_logs`,
`tdee_estimates`, `dismissed_suggestions`.

**Deliberately not gated:**

- `body_metrics` and `nutrition_targets` — `authService.signUp` writes the first
  row of each *during* signup, before any verification can have happened.
  Migration `0008` already ungated them for the identical reason with the
  approval flag; re-gating them would reintroduce that deadlock.
- `profiles` — the client must be able to read its own row to render state, and
  the `handle_new_user` trigger must be able to write the initial row.

### Removal

`alter table public.profiles drop column approved;` — the column and every
policy clause referencing it go away in the same migration.

## Edge Functions

Both are Deno functions deployed to the Supabase project. Both require a valid
JWT (they read `sub` and `session_id` from it) and use the service role key for
their own database access.

### `send-login-code`

1. Reject if no valid JWT.
2. Reject with 429 if a challenge for this `session_id` was created less than
   60 seconds ago.
3. Generate a cryptographically random 6-digit code.
4. Upsert the challenge row keyed on `session_id`, storing the bcrypt hash and
   `expires_at = now() + 10 minutes`, resetting `attempts` to 0.
5. Send the code with the `npm:resend` SDK from `Weighsfit <otp@weighsfit.in>`.
   If Resend returns an error, delete
   the challenge row and return 502 so the client can offer a retry rather than
   leaving the user stuck with a code that was never delivered.

### `verify-login-code`

1. Reject if no valid JWT.
2. Load the challenge for this `session_id`. Reject if absent, expired,
   already verified, or `attempts >= 5`.
3. Compare the submitted code against `code_hash`. On mismatch, increment
   `attempts` and return a generic failure.
4. On match, set `verified_at = now()` and `verified_until = now() + 12 hours`.

Failure responses do not distinguish "wrong code" from "expired" from "too many
attempts" beyond what the UI needs, to avoid handing an attacker a probe.

## Frontend

### New

- **`pages/VerifyCodePage.tsx`** — six-box code input, submit, and a resend
  button disabled for 60 seconds after each send. Shows remaining attempts
  after a failure. Offers sign-out as an escape hatch.

### Changed

- **`services/authService.ts`** — add `sendLoginCode()` and
  `verifyLoginCode(code)` wrapping `supabase.functions.invoke`. Remove the
  `approved` field from `ProfileRow`, `toUser`, and the `User` type. `login()`
  returns after `signInWithPassword` without treating the session as usable.
- **`stores/authStore.ts`** — `AuthStatus` becomes
  `'restoring' | 'authenticated' | 'pending_verification' | 'anonymous'`.
  `statusFor` is driven by verification state instead of `user.approved`.
  `restore()` calls `supabase.rpc('session_verified')` and yields
  `pending_verification` when it returns false.
- **`App.tsx`** — `RequirePendingApproval` becomes `RequireVerification`, route
  `/pending-approval` becomes `/verify`, and `RequireAuth` redirects
  `pending_verification` to `/verify`.
- **`pages/LoginPage.tsx`** — after a successful password submit, call
  `sendLoginCode()` and navigate to `/verify`. All existing fields stay.
- **`pages/RegisterPage.tsx`** — after the existing signup writes, call
  `sendLoginCode()` and navigate to `/verify`. All existing fields, the password
  strength meter, and the goal picker stay. The "needs approval" copy is
  replaced with verification copy.
### Removed

- **`pages/PendingApprovalPage.tsx`** — deleted.
- **`components/layout/RouteGuard.tsx`** — deleted entirely. It duplicates
  auth-routing logic that `App.tsx` already implements, and a grep confirms
  neither of its exports (`RouteGuard`, `BootSplash`) is imported anywhere; the
  route tree uses `App.tsx`'s own `RequireAuth` and `SplashScreen`. It is in
  scope because leaving a second, divergent copy of auth routing in the tree
  while changing auth routing is how the next bug gets written.

## Error handling

| Condition | Behaviour |
| --- | --- |
| Wrong code | Increment attempts, show remaining count, stay on page |
| 5 wrong attempts | Challenge dead; user must sign out and log in again |
| Code expired (10 min) | Prompt to resend |
| Resend button before 60s | Button disabled with countdown; server also returns 429 |
| Resend API failure | Challenge row deleted, error surfaced, retry offered |
| Session restored after 12h | `restore()` yields `pending_verification`, user re-verifies |
| Edge Function unreachable | Error on the verify page with a retry; user is not silently let through |

## Testing

- **SQL:** with a verified session, a gated table returns rows; with an
  unverified session, the same query returns zero rows and inserts fail. Assert
  `body_metrics` and `nutrition_targets` still accept the signup writes while
  unverified — this is the regression migration `0008` was written for.
- **Edge Functions:** correct code verifies; wrong code increments attempts;
  sixth attempt is refused; expired challenge is refused; second send inside 60s
  returns 429.
- **End-to-end, run manually:** real signup and real login against the live
  project, with a real code arriving in a real inbox. Migration `0008` exists
  because the approval deadlock was found by running a signup, not by reading
  policies — the same discipline applies here.

## Configuration and setup

**Sending domain: `weighsfit.in`**, sender `Weighsfit <otp@weighsfit.in>`. This
is FitStack's own domain, distinct from `coastnow.in` used by the separate Coast
project, and needs its own DKIM/SPF verification in Resend.

Supplied by the user, not decided by this design:

1. `weighsfit.in` verified in Resend (DNS records added, domain showing
   verified).
2. A Resend API key, set as an Edge Function secret:
   `supabase secrets set RESEND_API_KEY=re_xxxxx`. Never in `frontend/.env` —
   anything Vite reads there ships to the browser.
3. Supabase dashboard: Auth -> disable "Confirm email", since verification is
   handled by this flow rather than Supabase's own confirmation email.

**The repo has no `supabase/config.toml`** — only a `supabase/migrations/`
directory, applied to the remote project by hand. `supabase functions deploy`
requires a linked project, so implementation must first run `supabase init` and
`supabase link --project-ref mdqcaqksvqkanhgjrlwa`. `supabase init` must not
clobber the existing `migrations/` directory.

No Supabase custom SMTP configuration and no auth email template editing is
needed — the Edge Functions call the Resend API directly. (SMTP config would be
required for Supabase's *own* OTP flow, `signInWithOtp`, which this design does
not use: that flow is passwordless and so cannot express "password, then code".)

Resend's free tier allows 100 emails/day and 3,000/month, which covers a
10-15 person pilot.

### Hardening relative to the common reference implementation

The widely-circulated Edge-Function-plus-Resend snippet differs from this design
in four ways, each of which is exploitable. Recording them so they are not
reintroduced by someone copying that snippet later:

| Common snippet | Why it fails | This design |
| --- | --- | --- |
| `Math.random()` for the code | Not cryptographically secure; output is predictable from previous values | `crypto.getRandomValues()` |
| `code text` stored plaintext | Any read of the table — leaked service key, loose policy, dashboard access — exposes every live code | bcrypt hash via `pgcrypto` |
| `email text primary key` | Not bound to a login attempt: a code can be requested for an address without the password, and redeemed by any session | keyed on `session_id` |
| no attempt counter | 10^6 codes brute-force in seconds under unlimited guesses | dead after 5 attempts |

The same snippet also omits `enable row level security` on the code table. With
the table in `public` and plaintext codes, that serves live codes over the Data
API to anyone. This design encloses the table to the service role entirely.

## Risks and accepted tradeoffs

- **Depends on `session_id` being present in the Supabase JWT.** The first
  implementation step is proving this at runtime against the live project. If
  the claim is absent, the fallback is user-scoped verification stored on
  `profiles` — weaker (verifying on one device verifies all of them) but still
  RLS-enforced and still real. Do not proceed past step one without resolving
  this.
- **Email delivery becomes a hard dependency for every login**, not just
  recovery. If Resend is down or a code lands in spam, nobody can get in. This
  is inherent to the choice of email as the second factor.
- **12-hour verification window** trades security against re-entering a code
  during a demo. Shortening it is a one-constant change.
- **`SECURITY DEFINER` is being introduced deliberately, in `public`.** It is
  confined to one argument-less, boolean-returning function that reads only the
  caller's own JWT, with `EXECUTE` revoked from `PUBLIC` and `anon`. It is
  exposed on purpose so the frontend can call it. Any future change must
  preserve all three safety properties listed above; adding a parameter to it
  would turn it into a way to query other users' state.
- **Existing accounts.** Dropping `approved` means the two current profiles
  become ordinary accounts; they will be asked for a code on their next login.
  No data migration is needed.
