# Engineering Report

This document captures the reasoning, trade-offs, and scope boundaries behind every change. Written for a tech lead reviewing the submission.

---

## Phase 3 — Frontend Deployment Preparation & Backend Polish

### Frontend API Integration (graceful degradation)

**Problem**: The Next.js frontend used static `lib/mockData.ts` everywhere. No runtime API calls. Deployment to Vercel would show hardcoded data that doesn't reflect the live backend.

**Decision**: Created `lib/config.ts` (reads `NEXT_PUBLIC_API_URL` with fallback to `http://localhost:4000/api/v1`) and `lib/api.ts` (typed fetch wrapper with `fetchJobs()`, `fetchJob()`). Wired three components with an API-first, mock-fallback strategy:

| Component | Approach |
|---|---|
| `FeaturedJobs` (server component) | `async` component fetches from API during SSR; on fetch failure, catches and renders mock data |
| `JobDetailPage` (SSG) | `generateStaticParams` returns mock IDs; page tries API first, falls back to `mockData.ts` |
| `JobsListing` (client component) | `useEffect` fetch on mount; catches errors silently; falls back to mock data |

**Trade-off**: The mock fallback means the frontend builds and renders even when the backend is down (e.g., during Vercel build where no backend URL exists yet). The downside is silent fallbacks could hide integration issues in development. A `<DevBanner>` or env flag could warn when fallback is active.

### Auth Page

**Problem**: The `Header` component linked to `/login`, which returned 404. The project had no auth UI.

**Decision**: Created a single `/login` page with a register/login toggle form. Calls `POST /api/v1/auth/register` and `POST /api/v1/auth/login`, stores the JWT in `localStorage`. No auth context provider yet — the token is available but there's no global state to read it across routes. Scoped as a minimal fix to unblock demo evaluation.

**Not implemented** (deferred):
- Auth context provider (`AuthContext` wrapping `layout.tsx`)
- Protected route redirects
- Token refresh logic
- Logout clears token but does not redirect

### Demo Data Seeding

**Problem**: The Prisma seed creates 55 categories but no companies, users, or jobs. An empty API returns `[]` — useless for a demo.

**Decision**: Created 3 employer users + 3 companies (TakaCash, ethio telecom, Zemen Bank) + 3 published jobs via direct SQL at the database level. The seed file itself was not modified; demo data was inserted independently so it can be dropped easily for a clean production launch.

**Future**: The seed file should be extended with an optional demo-data block gated by `NODE_ENV !== 'production'`. For now this is a manual SQL step.

### Railway Deployment Compatibility

**Problem**: Two issues made Railway deployment fail:
1. Redis config read individual `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` vars. Railway provides a single `REDIS_URL`.
2. Dockerfile ran only `prisma migrate deploy` — no seed step. Deployed backend would have an empty database.

**Fixes**:
1. `src/app.module.ts`: Added `REDIS_URL` detection — when set, parse it with `new URL()` into host/port/password; otherwise fall back to the individual vars.
2. Created `startup.sh` that runs `prisma migrate deploy` → `prisma db seed` → `npm run start:prod`. Dockerfile updated to use it.

**Verification**: `docker compose build` succeeds with the updated Dockerfile. The `seed` step is idempotent (`upsert` calls), safe to run on every container restart.

### Deployment Config

| File | Purpose |
|---|---|
| `beleqet-jobs-nextjs/.env.example` | Documents `NEXT_PUBLIC_API_URL` for Vercel |
| `beleqet-jobs-nextjs/.env.local` | Local dev override pointing to Docker compose backend |
| `beleqet-jobs-nextjs/vercel.json` | Explicit build/install/framework settings |

---

## Scope Boundaries

These were identified during the initial audit and intentionally deferred. Each has a reason.

| Item | Why deferred |
|------|-------------|
| **Search module** (OpenSearch stub) | Marked "Phase 2" in the original code. Would need OpenSearch/Elasticsearch infra, frontend UI, and reindexing pipeline - a separate feature, not a fix. |
| **Frontend-backend integration** | Frontend uses `mockData.ts` throughout. Wiring to live API is a frontend engineering task (Next.js pages, auth state, error handling) independent of backend correctness. |
| **Git history secret remediation** | Secrets in commit `91e14f8` require `git filter-repo` or BFG to rewrite history, plus rotating credentials on Chapa. Out of scope for this pass; flagged for next security review. |
| **Bull Board UI** | Would need `@bull-board/api` + `@bull-board/express` + Express session middleware for basic auth. Queue visibility is valuable but the effort-to-value ratio is lower than every item in this PR. |
| **Node version mismatch** | Docker uses `node:20-alpine`; `@types/node` targets `^22.5.5`. No compile errors observed in practice. Cleaning this up would mean either upgrading the Docker image or pinning types - neither blocks correctness. |
| **`ParseUUIDPipe` cleanup** | Defined but never imported by any controller. Harmless dead code; removing it has no behavioural impact. |

---

## Security - Hardcoded secrets

**Problem**: `webhook-server.js` and `simulate.js` contained inline `CHAPA_SECRET`, `WEBHOOK_SECRET`, and a hardcoded HMAC signature committed in `91e14f8`.

