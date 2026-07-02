# Beleqet Backend — NestJS API

ይህ ፕሮጀክት በ NestJS እና በ PostgreSQL ላይ የተገነባ፣ ለ "Beleqet" የሥራ እና የፍሪላንስ መድረክ (Hiring & Freelance Platform) የተዘጋጀ ሙሉ (Production-ready) የኋላ መተግበሪያ (Backend API) ነው። ይህ መድረክ ቀጣሪዎችን እና ፈላጊዎችን በኤአይ (AI) ታግዞ የሚያገናኝ ሲሆን፣ የገንዘብ ክፍያ አስተዳደርን (Escrow) እና የስራ ፍሰት አውቶሜሽንን (Event-Driven Workflow) ያካተተ ነው።

## Quick Start

```bash
# 1. Start Postgres + Redis + API
cd backend
docker compose up -d

# 2. Set up environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL, JWT secrets, OPENAI_API_KEY

# 3. Install dependencies
npm install

# 4. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate

# 5. Seed demo data
npm run prisma:seed

# 6. Start in dev mode (hot reload)
npm run start:dev
```

**API** → http://localhost:4000/api/v1  
**Swagger** → http://localhost:4000/api/docs

---

## Module Map

```
src/
├── main.ts                        Bootstrap — Swagger, CORS, pipes, helmet
├── app.module.ts                  Root module — wires everything together
├── prisma/
│   ├── prisma.service.ts          PrismaClient wrapper (global singleton)
│   └── prisma.module.ts           @Global module
├── common/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts      Protects all routes needing auth
│   │   └── roles.guard.ts         RBAC — ADMIN / EMPLOYER / JOB_SEEKER / FREELANCER
│   ├── decorators/
│   │   ├── current-user.decorator.ts   @CurrentUser() param decorator
│   │   └── (roles defined in same file) @Roles('EMPLOYER')
│   ├── filters/
│   │   └── http-exception.filter.ts   Consistent JSON error responses
│   ├── interceptors/
│   │   └── logging.interceptor.ts     Request/response timing logs
│   └── pipes/
│       └── parse-uuid.pipe.ts         UUID validation pipe
└── modules/
    ├── auth/                          JWT register/login/refresh/logout
    ├── users/                         Profile, company, notifications
    ├── jobs/                          Job CRUD + paginated search
    ├── applications/            ★     Submit → fires AI workflow
    ├── screening/               ★     BullMQ worker — OpenAI scoring
    ├── notifications/           ★     BullMQ worker — Telegram/in-app
    ├── analytics/               ★     BullMQ worker — event log
    ├── freelance/                     Gigs, bids, contracts, milestones
    ├── escrow/                  ★     BuleqetSafe — Chapa webhook + auto-release
    ├── wallet/                  ★     Balance management + withdrawal
    ├── queues/                        Queue name constants (no logic)
    └── search/                        Phase 2 — OpenSearch stub
```
★ = has a BullMQ processor (background worker)

---

## Event-Driven Workflow

```
POST /api/v1/applications
  ApplicationsService.submit()
  ├── DB: Application { status: SUBMITTED }
  ├── Queue → screen-candidate         ← ScreeningProcessor
  ├── Queue → notify-recruiter-*       ← ScreeningProcessor
  └── Queue → update-job-stats         ← AnalyticsProcessor

ScreeningProcessor
  ├── OpenAI: score cover letter vs JD  (0–100)
  ├── DB: CandidateScore saved
  ├── DB: Application → SHORTLISTED | REJECTED | SCREENING
  ├── Queue → send-in-app (candidate)   ← NotificationsProcessor
  ├── Queue → send-telegram (recruiter) ← NotificationsProcessor
  ├── if score ≥ 90: schedule-interview ← ScreeningProcessor
  └── Queue → log-platform-event        ← AnalyticsProcessor

POST /api/v1/escrow/callback (Chapa webhook)
  EscrowProcessor.handleWebhook()
  ├── DB: EscrowTransaction { status: FUNDED }
  ├── DB: FreelanceJob { status: FUNDED }
  └── Queue → send-in-app (client)      ← NotificationsProcessor

PATCH /api/v1/escrow/milestones/:id/release
  EscrowService.releaseMilestone()
  └── Queue → auto-release (3-day delay) ← EscrowProcessor
        ├── DB: Wallet pending→available
        ├── DB: WalletTransaction
        └── Queue → send-in-app + telegram ← NotificationsProcessor
```

