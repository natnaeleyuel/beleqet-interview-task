# Beleqet — Engineering Report

## Project Overview

Beleqet is an Ethiopian hiring platform with job board, freelance marketplace, and escrow payment features. The backend is a NestJS API (PostgreSQL + Redis + BullMQ), and the frontend is a Next.js 14 App Router application. This report covers the full lifecycle: initial audit, security fixes, architecture corrections, operational hardening, frontend-backend integration, and production deployment to Railway + Vercel.

---

## 1. Initial Audit — Problems Found

The repository as received had 10 critical gaps:

| Category | Issue | Severity |
|---|---|---|
| Security | Hardcoded Chapa secrets committed in `91e14f8` | Critical |
| Security | No `.gitignore` — `.env` would be committed | High |
| Security | Rate limiting configured but never wired — `@Throttle()` decorators were no-ops | High |
| Correctness | `WalletProcessor` defined but orphaned — nothing enqueued to its WALLET queue | High |
| Correctness | BullMQ imports from legacy `bull` package instead of `bullmq` — `job.queue.add()` calls would crash at runtime | High |
| Correctness | No Prisma migrations — Dockerfile used `prisma db push --accept-data-loss` | High |
| Operations | Docker Compose had no healthchecks, no `env_file` pass-through | Medium |
| Operations | WebSocket CORS set to `origin: true` (allow all) | Medium |
| Frontend | `/login` route returned 404 — Header had a dead link | Medium |
| Frontend | No API integration — everything used static `mockData.ts` | Medium |

**Deferred** (out of scope):
- OpenSearch search module (requires infra + separate feature)
- Bull Board UI (queues dashboard — low priority)
- Git history secret rewrite (needs `git filter-repo` + credential rotation)

---

## 2. Phase 1 — Security & Environment

### Hardcoded Secrets Removal
`webhook-server.js` and `simulate.js` contained inline `CHAPA_SECRET`, `WEBHOOK_SECRET`, and a hardcoded HMAC signature. Replaced all with `process.env.CHAPA_SECRET_KEY` / `process.env.CHAPA_WEBHOOK_SECRET`, matching the naming convention already used across the NestJS codebase. Secrets remain in git history (`91e14f8`) — full remediation needs `git filter-repo` + credential rotation.

### Env Var Hygiene
`.env.example` had 4 dead variables never referenced in code (`TELEGRAM_CHANNEL_ID`, `CHAPA_PUBLIC_KEY`, `BULL_BOARD_USERNAME`, `BULL_BOARD_PASSWORD`) and was missing `AWS_ENDPOINT`, which the upload service actually uses. Removed dead vars; added `AWS_ENDPOINT`.

### Root `.gitignore`
Added `.env`, `.env.*` (with `!.env.example` exception), `node_modules/`, `dist/`, `.next/`, `coverage/`, and OS files.

---

## 3. Phase 2 — Backend Correctness

### Rate Limiting
`ThrottlerModule` was configured in `app.module.ts` but `ThrottlerGuard` was never registered as a global `APP_GUARD`. The `@Throttle()` decorators on auth routes were no-ops at runtime.

**Fix**: Registered `ThrottlerGuard` globally. Simplified config from 3 named throttlers (`short`/`medium`/`long`) to a single unnamed throttler (`{ ttl: 60_000, limit: 100 }`) — the named throttlers were never referenced by any route.

**v6 quirk**: The guard uses `totalHits > limit`, so `limit: N` allows N-1 requests. All limits bumped by 1:

| Route | Config limit | Effective limit |
|---|---|---|
| `POST /auth/register` | 6 | 5/min |
| `POST /auth/login` | 6 | 5/min |
| `POST /auth/forgot-password` | 4 | 3/min |
| `POST /auth/reset-password` | 4 | 3/min |
| `POST /escrow/callback` | 11 | 10/min |

**Verification**: 6 rapid POSTs to `/auth/login` — requests 1-5 return `401`, request 6 returns `429`.

### WalletProcessor Wiring
`WalletProcessor` handled a `release-pending` job type that nothing ever enqueued. `EscrowProcessor.handleAutoRelease()` updated wallet balances directly, bypassing the queue architecture entirely.