**Decision**: Replaced all inline secrets with `process.env.CHAPA_SECRET_KEY` / `process.env.CHAPA_WEBHOOK_SECRET`, matching the naming convention already used across the NestJS codebase.

**Trade-off**: The secrets remain in git history. Full remediation would require history rewrite + credential rotation. Flagged for follow-up.

---

## Security - Env var hygiene

**Problem**: `.env.example` contained 4 dead variables never referenced in code (`TELEGRAM_CHANNEL_ID`, `CHAPA_PUBLIC_KEY`, `BULL_BOARD_USERNAME`, `BULL_BOARD_PASSWORD`) and was missing `AWS_ENDPOINT`, which the upload service actually uses.

**Decision**: Removed dead vars; added `AWS_ENDPOINT`. Kept `BULL_BOARD_USERNAME`/`BULL_BOARD_PASSWORD` out since Bull Board isn't wired up - they can be reintroduced if that changes.

---

## Security - Rate limiting

**Problem**: `ThrottlerModule` was configured in `app.module.ts` but `ThrottlerGuard` was never registered as a global guard. The `@Throttle()` decorators on auth routes were no-ops at runtime.

**Decision**: Three changes:
1. Registered `ThrottlerGuard` as a global `APP_GUARD` in `app.module.ts`
2. Simplified config from 3 named throttlers (`short`/`medium`/`long`) to a single unnamed throttler (`{ ttl: 60_000, limit: 100 }`). This receives the implicit name `"default"`, matching the key used by all `@Throttle({ default: { ... } })` decorators - the named throttlers were never referenced by any route.
3. Applied `@Throttle()` decorators to sensitive routes

**`@nestjs/throttler` v6 detail**: The guard uses `totalHits > limit`, so `limit: N` allows N-1 requests before blocking. All limits were bumped by 1 to match the intended burst:

| Route | Config limit | Effective limit |
|---|---|---|
| `POST /auth/register` | 6 | 5 registrations/min |
| `POST /auth/login` | 6 | 5 attempts/min |
| `POST /auth/forgot-password` | 4 | 3 requests/min |
| `POST /auth/reset-password` | 4 | 3 requests/min |
| `POST /escrow/callback` | 11 | 10 webhooks/min |

**Verification**: 6 rapid POSTs to `/auth/login` - requests 1-5 return `401` (wrong credentials), request 6 returns `429 Too Many Requests`.

---

## Correctness - WalletProcessor wiring

**Problem**: `WalletProcessor` handled a `release-pending` job type that nothing ever enqueued. Meanwhile, `EscrowProcessor.handleAutoRelease()` updated wallet balances directly, bypassing the queue architecture entirely.

**Decision**: `EscrowProcessor` now enqueues `WALLET_JOBS.RELEASE_PENDING` to the `WALLET` queue after the 3-day hold elapses. `WalletProcessor` owns only the balance state machine (pending → available + transaction record), while `EscrowProcessor` handles event logging and notifications.

**Design rationale**: A scheduled/repeatable sweep job could also work, but the current architecture already has the correct trigger point - `EscrowProcessor.handleAutoRelease()` fires naturally after the hold. Pushing to the WALLET queue keeps the flow event-driven and consistent with existing BullMQ patterns.

---

## Correctness - BullMQ standardization

**Problem**: The codebase imported `Queue` and `Job` from the legacy `'bull'` package, while actually using BullMQ v5 via the `@nestjs/bull` bridge. Bull v4 API calls like `job.queue.add()` don't exist on BullMQ's `Job` type.

**Decision**: Three changes:
1. Replaced all `import { Queue } from 'bull'` / `import { Job } from 'bull'` with `import { Queue, Job } from 'bullmq'`
2. Removed `bull` and `@types/bull` from `package.json` (unused dependencies)
3. Replaced two `job.queue.add()` calls in `ScreeningProcessor` and `EscrowProcessor` with injected queue references (`this.queue.add(...)`)

**Why not switch to `@nestjs/bullmq`?**: The `@nestjs/bull` v10+ bridge supports BullMQ natively. Switching to `@nestjs/bullmq` would mean changing every decorator import (`@Processor`, `@Process`, `@InjectQueue`) with functionally identical APIs from a different package - cosmetic churn with no behavioural difference. The critical change was the type imports and removing the legacy dependency.

---

## Correctness - Prisma migrations

**Problem**: The repository had no `prisma/migrations/` directory. The Dockerfile used `prisma db push --accept-data-loss` as a fallback, which is dangerous for production.