---

## Database (Prisma Schema Models)

| Model               | Domain       | Purpose                                     |
|---------------------|--------------|---------------------------------------------|
| `User`              | Identity     | All user types (role flag per row)          |
| `RefreshToken`      | Auth         | Rotating JWT refresh tokens                 |
| `Company`           | Identity     | Employer org profile                        |
| `JobCategory`       | Jobs         | Job taxonomy                                |
| `Job`               | Jobs         | Vacancy listings                            |
| `Application`       | Jobs         | Candidate applications                      |
| `CandidateScore`    | AI           | OpenAI scoring result per application       |
| `FreelanceCategory` | Freelance    | Gig taxonomy                                |
| `FreelanceJob`      | Freelance    | Project/gig listings                        |
| `Bid`               | Freelance    | Freelancer proposals                        |
| `Contract`          | Freelance    | Hired agreement                             |
| `Milestone`         | Freelance    | Payment milestones within a contract        |
| `Deliverable`       | Freelance    | Submitted work files per milestone          |
| `EscrowTransaction` | Payments     | BeleqetSafe fund hold                       |
| `FreelancerWallet`  | Payments     | Pending/available balances                  |
| `WalletTransaction` | Payments     | Credit/debit ledger entries                 |
| `Dispute`           | Payments     | Escrow disputes                             |
| `Notification`      | Comms        | In-app notification inbox                  |
| `EventLog`          | Audit        | Append-only domain event log                |

---

## API Route Reference

```
Auth
  POST   /auth/register
  POST   /auth/login
  POST   /auth/refresh
  POST   /auth/logout           🔒
  GET    /auth/me               🔒

Users
  GET    /users/profile         🔒
  PATCH  /users/profile         🔒
  GET    /users/company         🔒
  POST   /users/company         🔒
  GET    /users/notifications   🔒
  PATCH  /users/notifications/:id/read  🔒

Jobs
  GET    /jobs                  (public) ?q=&category=&location=&type=&page=&limit=
  GET    /jobs/:id              (public)
  POST   /jobs                  🔒 EMPLOYER
  PATCH  /jobs/:id              🔒 EMPLOYER
  DELETE /jobs/:id              🔒 EMPLOYER
  GET    /jobs/my               🔒 EMPLOYER

Applications
  POST   /applications          🔒 → triggers AI screening workflow
  GET    /applications/my       🔒
  GET    /applications/job/:id  🔒 EMPLOYER
  GET    /applications/:id      🔒
  PATCH  /applications/:id/status  🔒 EMPLOYER

Freelance
  GET    /freelance/jobs        (public)
  GET    /freelance/jobs/:id    (public)
  POST   /freelance/jobs        🔒
  POST   /freelance/jobs/:id/bids        🔒
  PATCH  /freelance/bids/:id/accept      🔒
  GET    /freelance/my-bids              🔒
  GET    /freelance/contracts/:id        🔒
  PATCH  /freelance/milestones/:id/approve  🔒

Escrow
  POST   /escrow/initiate/:gigId         🔒
  POST   /escrow/callback       (no auth — Chapa webhook)
  POST   /escrow/milestones/:id/release  🔒

Wallet
  GET    /wallet                🔒
  POST   /wallet/withdraw       🔒
```

🔒 = requires `Authorization: Bearer <access_token>`

### Payload Examples

