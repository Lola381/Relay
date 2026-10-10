# Tech Stack

Every technology in **relay**, what it does, where it's used in the code, and why it was chosen. Versions are from the `package.json` files.

## At a glance

```
Browser ── Next.js 16 / React 19 (apps/web, :3000)
   │  REST (JSON, Bearer token)        ▲ Server-Sent Events (live updates)
   ▼                                   │
Express 5 API (apps/api, :4000) ── Zod validation · permission rulebook · JWT auth
   │  Drizzle ORM (SQL, transactions, row locks)
   ▼
PostgreSQL 17 (database `pm`; tests use `pm_test`)

packages/shared: types, Zod schemas, permission rules, used by BOTH apps
```

| Layer | Technology |
|---|---|
| Language | TypeScript 5.9 everywhere (strict) |
| Runtime | Node.js 22+ |
| Front end | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, TanStack Query 5, React Hook Form 7, Radix UI, Fluent UI Icons, sonner, date-fns |
| Back end | Express 5, Zod 4, Drizzle ORM 0.45, node-postgres, jose (JWT), bcryptjs, helmet, cors, cookie-parser, express-rate-limit, pino |
| Database | PostgreSQL 17 (15+ required), SQL migrations via drizzle-kit |
| Real-time | Server-Sent Events (native `EventSource` in the browser, plain HTTP on the server) |
| Testing | Vitest 5, Supertest |
| Tooling | npm workspaces, tsx, concurrently, ESLint 10 + typescript-eslint, Prettier |

---

## 1. Monorepo and language

| Tech | Version | Where | What it does / why |
|---|---|---|---|
| **npm workspaces** | npm 10 | root [package.json](../package.json) (`workspaces: apps/*, packages/*`) | One install and one `node_modules` for three packages: `apps/api`, `apps/web` and `packages/shared`. The root scripts (`npm run dev`, `npm test`, `db:*`) drive all of them. |
| **TypeScript** | 5.9 | everywhere. Shared settings in [tsconfig.base.json](../tsconfig.base.json), plus one `tsconfig.json` per package. | Strict typing end to end. The API, the web app and the shared package all compile against the same types, so a changed response shape breaks the build instead of the demo. |
| **Node.js** | 22+ | runs the API and the Next.js dev server | Supplies the built-in `fetch`, `process.loadEnvFile` (used in [next.config.ts](../apps/web/next.config.ts)) and `crypto`. |
| **@pm/shared** (our own package) | | [packages/shared/src](../packages/shared/src) | **The single source of truth for both apps.** It holds:<br>• `enums.ts`: roles, statuses, priorities, activity and notification types<br>• `schemas/*`: Zod request schemas<br>• `dto.ts`: response types<br>• `permissions.ts`: **the permission rulebook**<br>• `mentions.ts`: the `@[Name](id)` mention format<br>The API imports it to *enforce* rules; the web app imports it to *validate forms* and *hide buttons*. |

## 2. Back end (`apps/api`)