**Fix**: `EscrowProcessor` now enqueues `WALLET_JOBS.RELEASE_PENDING` to the `WALLET` queue after the 3-day hold. `WalletProcessor` owns only the balance state machine (pending → available + transaction record). `EscrowProcessor` handles event logging and notifications. Keeps the flow event-driven and consistent with existing BullMQ patterns.

### BullMQ Standardization
The codebase imported `Queue` and `Job` from the legacy `'bull'` package, while actually using BullMQ v5 via the `@nestjs/bull` bridge. Bull v4 API calls like `job.queue.add()` don't exist on BullMQ's `Job` type.

**Fix**: Replaced all `import { Queue } from 'bull'` / `import { Job } from 'bull'` with `import { Queue, Job } from 'bullmq'`. Removed `bull` and `@types/bull` from `package.json`. Replaced two `job.queue.add()` calls with injected queue references (`this.queue.add(...)`).

### Prisma Migrations
The repository had no `prisma/migrations/` directory. The Dockerfile used `prisma db push --accept-data-loss` as a fallback, which is dangerous for production.

**Fix**: Created the initial migration using `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (597 lines, 24 models). Dockerfile now uses `prisma migrate deploy`.

**Verification**: Zero drift confirmed — `prisma migrate diff --from-schema-datamodel --to-url <db>` detects no differences. Table count: 24 models.

---

## 4. Phase 2 — Operations

### Docker Compose Hardening
The compose file had no healthchecks, missing env var pass-through, permissive WebSocket CORS, and a dangerous migration strategy.

**Changes**:
1. **Healthchecks** on all 3 services (Postgres: `pg_isready`, Redis: `redis-cli ping`, backend: `curl` checking for non-5xx)
2. **`env_file: .env`** replaces inline `environment` block — all env vars reach the backend container
3. **Dockerfile CMD** changed from `prisma db push` to `migrate deploy` + `start:prod`
4. **WebSocket CORS** tightened from `origin: true` to `process.env.FRONTEND_URL`

### Tests
4 new test files covering the highest-risk areas:

| File | Coverage |
|---|---|
| `auth.service.spec.ts` | Register, duplicate email, login, invalid password |
| `auth.controller.spec.ts` | `@Throttle()` decorator metadata on all 4 routes |
| `wallet.processor.spec.ts` | Pending→available, idempotent retry |
| `escrow.processor.spec.ts` | Webhook funding, idempotency, unknown reference, auto-release |

22/22 tests pass across 9 suites.

---

## 5. Phase 3 — Frontend Integration

### API Client
Created `lib/config.ts` (reads `NEXT_PUBLIC_API_URL` with fallback to `http://localhost:4000/api/v1`) and `lib/api.ts` (typed fetch wrapper). All wired components use an API-first, mock-fallback strategy so the app builds and runs even when the backend is unreachable.

### Components Wired

| Component | Type | API Call | Fallback |
|---|---|---|---|
| `FeaturedJobs` | Server (async) | `fetchJobs()` on SSR | Mock `jobs` filtered to featured |
| `JobsListing` | Client (`useEffect`) | `fetchJobs()` + `fetchCategories()` | Mock jobs + categories |
| `JobDetailPage` | SSG (`generateStaticParams`) | `fetchJob(id)` | Mock `jobs.find()` + related |
| `CategoryGrid` | Client (`useEffect`) | `fetchCategories()` | Mock categories |
| `StatsBar` | Client (`useEffect`) | `fetchJobs()` + `fetchCategories()` for counts | Mock stats array |
| `Header` | Client (`useEffect`) | Reads `localStorage` for token | Shows Login/Sign Up when no token |

### Auth Page
Created `/login` with register/login toggle. Calls the backend auth endpoints. Stores JWT + refresh token + user info in `localStorage` under keys `beleqet_token`, `beleqet_refresh`, `beleqet_user`. After login, hard-navigates to `/` so the Header remounts and reflects the authenticated state.

### Seed Data
Extended `prisma/seed.ts` with 3 employer users, 3 companies (TakaCash, ethio telecom, Zemen Bank), and 3 published demo jobs. Uses `upsert` for idempotency — safe to run on every deploy.

