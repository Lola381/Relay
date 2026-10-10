# Architecture Note: Real-Time Collaboration, Data, Authorization, and Concurrency

## Overview

Relay is a collaborative project-management application. The browser runs a Next.js/React client, while a separate Express API owns business rules, authorization, and database access. PostgreSQL is the durable source of truth. The API uses Drizzle ORM for typed SQL queries and migrations. The frontend and API share TypeScript DTOs, enums, Zod schemas, and the permission rulebook through `packages/shared`.

The design aims to keep important changes consistent: a project or task change, its activity entry, and any resulting notifications are written together in one database transaction. Live messages are sent only after that transaction commits.

## Technology stack and what each part does

The repository is an **npm workspaces monorepo**. Its root coordinates `apps/web`, `apps/api`, and `packages/shared`, so the frontend, backend, and shared contracts can be installed and managed together. The project targets **Node.js 22 or newer** and uses **TypeScript** across the application to catch type and API-contract mistakes during development.

### Web application

- **Next.js 16 App Router** provides the web application structure, page routing, layouts, and development/build commands. **React 19** is used to build the interactive screens.
- **Tailwind CSS 4** styles the interface. It supports the project's flat, high-contrast, Metro-inspired visual language through utility classes and shared CSS.
- **TanStack Query 5** manages data fetched from the API: it caches query results, refreshes invalidated data, and supports optimistic interactions. SSE messages invalidate relevant query caches so the client refetches authoritative state.
- **React Hook Form** handles form state; **`@hookform/resolvers`** connects form validation to the shared **Zod** schemas.
- **Radix UI Dialog, Dropdown Menu, and Popover** provide accessible behavior for interactive UI primitives. **Fluent UI React Icons** supplies the icon set, **Sonner** displays toast notifications, and **date-fns** formats dates and relative times.

### API and application security

- **Express 5** exposes the REST API and SSE endpoints. Routes parse and validate requests, then call services that contain business logic.
- **Zod 4** validates incoming data and environment configuration. Schemas live in the shared package where both the frontend and API can use them.
- **jose** signs and verifies JWT access tokens. **bcryptjs** hashes passwords. Refresh tokens are random opaque values stored as hashes, rotated on use, and protected with reuse detection.
- **Helmet**, **CORS**, **cookie-parser**, and **express-rate-limit** supply HTTP security headers, cross-origin policy, refresh-cookie parsing, and login throttling. **Pino** and **pino-http** provide structured application and request logging.
- **dotenv** loads root environment configuration, and **node-postgres (`pg`)** supplies the PostgreSQL connection pool used by Drizzle.

### Persistence and shared contracts

- **PostgreSQL 16** is the relational database. **Docker Compose** runs it locally without requiring a separate PostgreSQL installation; the documented local PostgreSQL option supports version 15 or newer.
- **Drizzle ORM** provides typed SQL queries and transactions. **Drizzle Kit** generates migration files and provides database tooling; hand-written SQL migrations are used where PostgreSQL-specific constraints are needed.
- **`packages/shared`** exports the Zod schemas, DTO types, enums, error codes, mention helpers, and permission rules used by both apps. This is the contract layer between browser and API.

### Development and verification tools

- **`tsx`** runs the TypeScript API directly and watches it during development. **concurrently** starts the web and API development servers from one root command.
- **TypeScript**, **ESLint**, and **Prettier** support type checking, linting, and consistent formatting. The root `npm run check` combines typechecking and linting.
- **Vitest** is the API test runner and **Supertest** exercises HTTP endpoints. The tests use a separate PostgreSQL `pm_test` database that is rebuilt from migrations and reseeded; it must not be pointed at data that needs to be kept.

The installed stack above reflects the current package manifests. Some tools mentioned in the implementation plan—such as Motion, dnd-kit, and Playwright—are not dependencies in the current manifests, so this note does not describe them as part of the implemented stack.

## Real-time updates: Server-Sent Events

The application uses Server-Sent Events (SSE) for server-to-browser updates. This fits the interaction pattern: users make changes through ordinary REST requests, and the server informs other connected clients when relevant data changes. It avoids maintaining a second, bidirectional protocol for a product whose live traffic primarily flows from server to browser.

### Connection and authentication

The browser's native `EventSource` API cannot attach the app's bearer-token authorization header. To handle this, an authenticated browser first calls `POST /api/v1/events/ticket`. The API issues a cryptographically random, single-use ticket that expires after 30 seconds. The browser uses the ticket to open `GET /api/v1/events?ticket=...`. The API consumes the ticket and checks that its user account is still active before establishing the stream. When a connection drops, the client requests a new ticket and reconnects.

### Publishing and delivery