**1. Register (`POST /auth/register`)**
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "firstName": "Abebe",
  "lastName": "Kebede",
  "role": "JOB_SEEKER" 
}
```

**2. Create Job (`POST /jobs`)**
```json
{
  "title": "Senior Frontend Developer",
  "description": "We are looking for an experienced React developer...",
  "requirements": ["React", "TypeScript", "3+ years experience"],
  "location": "Addis Ababa, Ethiopia",
  "jobType": "FULL_TIME",
  "salaryMin": 30000,
  "salaryMax": 50000,
  "categoryId": "uuid-of-category"
}
```

**3. Submit Application (`POST /applications`)**
```json
{
  "jobId": "uuid-of-job",
  "coverLetter": "I have 5 years of experience building scalable frontends...",
  "resumeUrl": "https://example.com/resume.pdf"
}
```

**4. Create Freelance Gig (`POST /freelance/jobs`)**
```json
{
  "title": "E-commerce App UI Design",
  "description": "Need a Figma design for a 5-page e-commerce app.",
  "budget": 15000,
  "deadline": "2026-08-01T00:00:00Z",
  "categoryId": "uuid-of-freelance-category"
}
```

**5. Login (`POST /auth/login`)**
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

**6. Create Company Profile (`POST /users/company`)**
```json
{
  "name": "Tech Solutions PLC",
  "logoUrl": "https://example.com/logo.png",
  "website": "https://techsolutions.com",
  "description": "A leading software development company..."
}
```

**7. Update Application Status (`PATCH /applications/:id/status`)**
```json
{
  "status": "SHORTLISTED" // e.g., SHORTLISTED, REJECTED, HIRED
}
```

---

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/db` |
| `REDIS_HOST` | ✅ | Default: `localhost` |
| `REDIS_PORT` | ✅ | Default: `6379` |
| `JWT_ACCESS_SECRET` | ✅ | `openssl rand -hex 64` |
| `OPENAI_API_KEY` | ✅ | AI screening |
| `TELEGRAM_BOT_TOKEN` | Recommended | Job alert notifications |
| `CHAPA_SECRET_KEY` | Freelance | BeleqetSafe payments |
| `CHAPA_WEBHOOK_SECRET` | Freelance | Webhook signature verification |

See `.env.example` for the full list.

---

## Scripts

```bash
npm run start:dev       # Hot-reload development server
npm run build           # Compile TypeScript → dist/
npm run start:prod      # Run compiled production build
npm run prisma:generate # Regenerate Prisma client after schema changes
npm run prisma:migrate  # Apply pending migrations
npm run prisma:seed     # Seed demo data
npm run prisma:studio   # Open Prisma Studio (DB GUI)
npm run test            # Run unit tests
npm run test:cov        # Test coverage report
```

---

## Phase 2 — Engineering Notes

### What was fixed

| Task | Summary |
|------|---------|
| **Security** | Removed hardcoded Chapa secrets from dev scripts (`webhook-server.js`, `simulate.js`); added root `.gitignore`; removed dead env vars; added `AWS_ENDPOINT` to `.env.example` |
| **Wallet wiring** | Connected `WalletProcessor` to the event chain — `EscrowProcessor` now enqueues `release-pending` jobs to the `WALLET` queue instead of updating wallet balances directly (cleaner separation of concerns) |
| **BullMQ imports** | Standardized all `'bull'` imports to `'bullmq'`; removed unused `bull` + `@types/bull` deps; replaced two `job.queue.add()` calls with injected queues (BullMQ's `Job` doesn't have a `.queue` property) |
| **Rate limiting** | Applied `@Throttle()` to login, register, forgot-password, reset-password, and escrow callback |
| **Prisma migrations** | Created initial migration file (`prisma/migrations/`); Dockerfile now runs `migrate deploy` instead of `db push --accept-data-loss` |
| **Docker Compose** | Added `healthcheck` blocks for `db` and `redis`; backend now waits for healthy dependencies; all env vars passed through via `env_file: .env` |
| **WebSocket CORS** | Tightened `ChatGateway` from `origin: true` to `FRONTEND_URL` env var |
| **Tests** | Added meaningful unit tests for `AuthService`, `AuthController` (throttle metadata), `WalletProcessor`, and `EscrowProcessor` |

### Scope decisions

- **Search module** left as a stub (Phase 2 — OpenSearch integration deferred)
- **Frontend-backend integration** not attempted (frontend still uses `mockData.ts`)
- **Bull Board UI** not wired up (would need `@bull-board/express` middleware + basic auth — low ROI for this pass)
- **Git history secret remediation** flagged but not executed (would require `git filter-repo`/BFG + secret rotation — out of scope for this exercise)

### Running tests

```bash
cd backend
npm test                 # All unit tests
npm run test:cov         # With coverage
```

See [`TECHNICAL_REPORT.md`](../TECHNICAL_REPORT.md) at the repo root for detailed reasoning on each decision.
```
