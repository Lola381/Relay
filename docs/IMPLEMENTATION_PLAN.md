# Implementation Plan: Stack, Backend Design & Code Structure

Companion to [API_DESIGN.md](API_DESIGN.md), [DATA_MODEL.md](DATA_MODEL.md) and [UI_REQUIREMENTS.md](UI_REQUIREMENTS.md).

Goal: choose tools that **cover every requirement with the least friction** (no fighting the framework, no Windows-specific install problems, one command to run everything), while keeping every line explainable.

---

## 1. Stack Decisions

| Layer | Choice | Why this one (and not the alternative) |
|---|---|---|
| Repo | **npm workspaces monorepo** (`apps/web`, `apps/api`, `packages/shared`) | npm comes with Node, so there's nothing extra to install. One repo, one install, and shared types/validation between web and API |
| Language | **TypeScript** (strict) everywhere | The brief prefers it. Shared types catch contract drift between web and API at compile time |
| Backend | **Express 5** | Express 5 forwards async errors to the error handler natively (no wrapper boilerplate). SSE is just a long-lived response, so no adapter is needed. NestJS's guards/DI add ceremony and decorator magic that's harder to explain line by line. Our authorization is an explicit policy layer anyway |
| DB driver + query layer | **Drizzle ORM** on **node-postgres (`pg`)** | Type-safe queries that read like SQL. First-class transactions, `RETURNING`, row locks (`.for('update')`/`.for('share')`), partial and expression indexes, check constraints. Prisma can't express the PG15 `ON DELETE SET NULL (assignee_id)` composite FK or row locks cleanly |
| Migrations | **drizzle-kit generate** + **one hand-written SQL migration** for the PG15 composite FK and any constraint Drizzle can't model | The schema can be rebuilt from scratch with one command (`npm run db:migrate`) |
| Database | **PostgreSQL 16** via **Docker Compose** (meets the PG15+ requirement) | No local Postgres install needed. A second `pm_test` database for tests |
| Validation | **Zod** schemas in `packages/shared` | **One** schema validates both the frontend form and the API request. Field limits can't drift apart |
| Auth | Own JWT with **`jose`** (access, 15 min) + rotating refresh tokens (DB) + **`bcryptjs`** for passwords | `jose` has no native dependencies. `bcryptjs` is pure JS, so no node-gyp/Windows build issues. A full auth library would hide exactly the parts reviewers will ask about |
| Real-time | **SSE**, a hand-rolled hub (~200 lines) | Decided already. No library needed, and fully explainable |
| HTTP hardening | `helmet`, `cors`, `cookie-parser`, `express-rate-limit` (login only) | Standard, configured once |
| Logging | `pino` + `pino-http` (pretty output in dev) | Structured logs with a request id on every line |
| Frontend | **Next.js 16 (App Router, Turbopack)** + **Tailwind CSS v4** | Recommended by the brief. v16 is the installed version (async `params`/`cookies()` only) |
| Server state | **TanStack Query** | Caching, refetch on reconnect, optimistic updates with rollback. SSE events update its cache directly |
| Forms | **React Hook Form** + `@hookform/resolvers/zod` | Uses the shared Zod schemas |
| UI primitives | **Radix UI** (Dialog, Popover, DropdownMenu, Tooltip), styled Metro-flat with Tailwind | Accessibility (focus trap, Esc, aria) for free without imposing a look. Our dialogs, flyouts and panes sit on top of these |
| Animation | **Motion** (`motion/react`) | Tile flip, live-tile cycling, page turnstile, `useReducedMotion` |
| Drag & drop | **dnd-kit** | Accessible (keyboard drag) Kanban columns |
| Icons | **@fluentui/react-icons** | Microsoft's own glyph set, so it matches the Metro language |
| Toasts | **sonner**, restyled to Metro | Handles stacking and timers |
| Dates | `date-fns` | Relative times, "due this week", overdue |
| Tests | **Vitest** + **Supertest** (API, against a real Postgres test DB). Optional **Playwright** for the two-browser real-time demo | Tests that run against real DB constraints catch more than mocks |
| Dev runner | `tsx watch` (API), `next dev` (web), **`concurrently`** at the root | `npm run dev` starts everything |
| Quality | ESLint + Prettier, `tsc --noEmit` in the `check` script | |