**Decision**: Created the initial migration using `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (597 lines, 24 models). The Dockerfile now uses `prisma migrate deploy`.

**Verification**:
- Applied to a fresh PostgreSQL volume
- `prisma migrate status` → "Database schema is up to date!"
- `prisma migrate diff --from-schema-datamodel --to-url <db>` → "No difference detected." **Zero drift.**
- Table count: 24 models (confirmed via `grep -c "^model " prisma/schema.prisma`)

**Note**: An earlier report of "3 minor drifts" was a false positive from an incorrect `prisma migrate diff` invocation (missing `--to-url`). With the correct command, schema and database match exactly - `payload` is `JSONB NOT NULL`, array fields have no default.

---

## Operations - Docker Compose hardening

**Problem**: The compose file had no healthchecks, missing env var pass-through, permissive WebSocket CORS, and a dangerous migration strategy.

**Changes**:
1. **Healthchecks** on all 3 services (Postgres: `pg_isready`, Redis: `redis-cli ping`, backend: `curl http://localhost:4000/api/v1` checking for non-5xx). Backend waits for healthy `db` + `redis`.
2. **`env_file: .env`** replaces inline `environment` block - all env vars (`SMTP_*`, `CHAPA_*`, `TELEGRAM_*`, `AWS_*`) now reach the backend container.
3. **Dockerfile CMD** changed from `prisma db push --accept-data-loss` to `npx prisma migrate deploy && npm run start:prod`.
4. **WebSocket CORS** tightened from `origin: true` to `process.env.FRONTEND_URL`.

**E2E verification**: Full `docker compose up -d` tested on a clean machine - all 3 containers healthy, migration applied on startup, registration returns 201, login returns 200, rate limiting returns 429 on the 6th request.

---

## Tests

**Strategy**: Wrote targeted tests for the highest-risk, most-demonstrative pieces. Each follows existing mocking patterns (manual mocks, `@nestjs/testing`, no real DB).

| File | What it covers |
|------|---------------|
| `auth.service.spec.ts` | Register happy path, duplicate email rejection, valid login, invalid password |
| `auth.controller.spec.ts` | `@Throttle()` decorator metadata present on all 4 rate-limited routes (metadata-based, no HTTP stack needed) |
| `wallet.processor.spec.ts` | Pending→available transition, idempotent retry (no double-credit) |
| `escrow.processor.spec.ts` | Webhook funding, idempotent skip on already-funded, unknown reference graceful handling, auto-release wallet enqueue, re-queue with delay when hold not elapsed |

All 22 tests pass across 9 suites. The 5 pre-existing smoke tests remain unchanged.

**Lint**: Confirmed genuinely pre-existing. The original commit `91e14f8` produces `eslint: not found` - ESLint was never a direct devDependency. `@nestjs/cli` v10 no longer bundles it.

---

## Summary of changes by file

### Phase 2 (Backend fixes, security, operations)

| File | Change |
|------|--------|
| `backend/src/app.module.ts` | Added `APP_GUARD` with `ThrottlerGuard`; simplified throttler config |
| `backend/src/modules/auth/auth.controller.ts` | Applied `@Throttle()` with clarity comments |
| `backend/src/modules/escrow/escrow.controller.ts` | Applied `@Throttle()` with clarity comment |
| `backend/src/modules/escrow/escrow.processor.ts` | Enqueues to WALLET queue on auto-release |
| `backend/src/modules/escrow/wallet.processor.ts` | Receives from WALLET queue (was orphaned) |
| `backend/src/modules/chat/chat.gateway.ts` | Tightened CORS to `FRONTEND_URL` |
| `backend/prisma/migrations/20260702000000_init/migration.sql` | CLI-generated (597 lines, 24 models, zero drift) |
| `backend/package.json` | Removed `bull`/`@types/bull`; added `bull` devDep |
| `backend/Dockerfile` | `prisma db push` → `prisma migrate deploy`; use `startup.sh` |
| `backend/docker-compose.yml` | Healthchecks, `env_file`, wait-for-healthy |
| `backend/webhook-server.js` | Secrets → env vars |
| `backend/simulate.js` | Secrets → env vars |
| `.gitignore` (root) | Added |
| `backend/.env.example` | Cleaned dead vars, added `AWS_ENDPOINT`, `REDIS_URL` |
| 4 spec files | Auth service, auth controller, wallet processor, escrow processor |

### Phase 3 (Frontend deployment prep, backend polish)

| File | Change |
|------|--------|
| `backend/src/app.module.ts` | Added `REDIS_URL` parsing for Railway compatibility |
| `backend/startup.sh` | New: runs migrate → seed → start:prod |
| `beleqet-jobs-nextjs/lib/config.ts` | New: `API_URL` from `NEXT_PUBLIC_API_URL` |
| `beleqet-jobs-nextjs/lib/api.ts` | New: typed fetch wrapper with `fetchJobs()`, `fetchJob()` |
| `beleqet-jobs-nextjs/app/login/page.tsx` | New: register/login form with JWT storage |
| `beleqet-jobs-nextjs/components/FeaturedJobs.tsx` | API-first, mock fallback |
| `beleqet-jobs-nextjs/components/JobsListing.tsx` | API-first, mock fallback |
| `beleqet-jobs-nextjs/components/JobCard.tsx` | Decoupled from strict mock data type |
| `beleqet-jobs-nextjs/app/jobs/[id]/page.tsx` | API-first, mock fallback |
| `beleqet-jobs-nextjs/.env.example` | New: documents `NEXT_PUBLIC_API_URL` |
| `beleqet-jobs-nextjs/vercel.json` | New: explicit build/install/framework config |
