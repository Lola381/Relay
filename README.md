# relay: Collaborative Project Management Platform

NeoStats Full Stack Hackathon submission. Multi-user project management with role-based authorization enforced on the server, optimistic concurrency (HTTP 409), an activity log, notifications, and a Windows 8 / Metro UI.

- **Web:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + TanStack Query
- **API:** Express 5 + TypeScript + Zod, a separate process
- **DB:** PostgreSQL 15+ with Drizzle ORM and SQL migrations
- **Monorepo:** npm workspaces: `apps/web`, `apps/api`, and `packages/shared` (types, Zod schemas, and the permission rulebook used by both apps)

Design docs: [API reference (as built)](docs/API_REFERENCE.md) · [API design](docs/API_DESIGN.md) · [Data model](docs/DATA_MODEL.md) · [UI requirements](docs/UI_REQUIREMENTS.md) · [Implementation plan](docs/IMPLEMENTATION_PLAN.md) · [Architecture note](docs/ARCHITECTURE.md) · [Demo guide](docs/DEMO_GUIDE.md)

## Prerequisites
- Node.js 22+
- PostgreSQL 15+ (local install **or** Docker)

## Setup

```bash
npm install
cp .env.example .env          # then set JWT_ACCESS_SECRET (command in the file)
```

**Database: pick one**
- **Docker:** `npm run db:up` (Postgres 16 on port **5433**, matching `.env.example`).
- **Local PostgreSQL:**
  ```powershell
  $env:PG_ADMIN_URL = "postgres://postgres:<password>@localhost:5432/postgres"
  npm run db:setup-local      # creates role pm/pm and databases pm + pm_test
  ```
  Then change `5433` → `5432` in both URLs in `.env`.

```bash
npm run db:migrate            # apply migrations
npm run db:seed               # demo data (idempotent)
npm run dev                   # API on :4000 and web on :3000
```

Open http://localhost:3000. `npm run db:reset` rebuilds the database from scratch (drop, migrate, seed).

## Environment variables (`.env` at the repo root, read by both apps)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` / `TEST_DATABASE_URL` | App database and the test database (the tests wipe the test one) |
| `API_PORT` | API port (default 4000) |
| `CORS_ORIGIN` | Browser origin(s) allowed to call the API |
| `JWT_ACCESS_SECRET` | ≥ 32 random characters for signing access tokens |
| `JWT_ACCESS_TTL_MINUTES` / `REFRESH_TOKEN_TTL_DAYS` | Session lifetimes |
| `NEXT_PUBLIC_API_URL` | API base URL used by the web app |

## Demo accounts (password `Password123!`)

| Role | Email |
|---|---|
| Admin | admin@demo.com |
| Project manager | pm@demo.com |
| Team member | alice@demo.com, bob@demo.com, carol@demo.com |
| Viewer | viewer@demo.com, meera@demo.com |
| Deactivated (cannot log in) | inactive@demo.com |

The login page also has one-click demo account buttons.

## Scripts

| Script | |
|---|---|
| `npm run dev` | API + web together |
| `npm test` | API test suite (Vitest + Supertest against `pm_test`, rebuilt from migrations on each run) |
| `npm run check` | Typecheck + lint all workspaces |
| `npm run demo:api` | Live walkthrough against the running API: 401 / 403 / 404 rejections, a 409 stale update, and SSE delivery |
| `npm run db:migrate` / `db:seed` / `db:reset` / `db:studio` | Database commands |

## Status

**Done**
- **Authentication:** login, rotating refresh tokens in an httpOnly cookie with reuse detection, login rate limit.
- **Server-side authorization:** a shared rulebook; outsiders get 404, everything else forbidden gets 403.
- **Projects:** CRUD, archive/unarchive, and delete with typed-name confirmation.
- **Team:** add members, change roles (with the role-ceiling rules), remove members (their tasks are unassigned).
- **Tasks:** CRUD, assign, change status; the board has optimistic moves with rollback.
- **Optimistic locking:** a stale version gets **409** naming who changed it, and the UI offers *Use latest / Re-apply / Move anyway*.
- **Activity log and notifications:** both are written in the same transaction as the change.
- **Tests:** 265 API tests covering the whole permission matrix, auth, access, conflicts, members and projects.

- **Real-time (SSE):** `GET /events` with single-use ticket auth; boards, comments, activity, dashboard and the notification badge update live across browsers (a "Live" dot in the top bar shows the connection).
- **Comments and @mentions:** task detail pane with comments; mentions notify the person.
- **Notifications:** bell with unread badge, mark read / mark all read, links to the task.
- **Activity feeds:** a per-project Activity tab, plus a system-wide feed for admins.
- **Start dashboard:** Metro tiles for my tasks, projects and notifications (plus Users/Activity for admins).
- **Users admin:** create users, change system roles (role-ceiling and last-admin guards), deactivate (revokes sessions) / reactivate.

**Known gaps**
- The new endpoints (comments, notifications, activity, users, events) were smoke-tested end to end but don't have dedicated Vitest suites yet.
- No `Last-Event-ID` replay: a client that reconnects refetches its data instead.

**Demo script:** open two browsers, pm@demo.com and alice@demo.com. As pm, open Website Revamp → Tasks, open a task assigned to Alice and post a comment that @mentions her: her bell, board and activity update instantly. Then have both edit the same task: the second save gets a 409 naming who changed it.

## AI usage
Built with Claude Code as a pair programmer. The architecture and trade-offs (SSE with ticket auth, the composite assignee FK, row-lock ordering, refresh-token rotation with a grace window, and the shared permission rulebook) were discussed and decided step by step and are documented in `docs/`. Every change was type-checked, tested and reviewed before committing.