API services queue domain events while a write is in progress. `withTransaction` publishes those events only after PostgreSQL confirms the commit. If the transaction rolls back, the queued events are discarded; clients are not told that an unsuccessful change happened.

Project events are delivered to current project members, with system administrators included according to the event rules. User-scoped events are sent to their intended users. On the client, event payloads signal what changed; TanStack Query invalidates the relevant cached data and fetches it again from the API. This keeps the API authoritative and makes the server re-check permissions on reads instead of treating an event payload as a replacement for protected data.

The current implementation keeps open SSE clients and tickets in the API process's memory. It supports reconnecting and refetching current data, but does not replay missed events using `Last-Event-ID`. A multi-instance API deployment would need shared event delivery (for example, a message broker) and coordinated ticket handling; the in-memory hub is intended for the current single-process setup.

## Data model

PostgreSQL stores the durable application state. UUID primary keys are used for entities exposed through the API. Timestamps use `timestamptz` in UTC; task due dates use the `date` type because they represent calendar days rather than instants.

The main entities are:

- **Users and refresh tokens:** user profiles, system roles, account activation state, and hashed, rotating refresh-token sessions.
- **Projects and project members:** project details and each user's project-specific role. A composite key prevents duplicate membership in the same project.
- **Tasks:** project-scoped work items with status, priority, due date, optional assignee, and a version number for conflict detection.
- **Comments and comment mentions:** task discussion and normalized mention recipients.
- **Notifications:** per-user read state plus metadata snapshots used to render a notification later.
- **Activity logs:** append-only records of who did what, when, and to which entity, with metadata snapshots that preserve useful context.

The schema uses database constraints to protect core invariants, not just application-level checks. Examples include case-insensitive unique user emails; one active project per case-insensitive name; valid role and status values; and consistency between a task's DONE state and its `completed_at` timestamp. A PostgreSQL 15 composite foreign key ensures that an assignee is a member of the same project as the task. Removing a member clears only the task's assignee field, leaving the task in its project.

Multi-step writes—such as changing a task, logging activity, and creating notifications—run in one transaction. The database therefore commits the related records together or rolls them back together. Activity and notification metadata retain snapshots of relevant names and titles so that historical entries remain understandable if the source record later changes.

## Authorization

Authorization rules are centralized in `packages/shared/src/permissions.ts` as a policy function over the actor, action, and context. The API enforces these rules on every protected operation. The web app may use the same rules to hide controls, but that is only a presentation aid; access control does not depend on the client.

The system distinguishes global roles (such as Admin or Team Member) from project roles (Manager, Member, or Viewer). Permissions can depend on both roles and the resource context—for example, a task's assignee or whether its project is archived. Role-ceiling rules prevent a user's project role from exceeding what their system role allows.

For each request, the API authenticates the caller and reloads the current user state. Project operations load the project and the caller's current membership inside the transaction. This means deactivation and membership or role changes affect subsequent API authorization decisions. A non-member receives 404 for a project, matching the response for a missing project and avoiding disclosure of its existence; a visible resource with a disallowed action returns 403. Writes to archived projects are rejected.

## Concurrent updates and conflict handling

Tasks and projects have integer `version` fields. A client includes the version it originally read when it submits an update. If that version is stale, the API returns HTTP 409 (`VERSION_CONFLICT`) with the caller's version, the current version, and the latest resource state. For task conflicts, the response also identifies the user who last changed the task when that information is available.

For task writes, the API takes a shared lock on the project row and then an update lock on the task row. Writers use the same project-then-task lock order, which reduces deadlock risk. The project lock also coordinates task changes with archive operations: archiving takes an update lock on the project and cannot race past an in-flight task write. The service checks the current authorization context and the version while holding the relevant locks, then applies the change and increments the version.

Project edits use the project's version in the same way. A meaningful update advances the version; a no-op does not. Indirect changes that affect tasks, such as unassigning tasks when a project member is removed, also increment those task versions so an older edit cannot silently overwrite the change.

The UI presents the conflict to the user rather than silently choosing a winner. Depending on the edit flow, the user can load the latest version, re-apply their changes to it, or explicitly continue with a conflicting board move. This is optimistic concurrency: people can work without holding long-lived locks, while the server detects and explains overlapping edits at save time.

## Relevant implementation references

- [Architecture overview](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [API reference](docs/API_REFERENCE.md)
- [Shared permission rules](packages/shared/src/permissions.ts)
- [Transaction and after-commit event handling](apps/api/src/lib/tx.ts)
- [SSE endpoints and in-process event hub](apps/api/src/modules/events/events.routes.ts)
- [Task update and version checks](apps/api/src/modules/tasks/tasks.service.ts)