---

## 6. Phase 3 — Deployment

### Railway Setup

| Setting | Value |
|---|---|
| Root Directory | `backend/` |
| Builder | Railpack (auto-detects Dockerfile) |
| Start Command | (none — `startup.sh` handles it) |
| Healthcheck Path | `/api/v1/jobs?limit=1` |

### Environment Variables Required

| Variable | Source |
|---|---|
| `DATABASE_URL` | Railway Postgres plugin (append `?sslmode=require`) |
| `REDIS_URL` | Railway Redis plugin |
| `JWT_ACCESS_SECRET` | `openssl rand -hex 64` |
| `FRONTEND_URL` | Vercel app URL |
| `NODE_ENV` | `production` |

### Railway Compatibility Fixes
1. **Redis URL parsing**: Railway provides a single `REDIS_URL` connection string, but the app expected separate `REDIS_HOST`/`PORT`/`PASSWORD` vars. Added `REDIS_URL` detection with `new URL()` parsing, falling back to individual vars.
2. **Startup script**: Created `startup.sh` that runs `prisma migrate deploy` → `prisma db seed` → `npm run start:prod`. Dockerfile updated to use it.
3. **Seed config**: Added `"prisma": { "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts" }` to `package.json` — required for `prisma db seed` to work.
4. **CORS**: Added trailing-slash stripping and dual-origin support (`FRONTEND_URL` + `localhost:3000`) for development convenience.

### Vercel Setup

| Setting | Value |
|---|---|
| Root Directory | `beleqet-jobs-nextjs/` |
| Build Command | `npm run build` |
| Install Command | `npm install` |
| Env Var | `NEXT_PUBLIC_API_URL=https://beleqet-interview-task-production.up.railway.app/api/v1` |

### Deployment Issues Encountered

| Issue | Root Cause | Fix |
|---|---|---|
| Docker build error | TS parse failure on block-body arrow function | Changed to IIFE inside parenthesized return |
| Healthcheck failing | `prisma db seed` crashed with `.ts` extension error | Added `--compiler-options {"module":"CommonJS"}` flag |
| Empty jobs API | Demo data in seed file was empty | Added 3 companies + 3 jobs to seed |
| CORS blocked | Trailing slash in `FRONTEND_URL` + single-origin only | Strip trailing slash + allow `localhost:3000` |
| Auth header not updating | `useEffect` with `[]` deps never re-runs after login | `window.location.href` for hard navigation |

---

## 7. Current Architecture

```
┌──────────────┐     ┌──────────────────────────────────────┐
│   Vercel     │     │           Railway                     │
│  (Frontend)  │     │         (Backend)                     │
│              │     │                                      │
│  Next.js 14  │────▶│  NestJS API (port 4000)              │
│  App Router  │     │    │                                  │
│              │     │    ├─ PostgreSQL (Railway plugin)     │
│              │     │    └─ Redis (Railway plugin)          │
│              │     │                                      │
│  /login      │     │  Startup flow:                       │
│  /jobs       │     │  1. prisma migrate deploy            │
│  /jobs/[id]  │     │  2. prisma db seed (idempotent)      │
│  /           │     │  3. node dist/main                   │
└──────────────┘     └──────────────────────────────────────┘
```

---

## 8. Demo Accounts & URLs

**Backend API**: `https://beleqet-interview-task-production.up.railway.app/api/v1`

**Frontend**: `https://beleqet-interview-task-xi.vercel.app`

### Demo Data
- 47 job categories from the Prisma seed
- 3 companies: TakaCash, ethio telecom, Zemen Bank
- 3 published jobs: Full Stack Developer, Digital Marketing Specialist, UI/UX Designer

### Registration
Anyone can register at `/login` with email + password. No email verification required (dev mode).

---

## 9. Out of Scope (Deferred)

