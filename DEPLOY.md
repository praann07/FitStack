# Deploying FitStack

Backend → Render, frontend → Vercel, database → Neon (already set up). Configs
are already in the repo (`backend/render.yaml`, `frontend/vercel.json`,
`.github/workflows/ci.yml`) — this is the order to click through them in.

## 1. Backend → Render

1. [render.com](https://render.com) → New → Blueprint → connect this repo.
   Render reads `backend/render.yaml` and proposes a web service.
2. Before the first deploy, set these in the service's Environment tab
   (`sync: false` in the blueprint means Render won't guess them for you):
   - `DATABASE_URL` — your Neon connection string (the same one in
     `backend/.env`, or a separate prod database if you want to keep dev/prod
     data apart)
   - `JWT_SECRET` — a fresh random value, **not** the `changeme` dev secret
   - `CORS_ORIGINS` — placeholder for now, e.g. `["http://localhost:5173"]`;
     you'll update this in step 3 once the Vercel URL exists
   - `COOKIE_SECURE` and `COOKIE_SAMESITE` are already set to `true` /
     `none` in the blueprint (correct for a cross-domain deploy — leave them)
3. Deploy. The start command runs `alembic upgrade head` before `uvicorn`, so
   migrations apply automatically on every deploy.
4. Once it's live, note the URL (`https://fitstack-api-xxxx.onrender.com`) and
   confirm `GET /health` returns `{"status": "ok"}`.
5. Optionally run `python seed.py` once against the prod database (from your
   machine, with `DATABASE_URL` pointed at prod) to load the exercise/food
   library.

## 2. Frontend → Vercel

1. [vercel.com](https://vercel.com) → New Project → import this repo.
2. Set **Root Directory** to `frontend`. Vercel auto-detects Vite; the
   `rewrites` rule in `frontend/vercel.json` handles React Router's
   client-side routes on refresh/deep-link.
3. Set the environment variable `VITE_API_BASE_URL` to your Render URL plus
   `/api/v1`, e.g. `https://fitstack-api-xxxx.onrender.com/api/v1`.
4. Deploy. Note the resulting URL (`https://your-app.vercel.app`).

## 3. Close the loop

Frontend and backend now live on different domains, so:

1. Back in Render's environment settings, set `CORS_ORIGINS` to the real
   Vercel URL as a JSON array: `["https://your-app.vercel.app"]` (pydantic
   parses list-typed env vars as JSON — a bare comma-separated string won't
   work). Redeploy the backend for it to take effect.
2. `COOKIE_SECURE=true` + `COOKIE_SAMESITE=none` (already set in step 1) are
   required here — without them, the browser silently drops the refresh
   cookie on cross-site requests and login/refresh breaks with no obvious
   error.

## Verify

- Visit the Vercel URL, register an account, log a workout and a food entry,
  check the dashboard populates.
- Refresh the page on a non-root route (e.g. `/nutrition`) — should load, not
  404 (confirms the SPA rewrite is working).
- Wait out an access-token expiry (15 min) and make a request — should
  silently refresh rather than booting you to `/login` (confirms the
  cross-site cookie settings are correct).

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: backend tests
against a disposable `postgres:16` container, frontend lint + typecheck +
build. Neither job touches Render/Vercel/Neon — deploys happen via each
platform's own GitHub integration (auto-deploy on push, configured when you
connect the repo in steps 1–2), not through this workflow.