| Tech | Version | Where | What it does / why |
|---|---|---|---|
| **Express** | 5.3 | [app.ts](../apps/api/src/app.ts), `modules/*/*.routes.ts` | HTTP framework. Version 5 passes errors from `async` handlers to the error middleware automatically, so no try/catch wrappers are needed. Routes only handle HTTP; the logic lives in `*.service.ts`. |
| **node:http** | built-in | [server.ts](../apps/api/src/server.ts) | Starts the server, with proper `listening`/`error` events. For example, it prints a clear message when port 4000 is busy. |
| **Zod** | 4.6 | request schemas in [packages/shared/src/schemas](../packages/shared/src/schemas), applied by `parse()` in [lib/validation.ts](../apps/api/src/lib/validation.ts); environment check in [config/env.ts](../apps/api/src/config/env.ts) | Validates every body, query and URL parameter. Bad input becomes **400** with `details: [{ path, message }]`. The same schemas power the web forms, so client and server rules can't drift apart. |
| **Drizzle ORM** | 0.45 | schema in [db/schema/*](../apps/api/src/db/schema); queries in every `*.service.ts` | Type-safe SQL. It supports what the concurrency design needs: transactions (`db.transaction`), row locks (`.for('update')` / `.for('share')`), subqueries, and `$count`. |
| **pg** (node-postgres) | 8.23 | [db/client.ts](../apps/api/src/db/client.ts) | The PostgreSQL driver with a connection pool (max 10). Pool errors are logged, not fatal. |
| **jose** | 6.2 | [lib/tokens.ts](../apps/api/src/lib/tokens.ts) | Signs and verifies the **access token**: an HS256 JWT valid for 15 minutes that holds only the user id. |
| **bcryptjs** | 3.0 | [lib/password.ts](../apps/api/src/lib/password.ts) | Password hashing. Only hashes are stored; the API never returns them. |
| **node:crypto** | built-in | [lib/tokens.ts](../apps/api/src/lib/tokens.ts), [events.routes.ts](../apps/api/src/modules/events/events.routes.ts) | Random refresh tokens and live-stream tickets. Refresh tokens are stored as **SHA-256 hashes**. |
| **cookie-parser** | 1.4 | [app.ts](../apps/api/src/app.ts), [lib/cookies.ts](../apps/api/src/lib/cookies.ts) | Reads the **refresh-token cookie** (`httpOnly`, `SameSite=Lax`, `Path=/api/v1/auth`). The token is rotated on every use, and reusing an old one revokes the whole login. |
| **helmet** | 8.3 | [app.ts](../apps/api/src/app.ts) | Security headers (no-sniff, frame protection and others). |
| **cors** | 2.8 | [app.ts](../apps/api/src/app.ts) | Lets the web app on :3000 call the API on :4000 with credentials (the refresh cookie). The allowed origin comes from `CORS_ORIGIN` in `.env`. |
| **express-rate-limit** | 8.7 | [middleware/rateLimit.ts](../apps/api/src/middleware/rateLimit.ts), on `/auth/login` and `/auth/register` | 10 **failed** attempts per 15 minutes, then **429**. Successful logins don't count. |
| **pino + pino-http** | 10.4 / 11.0 | [lib/logger.ts](../apps/api/src/lib/logger.ts), [app.ts](../apps/api/src/app.ts) | Structured JSON logs, a request id on every request (`X-Request-Id`), and `pino-pretty` for readable dev output. |
| **dotenv** | 18 | [config/env.ts](../apps/api/src/config/env.ts) | Loads the root `.env` (database URL, JWT secret, ports, CORS origin). |
| **Server-Sent Events** | HTTP standard | [modules/events/events.routes.ts](../apps/api/src/modules/events/events.routes.ts) | Real-time push. `POST /events/ticket` issues a single-use ticket valid for 30 seconds, then `GET /events?ticket=` opens a `text/event-stream`. A heartbeat keeps the connection alive. Recipients are computed per event from **current** project membership, plus admins. |

### How the back-end code is organised
| Folder | Role |
|---|---|
| `modules/<area>/*.routes.ts` | HTTP only: authenticate → `parse()` input → call the service → send JSON |
| `modules/<area>/*.service.ts` | Business logic inside **one transaction**: lock rows → check permission → check version → write → activity log → notifications → events |
| `access/` | `loadProjectAccess` (loads the project plus the caller's current role, with a row lock) and `assertProjectCan` (rulebook → 403/404) |
| `domain/` | Shared side effects: `logActivity`, `notify` (dedupes and never notifies the actor), `unassignMemberTasks` |
| `lib/tx.ts` + `lib/events.ts` | `withTransaction` queues events and publishes them **only after COMMIT** |
| `middleware/` | `authenticate` (re-reads the user on every request, so deactivation applies instantly), the rate limiter, and the error handler (every error becomes `{ error: { code, message, details } }`) |

Areas: `auth`, `me` (profile, password, dashboard), `users`, `projects` (plus members), `tasks`, `comments`, `activity`, `notifications`, `events`, `health`.

## 3. Database

| Tech | Version | Where | What it does / why |
|---|---|---|---|
| **PostgreSQL** | 17 locally (15+ required) | databases `pm` (app) and `pm_test` (tests); setup in [scripts/setup-local-db.mjs](../scripts/setup-local-db.mjs), Docker alternative in [docker-compose.yml](../docker-compose.yml) | Relational store. The minimum is 15 because of the composite FK with `ON DELETE SET NULL (assignee_id)`. |
| **drizzle-kit** | 0.31 | [drizzle.config.ts](../apps/api/drizzle.config.ts), migrations in [db/migrations](../apps/api/src/db/migrations) | Generates and applies **versioned SQL migrations**. `npm run db:studio` opens a table browser. |
| **Seed** | our code | [db/seed/fixtures.ts](../apps/api/src/db/seed/fixtures.ts), [seed.ts](../apps/api/src/db/seed/seed.ts) | Demo users, projects, tasks, comments, notifications and activity, all with fixed ids. Dates are relative to "now", so overdue tasks always look right. `npm run db:reset` rebuilds everything. |

**Tables:**
- `users`
- `refresh_tokens`
- `projects`
- `project_members`
- `tasks`
- `comments`
- `comment_mentions`
- `notifications`
- `activity_logs`

**Rules the database enforces itself:**
- **Unique email, any case:** a unique index on `lower(email)`.
- **Unique names for active projects:** a partial unique index, so an archived project's name can be reused.
- **Assignees must be project members:** a composite FK `(project_id, assignee_id) → project_members`.
- **Consistency CHECKs:**
  - `completed_at` is set exactly when a task is DONE;
  - `archived_at` exactly when a project is ARCHIVED;
  - `deactivated_at` exactly when a user is inactive.
- **No self-notifications.**
- **Valid enum values:** CHECKs generated from the shared enums.

**Concurrency:**
- **Versions:** `tasks.version` and `projects.version` support optimistic locking, so a stale write gets **409**.
- **Lock order:** writes take `SELECT … FOR SHARE` on the project and then `FOR UPDATE` on the task. The order is always the same, so concurrent writes can't deadlock.

## 4. Front end (`apps/web`)

| Tech | Version | Where | What it does / why |
|---|---|---|---|
| **Next.js** | 16.4 (App Router, Turbopack) | [src/app](../apps/web/src/app); config in [next.config.ts](../apps/web/next.config.ts) | Routing and layouts. `(app)/layout.tsx` is the signed-in shell and route guard. Also provides `not-found.tsx` (404), `error.tsx` and `global-error.tsx` (crash pages), and loads the root `.env`. |
| **React** | 19.3 | all components | The UI. Pages are client components because they rely on live data and the in-memory session. |
| **TanStack Query** | 5.104 | [providers.tsx](../apps/web/src/app/providers.tsx), [lib/api/queries](../apps/web/src/lib/api/queries), every page | Server-state cache: loading and error states, `useInfiniteQuery` for "Load more", and optimistic updates with rollback on the task board. **Live events invalidate query keys**, so data is always refetched from the API with permissions re-checked. |
| **fetch wrapper** (our code) | | [lib/api/client.ts](../apps/web/src/lib/api/client.ts) | Base URL, JSON, `Authorization: Bearer`, and errors turned into `ApiError` objects. The access token is kept **in memory only**. On a 401 it silently refreshes once and retries; refreshes run one at a time, coordinated across tabs with a **Web Lock**. |
| **EventSource** (browser API) | | [lib/live/useLiveEvents.ts](../apps/web/src/lib/live/useLiveEvents.ts) | Connects to the SSE stream with a fresh ticket and reconnects on error. Each event invalidates the matching queries and shows toasts for notifications. Drives the "Live" dot in the top bar. |
| **React Hook Form** + **@hookform/resolvers** | 7.89 / 5.9 | [login/LoginForm.tsx](../apps/web/src/app/login/LoginForm.tsx), [CreateProjectPane](../apps/web/src/components/features/projects/CreateProjectPane.tsx), [EditProjectPane](../apps/web/src/components/features/projects/EditProjectPane.tsx) | Forms with **the same Zod schemas as the API** (via `zodResolver`). Server field errors are mapped back onto the inputs ([lib/forms.ts](../apps/web/src/lib/forms.ts)). |
| **Tailwind CSS** + **@tailwindcss/postcss** | 4.3 | [globals.css](../apps/web/src/app/globals.css) and every component | Styling. Colours are CSS variables, with **light/dark themes** via `prefers-color-scheme` and `data-theme`. Also holds the Metro tile grid variables (`--tile-unit`, `--tile-gap`) and the tile-flip animation. |
| **Radix UI** (Dialog, Dropdown Menu, Popover) | 1.2 / 2.1 / 1.2 | [SidePane](../apps/web/src/components/metro/SidePane.tsx) (Dialog); [TopBar](../apps/web/src/components/shell/TopBar.tsx) account menu (Dropdown); [NotificationBell](../apps/web/src/components/shell/NotificationBell.tsx) (Popover) | Accessible building blocks: focus trapping, Esc to close, ARIA roles. They're unstyled, so they take the Metro look. |
| **@fluentui/react-icons** | 2.0 | re-exported from [components/icons.ts](../apps/web/src/components/icons.ts) | Microsoft Fluent icons, matching the Windows 8 / Metro design language. |
| **sonner** | 2.0 | [providers.tsx](../apps/web/src/app/providers.tsx) (Toaster), used in pages | Toasts: "Task saved", live notification pop-ups and errors. |
| **date-fns** | 4.4 | [lib/format.ts](../apps/web/src/lib/format.ts), notification and activity lists | Relative times ("5 minutes ago"), day groups (Today, Yesterday) and date formats. |
| **Navigation API / Web Locks / bfcache** (browser APIs) | | [lib/auth/historyGuard.ts](../apps/web/src/lib/auth/historyGuard.ts), [AuthProvider](../apps/web/src/lib/auth/AuthProvider.tsx) | Back can't return into a previous user's session; refreshes are serialised across tabs; pages restored from the back-forward cache are reloaded. |

### Front-end structure
| Folder | Role |
|---|---|
| `app/login`, `app/signup` | Public pages (with the theme toggle) |
| `app/(app)/…` | Signed-in pages: `dashboard`, `projects`, `projects/[id]` (Overview, Tasks, Team, Activity tabs), `notifications`, `users`, `activity` |
| `components/metro/*` | The design system: `Tile` (flip tiles), `Panorama`, `TileGroup`, `Pivot`, `AppBar`, `SidePane`, `ConfirmBand`, `MenuButton`, `States` (loading, empty, error) |
| `components/shell/*` | `TopBar`, `NotificationBell`, `ThemeToggle`, `ProfilePane` |
| `components/features/*` | Feature UI: projects, tasks (`TaskDetailPane` with comments and history), activity feed |
| `lib/` | API client and queries, auth provider, live events, permissions (`canInProject` / `canInSystem` wrap the shared rulebook), message formatting, theme |

## 5. Testing and quality

| Tech | Version | Where | What it does |
|---|---|---|---|
| **Vitest** | 5.0 | [apps/api/tests](../apps/api/tests), [vitest.config.ts](../apps/api/vitest.config.ts) | **284 API tests** against the separate `pm_test` database. It's rebuilt from the migrations on each run and re-seeded before every test. |
| **Supertest** | 7.3 | the same tests | Sends real HTTP requests to the Express app in-process. The SSE tests use a real listening server plus `fetch`. |
| **ESLint** + **typescript-eslint** + **eslint-config-next** | 10 / 8.71 / 16.4 | [eslint.config.mjs](../eslint.config.mjs) | Linting, including React hooks rules. `npm run check` runs typecheck plus lint. |
| **Prettier** | 3.9 | `npm run format` | Code formatting. |

What the test files cover:
- `permissions.test.ts`: the full role × action matrix.
- `auth.test.ts`: login, refresh rotation, reuse detection, rate limit.
- `access.test.ts`: 401 / 403 / 404 rules.
- `projects.test.ts`, `members.test.ts`: CRUD, archive, role ceiling, 409.
- `tx.test.ts`: events only after commit.
- `dbErrors.test.ts`: database errors mapped to API errors.
- `features.test.ts`: comments, notifications, task history, user admin, sign-up, `/me`, `/dashboard`, SSE delivery.

## 6. Dev tooling and scripts

| Tool | Version | Used for |
|---|---|---|
| **tsx** | 4.23 | Runs the TypeScript API directly, with `watch` reload in development |
| **concurrently** | 10 | `npm run dev` starts the API and the web app together |
| **rolldown** | 1.2 | Pinned as a direct dev dependency to work around an npm bug with its native binary (used by Vitest's bundler) |
| **Docker Compose** | optional | [docker-compose.yml](../docker-compose.yml) runs Postgres 16 on port 5433 if you'd rather not install PostgreSQL |

| Script | What it does |
|---|---|
| `npm run dev` | API (:4000) and web (:3000) together |
| `npm test` | 284 API tests |
| `npm run check` | Typecheck and lint all packages |
| `npm run db:migrate` / `db:seed` / `db:reset` / `db:studio` | Apply migrations, seed demo data, rebuild everything, browse tables |
| `npm run db:setup-local` | Create the `pm` role and the `pm` / `pm_test` databases on a local PostgreSQL |
| `npm run demo:api` | Colour-coded walkthrough of the 401/403/404/400/409 cases and live delivery |
| `scripts\backend-tour.ps1` | PowerShell tour of every API area |

## 7. Why these choices (short answers for the evaluator)

| Decision | Reason |
|---|---|
| **Separate Express API** rather than Next.js API routes | Keeps all authorization and business logic in one server process that any client (web, Postman, scripts) must go through. It's also easier to test and holds long-lived SSE connections cleanly. |
| **SSE** over WebSockets or Socket.IO | Live traffic only flows server → client; writes are already REST. SSE is plain HTTP (same auth, CORS and logging), the browser reconnects automatically, and no extra library or protocol is needed. |
| **PostgreSQL + Drizzle** | Real transactions, row locks for the version checks, constraints that enforce rules in the database itself, and SQL-first migrations. Drizzle stays close to SQL while still being type-safe. |
| **Optimistic locking (version column)** | Matches the brief's example exactly (version 7 → 8 → 409). No long-held locks while users are editing. |
| **Shared rulebook package** | One definition of who can do what. The server enforces it; the UI only reads it to hide buttons, so they can't disagree. |
| **Access token in memory + rotating httpOnly refresh cookie** | Scripts injected into the page can't read the long-lived token, sessions survive reloads, and a stolen, already-used refresh token is detected and the whole login revoked. |
| **TanStack Query + invalidate-on-event** | Live events never push data straight into the UI. They trigger refetches, so every update is permission-checked again by the server. |