| Item | Reason |
|---|---|
| **Auth context provider** | Token is in `localStorage` but no React context; protected routes not implemented |
| **Search module** (OpenSearch) | Requires Elasticsearch infra + separate feature |
| **Bull Board UI** | Queue management dashboard — low priority for demo |
| **Git history secrets** | `91e14f8` needs `git filter-repo` + credential rotation |
| **Email sending** | SMTP configured but `NODE_ENV=production` + no SMTP credentials on Railway |
| **Telegram bot** | Bot token not set on Railway — notifications disabled |
| **Chapa payments** | Test keys not configured — escrow flows untested in production |
| **File uploads** | AWS S3 not configured — uploads will fail |
| **OpenAI screening** | API key not set on Railway — AI-powered CV screening disabled |

---

## 10. Verification Checklist

| Check | Result |
|---|---|
| Backend build (`npm run build`) | ✅ Passes |
| Frontend build (`npm run build`) | ✅ Passes (22 pages) |
| Docker compose builds | ✅ Passes |
| All tests pass (22/22) | ✅ Passes |
| `POST /auth/register` | ✅ 201 with JWT |
| `POST /auth/login` | ✅ 200 with tokens |
| Rate limiting (6 rapid logins) | ✅ 5 allowed, 6th blocked |
| `GET /api/v1/jobs` | ✅ Returns 3 jobs with companies |
| `GET /api/v1/jobs/categories` | ✅ Returns 47 categories |
| CORS from Vercel | ✅ FRONTEND_URL set, trailing slash handled |
| Healthcheck `/api/v1/jobs?limit=1` | ✅ Passes |
| Login → Header shows "My Account" | ✅ |
| Category filter updates URL | ✅ Uses slug, triggers re-fetch |
| Mock fallback when API unreachable | ✅ All pages render gracefully |

---

## 11. File Summary

### Backend (Phase 2)

| File | Change |
|---|---|
| `backend/src/app.module.ts` | ThrottlerGuard + REDIS_URL parsing |
| `backend/src/modules/auth/auth.controller.ts` | `@Throttle()` on 4 routes |
| `backend/src/modules/escrow/escrow.controller.ts` | `@Throttle()` on callback |
| `backend/src/modules/escrow/escrow.processor.ts` | WALLET queue enqueue |
| `backend/src/modules/escrow/wallet.processor.ts` | Receives from WALLET queue |
| `backend/src/modules/chat/chat.gateway.ts` | Tightened CORS |
| `backend/prisma/migrations/` | Initial migration (597 lines, 24 models) |
| `backend/package.json` | Bull dep removed, prisma seed config added |
| `backend/Dockerfile` | startup.sh, migrate deploy |
| `backend/docker-compose.yml` | Healthchecks, env_file |
| `backend/startup.sh` | New: migrate → seed → start |
| `backend/src/main.ts` | CORS multi-origin + trailing-slash fix |
| `backend/webhook-server.js` | Secrets → env vars |
| `backend/simulate.js` | Secrets → env vars |
| `backend/prisma/seed.ts` | Demo companies + jobs added |
| `backend/.env.example` | Cleaned vars, REDIS_URL doc |

### Frontend (Phase 3)

| File | Change |
|---|---|
| `beleqet-jobs-nextjs/lib/config.ts` | New: API_URL from env |
| `beleqet-jobs-nextjs/lib/api.ts` | New: fetchJobs, fetchJob, fetchCategories |
| `beleqet-jobs-nextjs/app/login/page.tsx` | New: register/login form |
| `beleqet-jobs-nextjs/components/Header.tsx` | Auth-aware client component |
| `beleqet-jobs-nextjs/components/FeaturedJobs.tsx` | API-first, mock fallback |
| `beleqet-jobs-nextjs/components/JobsListing.tsx` | API-first, URL-based category filtering |
| `beleqet-jobs-nextjs/components/CategoryGrid.tsx` | API-first, slug-based links |
| `beleqet-jobs-nextjs/components/StatsBar.tsx` | API-first, live counts |
| `beleqet-jobs-nextjs/components/JobCard.tsx` | Decoupled from strict mock type |
| `beleqet-jobs-nextjs/app/jobs/[id]/page.tsx` | API-first, mock fallback |
| `beleqet-jobs-nextjs/.env.example` | New |
| `beleqet-jobs-nextjs/vercel.json` | New |
| `beleqet-jobs-nextjs/.env.local` | New (gitignored) |
