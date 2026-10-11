# Repository Guidelines

## Commands and Environment

- Use Node 24 (`.nvmrc`); supported engines are `^22.12.0 || ^24.0.0`.
- Run commands from the repository root. Root, backend, and frontend are separate npm packages, not workspaces: `npm ci && npm ci --prefix backend && npm ci --prefix frontend`.
- Start development with `npm run dev:backend` and `npm run dev:frontend` in separate terminals. `npm start` starts only the API; root build/lint scripts target only frontend.
- Native development uses `backend/.env` from `backend/.env.example`, with `MONGO_URI` and a non-placeholder `JWT_SECRET` of at least 32 characters. `FRONTEND_URL` must match the browser origin exactly, without a path or trailing slash.
- Frontend defaults to `/api`; `VITE_API_URL` is an API base, never `/api/tasks`. Vite proxies to `127.0.0.1:5001`; override via the `API_PROXY_TARGET` process environment variable.

## Verification

- Before review, run `npm run lint`, `npm test`, and `npm run build`. CI also audits production dependencies with `npm audit --omit=dev --audit-level=high --prefix <package>` for backend/frontend.
- Focused Vitest runs: `npm test --prefix backend -- tests/api.test.js` or `npm test --prefix frontend -- tests/TaskJourney.test.jsx`. Append `-t "test name"` to filter cases; omit the file to run the package suite.
- Tests live outside `src/`, in each package's `tests/`. API integration tests construct `createApp(config)` without loading `.env` and start temporary MongoDB; the first run may download a MongoDB binary.
- `npm run test:coverage` enforces 80% statements/branches/functions/lines within the Vitest configs' scopes. Backend excludes `server.js`; frontend covers selected auth/task/API logic and components.
- Deployment checks: `npm test --prefix backend -- tests/deploy.test.js` and `shellcheck deploy/*.sh`. These tests fake Docker/SSH/HTTP; they do not validate live infrastructure.

## Application Boundaries

- `backend/src/app.js` exports `createApp(config)`; `server.js` owns dotenv loading, DB connection, index initialization before listening, and shutdown. Models live in `backend/models/`.
- Keep request validation in `backend/src/validation/schemas.js`. Scope task queries by authenticated `userId`; ownership and `completedAt` are server-controlled.
- Authentication uses the HttpOnly `token` cookie. Every `/api` mutation, including login/logout, requires `X-Requested-With: TodoTasks`.
- Route frontend HTTP calls through `frontend/src/services/api.js`. Preserve its session-version guard and cache clearing in `frontend/src/context/AuthContext.jsx` so stale responses cannot expire a new session or expose the previous user's cached tasks.
- `frontend/src/hooks/useTasks.js` keeps optimistic previews and mutation locks per task. Reconcile individual rows, never roll back a captured whole page; invalidate both task lists and counts after failures too, since a timed-out write may have committed.

## Containers and Deployment

- Local stack: populate root `.env.local` from `.env.example`, then `docker compose --env-file .env.local up -d --build --wait`; browse `http://localhost:8080`. `compose.yaml` includes MongoDB; `down --volumes` deletes its local data.
- `compose.production.yaml` runs only the API on EC2, bound to `127.0.0.1:5001`; Caddy is managed separately, frontend deploys through Vercel, and MongoDB uses Atlas.
- Coordinate proxy changes across `frontend/vercel.json` and `backend/Caddyfile`: server-only `ORIGIN_SECRET` (never `VITE_`), Caddy's forwarded-IP normalization, and Express `TRUST_PROXY_HOPS=1` work together.
- Successful CI on `main` push/manual runs publishes GHCR images and deploys by digest with health checks and rollback. Read `deploy/README.md` for GitHub/EC2 setup and first-deploy migration; deployment success requires live verification.
- Preserve server-owned `backend.env`, current/previous release files, and their local images. Rollback restores image/Compose, not Atlas data or env changes. Keep schema/API changes compatible with the independently deployed frontend.