### Decisions adopted from earlier open questions
- Deactivated users **keep** their task assignments (badge in the UI, can't be newly assigned).
- Concurrency uses a **whole-row version** (any concurrent edit → 409 + comparison dialog).
- "Overdue" uses the **server's UTC date**.

### Why the web app talks to the API directly (no Next.js proxy)
A Next.js `rewrites` proxy would remove CORS, but the Next dev proxy can **buffer or compress streaming responses, which breaks SSE**. So the browser calls `http://localhost:4000` directly:
- CORS allowlist `http://localhost:3000` with `credentials: true`.
- Refresh cookie `httpOnly; SameSite=Lax; Path=/api/v1/auth`.

Pages are **client components**. The access token lives only in memory, so server-side rendering wouldn't have it anyway. Next.js provides routing, layouts and the build.

---

## 2. Repository Layout

```
/
├─ apps/
│  ├─ api/                      Express API + SSE
│  └─ web/                      Next.js UI
├─ packages/
│  └─ shared/                   Zod schemas, enums, DTO types, SSE event types, permission rules, error codes
├─ docs/                        API_DESIGN, DATA_MODEL, UI_REQUIREMENTS, this plan, ARCHITECTURE (submission note)
├─ docker-compose.yml           postgres:16 (pm + pm_test databases)
├─ .env.example                 every variable, with comments
├─ package.json                 workspaces + root scripts
└─ README.md
```

### 2.1 `packages/shared`

```
src/
├─ enums.ts            SystemRole, ProjectRole, TaskStatus, TaskPriority, ProjectStatus, ActivityAction, NotificationType
├─ schemas/            Zod request schemas: auth, users, projects, members, tasks, comments, notifications, query params
├─ dto.ts              Response types (User, Project, Task, Comment, ActivityLog, Notification, Paginated<T>, ApiError)
├─ events.ts           Discriminated union of every SSE event { type, projectId?, actor, data, occurredAt }
├─ permissions.ts      The permission rules (see §3.3), used by the API to enforce and by the web to hide actions
├─ errors.ts           Error code constants (VERSION_CONFLICT, PROJECT_ARCHIVED, ...)
└─ index.ts
```

It's consumed as **TypeScript source**:
- **web:** Turbopack compiles workspace packages automatically (no `transpilePackages` needed in Next 16).
- **api:** `tsx` in dev; `tsup` bundles it for `npm run build`.

There's no separate build step for shared.

### 2.2 `apps/api`

```
src/
├─ server.ts                   Starts HTTP server, graceful shutdown (closes SSE streams, DB pool)
├─ app.ts                      Builds the Express app: helmet → cors → json → cookies → pino-http → routes → 404 → error handler
├─ config/env.ts               Zod-validated env. The process refuses to start with a clear message if anything is missing
├─ db/
│  ├─ client.ts                pg Pool + drizzle instance
│  ├─ schema/                  One file per table (users, refreshTokens, projects, projectMembers, tasks, comments, commentMentions, notifications, activityLogs)
│  ├─ migrations/              Generated SQL + 0001_custom_constraints.sql (PG15 composite FK, extra CHECKs)
│  └─ seed/                    seed.ts (idempotent), fixtures.ts
├─ lib/
│  ├─ errors.ts                AppError + helpers: badRequest(), forbidden(), notFound(), conflict(), versionConflict(current)
│  ├─ tx.ts                    withTransaction(): runs work in a DB tx, collects events, publishes after COMMIT
│  ├─ pagination.ts            parse page/pageSize → limit/offset; build { data, meta }
│  ├─ sorting.ts               whitelist-based ?sort= parser
│  ├─ mentions.ts              extract @[Name](uuid) tokens, dedupe
│  └─ logger.ts
├─ middleware/
│  ├─ authenticate.ts          verify JWT → load user (is_active check) → req.user
│  ├─ requireAdmin.ts
│  ├─ validate.ts              validate({ body, query, params }) with shared Zod schemas → 400 VALIDATION_ERROR
│  ├─ rateLimit.ts             login limiter
│  └─ errorHandler.ts          AppError / Zod / PG constraint errors (23505 unique, 23503 FK, 23514 check) → consistent JSON
├─ access/
│  ├─ projectAccess.ts         loadProjectAccess(tx, projectId, user, lock) → { project, role } or 404; assertActive() → 403 PROJECT_ARCHIVED
│  └─ assert.ts                assertCan(access, action, resource) → wraps shared permissions; throws 403 with a specific message
├─ domain/                     Cross-cutting side effects, always called inside a tx
│  ├─ activity.ts              logActivity(tx, {...}): one place that writes activity_logs + queues activity.created
│  ├─ notify.ts                notify(tx, candidates, ...): dedupe, drop actor, drop inactive, priority (MENTIONED > ASSIGNED > ...), insert, queue events
│  └─ unassign.ts              unassignMemberTasks(tx, projectId, userId): bumps versions, logs, queues task.updated (used by remove-member, role→VIEWER, system-role downgrade)
├─ realtime/
│  ├─ hub.ts                   userId → Set<Response>. send(userIds, event), heartbeat 25s, close on revoke
│  ├─ tickets.ts               issue/consume single-use 30s tickets (in-memory Map + expiry sweep)
│  ├─ replay.ts                ring buffer of last 1,000 events (id, recipients, payload)
│  ├─ membershipCache.ts       projectId → Set<userId>, invalidated on member changes
│  └─ publisher.ts             publish(event): resolves recipients (project members + admins, or user) → hub + replay
└─ modules/                    One folder per resource: <name>.routes.ts (HTTP + validation) + <name>.service.ts (rules + tx)
   ├─ auth/  users/  me/  projects/  members/  tasks/  comments/  activity/  notifications/  dashboard/  events/  health/
tests/
├─ helpers/                    test DB reset (TRUNCATE ... CASCADE), factories, login-as(role) helper
├─ permissions.test.ts         Role × endpoint matrix (table-driven)
├─ concurrency.test.ts         409 on stale version, 404 on deleted, no-op doesn't bump
├─ members.test.ts             Remove/demote unassigns + bumps versions; ceiling rules; manager-can't-touch-manager
├─ archive.test.ts             Every write blocked on an archived project
├─ notifications.test.ts       Dedupe, no self-notify, mention filtering, read-all `before`
├─ realtime.test.ts            Removed member stops receiving events; ticket is single-use
└─ users.test.ts               Last-admin guard, self-modify guard, deactivation kills access
```

**Layering rule (keeps the code explainable):**
`routes` (parse + validate + call service) → `service` (open tx → load access → assert permission → mutate → activity → notify → queue events) → `db`.
Routes never touch the DB, and services never touch `req`/`res`.

### 2.3 `apps/web`

```
src/
├─ app/
│  ├─ layout.tsx               Providers: QueryClient, Theme, Auth, Toaster
│  ├─ login/page.tsx
│  ├─ (app)/                   Authenticated area
│  │  ├─ layout.tsx            Auth guard, TopBar, AppBar slot, EventStreamProvider (one SSE per tab), connection banner
│  │  ├─ dashboard/page.tsx
│  │  ├─ projects/page.tsx
│  │  ├─ projects/[id]/layout.tsx         Project header + Pivot (Overview · Tasks · Team · Activity), archived banner, role chip
│  │  ├─ projects/[id]/page.tsx           Overview tiles
│  │  ├─ projects/[id]/tasks/page.tsx     Board / List
│  │  ├─ projects/[id]/team/page.tsx
│  │  ├─ projects/[id]/activity/page.tsx
│  │  ├─ tasks/[id]/page.tsx
│  │  ├─ users/page.tsx                   Admin guard
│  │  ├─ activity/page.tsx                Admin guard
│  │  ├─ notifications/page.tsx
│  │  └─ profile/page.tsx
│  ├─ not-found.tsx  error.tsx  forbidden/page.tsx
├─ components/
│  ├─ metro/                   Design-system layer (no business logic)
│  │  Tile (sizes, flip, live cycle, badge), TileGroup, Panorama (horizontal ↔ vertical), Pivot, AppBar,
│  │  Flyout, SidePane, DialogBand, Banner, FlyingDots, Skeletons, EmptyState, ErrorState, RoleChip, Avatar
│  └─ features/                Business components
│     projects/ (ProjectTile, ProjectForm, ArchiveDialog, DeleteProjectDialog)
│     tasks/    (TaskTile, Board, Column, TaskList, TaskForm, StatusPicker, AssigneePicker, ConflictDialog)
│     comments/ (CommentThread, CommentComposer with MentionPicker)
│     team/     (MemberTile, AddMemberFlyout, ChangeRoleFlyout)
│     activity/ (Timeline, ActivityItem)
│     notifications/ (NotificationList, NotificationPane, Bell)
│     users/    (UserTable, UserForm, RoleChangeImpact)
├─ lib/
│  ├─ api/client.ts            fetch wrapper: base URL, Bearer token, JSON, ApiError parsing, single-flight refresh on 401 then retry
│  ├─ api/queries/             One file per resource: query keys + useX/useXMutation hooks (optimistic update + rollback)
│  ├─ realtime/EventStreamProvider.tsx   ticket → EventSource, reconnect with lastEventId, connection state
│  ├─ realtime/handlers.ts     event type → cache patch/invalidate + toast rules + aria-live announcement
│  ├─ auth/AuthProvider.tsx    in-memory token, me, login/logout, silent refresh on load
│  ├─ permissions.ts           re-exports shared `can()` + hook useCan(projectRole)
│  └─ format.ts                dates, relative time, status/priority labels
└─ styles/globals.css          Tailwind v4 @theme tokens (Metro type scale, tile grid units, accent token, light/dark)
```

---

## 3. Backend Mechanics (the parts reviewers will probe)

### 3.1 Request pipeline
`helmet → cors → express.json({ limit: '100kb' }) → cookieParser → pino-http (request id) → router`.
Each route: `authenticate → validate(schema) → handler → service`. Then the 404 handler, then `errorHandler`.

### 3.2 Transactions + after-commit events

```ts
// lib/tx.ts (shape)
export async function withTransaction<T>(fn: (tx: Tx, emit: (e: AppEvent) => void) => Promise<T>) {
  const events: AppEvent[] = [];
  const result = await db.transaction(tx => fn(tx, e => events.push(e)));  // throws → rollback → events discarded
  events.forEach(publish);                                                   // only after COMMIT
  return result;
}
```

### 3.3 Authorization (two layers, one rulebook)
1. **`packages/shared/permissions.ts`**: pure function `can(ctx, action, resource?)`.
   - `ctx = { systemRole, projectRole, userId }`.
   - Actions such as `project.update`, `project.archive`, `member.add`, `member.manageManager`, `task.create`, `task.update.all`, `task.update.description`, `task.changeStatus`, `task.assign`, `task.delete`, `comment.create`, `comment.delete`.
   - Resource-aware checks for "assignee only" and "own comment".
   - Table-driven, so it can be read side by side with the matrix in API §2.
2. **API enforcement:**
   - `loadProjectAccess()` reads the **current** membership from the DB inside the tx (with `FOR SHARE` on the project row). Non-member → 404.
   - `assertCan()` → 403 with a specific message.
   - The UI uses the same `can()` **only to hide buttons**. The API never trusts the client.

### 3.4 Optimistic locking
- The service runs `update(tasks).set({..., version: sql\`version + 1\`}).where(and(eq(id), eq(version, input.version))).returning()`.
- **0 rows** → re-select. If the task exists → `versionConflict(current)` → 409 with `details.current`; otherwise 404 `TASK_DELETED`.
- No-op detection runs after the version check (DATA_MODEL T4).

### 3.5 DB error mapping (errorHandler)

| PG code | Constraint | API response |
|---|---|---|
| 23505 | `users_email_lower_uq` | 409 `EMAIL_TAKEN` |
| 23505 | `projects_active_name_uq` | 409 `PROJECT_NAME_TAKEN` |
| 23505 | `project_members_pkey` | 409 `ALREADY_MEMBER` |
| 23503 | tasks → project_members composite FK | 400 `INVALID_ASSIGNEE` |
| 23503 | comments → tasks | 404 `TASK_DELETED` |
| 23514 | any CHECK | 400 `VALIDATION_ERROR` |
| other | – | 500 `INTERNAL_ERROR` (logged with request id, no details leaked) |

The service still checks these cases up front for friendly messages. The DB mapping is the race-condition safety net.

### 3.6 SSE hub
- `GET /events?ticket=` consumes the ticket → sets headers → registers `res` under the userId → replays from `Last-Event-ID` (or `resync`).
- 25 s `: ping` heartbeat. On `close`, unregisters.
- `publish()` resolves recipients at send time:
  - Project events → `membershipCache.get(projectId)` + admins.
  - User events → that user only.
- Membership changes invalidate the cache **before** publishing, so a removed member never gets the event about their own removal's follow-ups (they get `member.removed` on their user scope).
- Deactivation → `session.revoked`, then `hub.closeAll(userId)`.

---

## 4. Environment & Scripts

**`.env.example`** (root, read by both apps)
```
DATABASE_URL=postgres://pm:pm@localhost:5433/pm
TEST_DATABASE_URL=postgres://pm:pm@localhost:5433/pm_test
API_PORT=4000
CORS_ORIGIN=http://localhost:3000
JWT_ACCESS_SECRET=change-me
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

**Root scripts**

| Script | Does |
|---|---|
| `npm run db:up` | `docker compose up -d` (Postgres 16 with `pm` + `pm_test`) |
| `npm run db:migrate` | Apply all migrations |
| `npm run db:seed` | Idempotent seed (users per role, projects incl. archived, tasks, comments, notifications, activity) |
| `npm run db:reset` | Drop → migrate → seed |
| `npm run dev` | API (`tsx watch`) + web (`next dev`) together via `concurrently` |
| `npm test` | API test suite against `pm_test` |
| `npm run check` | Typecheck + lint across workspaces |
| `npm run build` / `npm start` | Production build/run of both apps |

**Fresh-clone path for the README:** `npm install → cp .env.example .env → npm run db:up → npm run db:migrate → npm run db:seed → npm run dev`.

---

## 5. Build Order (vertical slices, each one demo-able)

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Skeleton** | Monorepo, Docker DB, env validation, Express app with `/health`, Next app calling it, shared package wired, lint/typecheck | `npm run dev` shows the health status on the web page |
| **1. Schema + seed** | All Drizzle tables, generated + custom migrations, seed script | `db:reset` works from zero. Constraints verified in psql |
| **2. Auth** | Login/refresh/logout/me, authenticate middleware, rate limit; web AuthProvider, API client with refresh, login page with demo accounts, route guard | Can log in as each role. Refresh survives a page reload |
| **3. Permissions core** | shared `can()`, `loadProjectAccess`, `assertCan`, error handler + PG mapping; **permission tests start here** | Matrix tests pass for the endpoints that exist so far |
| **4. Projects + members** | Endpoints + services (activity included), archive/unarchive/delete, unassign logic; Projects hub, project hub, team page | Admin creates a project, adds a PM. The PM adds members |
| **5. Tasks + concurrency** | Task endpoints, version checks, no-op rule; board (dnd), list view, task detail, conflict dialog | Two browsers editing the same task → second gets the conflict dialog |
| **6. Real-time** | Tickets, hub, publisher, replay, membership cache; EventStreamProvider + handlers + connection indicator | Changes in browser A appear in browser B with no refresh. Removed member is kicked out |
| **7. Comments + notifications** | Comments, mentions, notification fan-out, read/unread/read-all; comment thread, mention picker, bell + pane, notifications page, toasts | Mention → live toast + badge in the other browser |
| **8. Activity + dashboard + users** | Activity feeds (project/task/system), dashboard endpoint, user admin incl. deactivate/role-change impact; Start screen tiles, Users page, activity timelines | Every page in UI_REQUIREMENTS exists |
| **9. Metro polish** | Live-tile cycling, flip everywhere, turnstile transitions, skeletons/empty/error states, dark mode, reduced motion, mobile layout | Checklist UI §6 ticked |
| **10. Submission** | README, ARCHITECTURE.md, AI-usage note, Bruno/Postman collection, demo script, final test run on a fresh clone | A fresh clone runs by following only the README |

**Cut-line if time runs short** (cut from the bottom up): semantic zoom → search pane → resizable tiles → live-tile cycling → Playwright. **Never cut:** phases 2–6 and the permission/concurrency tests. They are the scored core of the brief.

**Git:** commit at the end of every meaningful step with conventional messages (`feat(tasks): optimistic locking with 409 conflict`), at least one commit per phase. `.env` is git-ignored from the first commit.

---

## 6. Submission Artifacts (planned now, written last)
- **README.md:** prerequisites (Node 22+, Docker), setup path (§4), env vars table, scripts, demo credentials per role, how to see real-time (two browsers), how to run tests.
- **docs/ARCHITECTURE.md** (the required "short note"), condensed from these docs:
  - Real-time: why SSE and the ticket auth.
  - Data model: ER diagram + key constraints.
  - Authorization: shared rulebook + server enforcement + 404 vs 403.
  - Concurrency: version column, 409 flow, row locks for archive.
- **AI usage note:** which parts were AI-assisted versus your own decisions. The design decisions in these docs (SSE, ticket auth, composite FK, last-admin guard, etc.) are yours to explain.
- **API collection** (Bruno/Postman):
  - Login as each role.
  - The "Team Member tries to delete a task → 403" request.
  - The stale-version → 409 request.
