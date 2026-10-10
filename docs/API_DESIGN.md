# API Design — Collaborative Project Management Platform

REST API for all reads and writes, plus a server→client **Server-Sent Events (SSE)** stream for live updates.
The API server owns authentication, authorization, validation, activity logging, notifications and real-time fan-out.

> **Design document.** For exactly what is implemented, see [API_REFERENCE.md](API_REFERENCE.md). Not built from this design: `PATCH /me` and `PUT /me/password` (profile editing), and the aggregate `GET /dashboard`. The Start screen combines `/me/tasks`, `/projects` and `/notifications` instead.

---

## 1. Conventions

| Topic | Decision |
|---|---|
| Base URL | `/api/v1` |
| Format | JSON, `camelCase` fields, ISO-8601 UTC timestamps, UUID ids |
| Resource naming | Plural nouns; nest only when the child cannot exist without the parent (`/projects/:id/tasks`). Once created, a task is addressed directly (`/tasks/:id`) |
| Auth header | `Authorization: Bearer <accessToken>` |
| Success shape | Single resource: `{ "data": {...} }`. List: `{ "data": [...], "meta": { "page", "pageSize", "total", "totalPages" } }` |
| Error shape | `{ "error": { "code": "STRING_CODE", "message": "Human readable", "details": [...] } }` |
| Pagination | `?page=1&pageSize=20` (default 20, max 100) on every list endpoint |
| Sorting | `?sort=field` or `?sort=-field` (desc). Each endpoint whitelists sortable fields |
| Filtering | Plain query params, e.g. `?status=IN_PROGRESS&assigneeId=me` |
| Concurrency | Every mutable task (and project) has an integer `version`. Updates must send the `version` they were based on |

### Status codes

| Code | When |
|---|---|
| 200 | Successful read / update |
| 201 | Resource created (body contains the resource) |
| 204 | Successful delete / action with no body |
| 400 | `VALIDATION_ERROR`: malformed body, invalid enum, missing field (`details` lists each field error) |
| 401 | `UNAUTHENTICATED`: missing/expired/invalid token, or user deactivated |
| 403 | `FORBIDDEN`: user can see the resource but is not allowed to perform this action |
| 404 | `NOT_FOUND`: resource does not exist **or the user is not allowed to see it** (we don't leak existence of other projects) |
| 409 | `VERSION_CONFLICT` (stale update) or `CONFLICT` (e.g. duplicate email, user already a member) |
| 429 | `RATE_LIMITED`: login endpoint brute-force protection |
| 500 | `INTERNAL_ERROR`: never leaks stack traces |

---

## 2. Roles & Permission Model

Two levels:

- **System role** (`users.role`): `ADMIN | PROJECT_MANAGER | TEAM_MEMBER | VIEWER`. Admin bypasses project checks. The other values set the **highest** project role the user may be given.
- **Project role** (`project_members.role`): `MANAGER | MEMBER | VIEWER`. This is what the server checks for every project-scoped action.

| System role | Allowed project roles |
|---|---|
| PROJECT_MANAGER | MANAGER, MEMBER, VIEWER |
| TEAM_MEMBER | MEMBER, VIEWER |
| VIEWER | VIEWER |

### Permission matrix (enforced server-side)

| Action | Admin | Manager (of project) | Member (of project) | Viewer (of project) | Non-member |
|---|---|---|---|---|---|
| Manage users | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create / delete project | ✅ | ❌ | ❌ | ❌ | ❌ |
| View project, tasks, activity | ✅ | ✅ | ✅ | ✅ | ❌ (404) |
| Edit project details (name, description) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Archive / unarchive project | ✅ | ❌ | ❌ | ❌ | ❌ |
| Add / remove MEMBER or VIEWER | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign / remove MANAGER | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create / delete task | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit any task field | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign task | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit own assigned task (description, status) | ✅ | ✅ | ✅ (only if assignee) | ❌ | ❌ |
| Change task status | ✅ | ✅ | ✅ (only if assignee) | ❌ | ❌ |
| Add comment | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete comment | ✅ | ✅ (any in project) | ✅ (own only) | ❌ | ❌ |

Archived projects are read-only for everyone. Only an Admin can unarchive them. Any other write to an archived project (tasks, comments, members, project details) returns `403 PROJECT_ARCHIVED`.

A Member's edits to their own task are limited to `description` and `status`. Title, priority, due date and assignee are Manager/Admin only.

---

## 3. Resources (response shapes)

```jsonc
// User (public)
{ "id": "uuid", "name": "Asha Rao", "email": "asha@demo.com", "role": "TEAM_MEMBER",
  "isActive": true, "avatarUrl": null, "createdAt": "...", "updatedAt": "..." }

// Project
{ "id": "uuid", "name": "Website Revamp", "description": "...", "status": "ACTIVE",  // ACTIVE | ARCHIVED
  "createdBy": "uuid", "version": 3, "myRole": "MANAGER",          // myRole: caller's project role (ADMIN if admin)
  "stats": { "memberCount": 5, "taskCounts": { "TODO": 4, "IN_PROGRESS": 2, "IN_REVIEW": 1, "DONE": 7 } },
  "createdAt": "...", "updatedAt": "...", "archivedAt": null }

// ProjectMember
{ "projectId": "uuid", "user": { "id", "name", "email", "avatarUrl" }, "role": "MEMBER", "addedAt": "..." }

// Task
{ "id": "uuid", "projectId": "uuid", "title": "Design login page", "description": "...",
  "status": "IN_PROGRESS",            // TODO | IN_PROGRESS | IN_REVIEW | DONE
  "priority": "HIGH",                 // LOW | MEDIUM | HIGH | URGENT
  "assignee": { "id", "name", "avatarUrl" } | null,
  "dueDate": "2026-10-20" | null,
  "createdBy": { "id", "name" }, "updatedBy": { "id", "name" },
  "version": 7, "commentCount": 3, "createdAt": "...", "updatedAt": "..." }

// Comment
{ "id": "uuid", "taskId": "uuid", "author": { "id", "name", "avatarUrl" },
  "body": "Looks good @asha", "mentions": [{ "id", "name" }], "createdAt": "..." }

// ActivityLog
{ "id": "uuid", "projectId": "uuid" | null, "actor": { "id", "name" },
  "action": "TASK_STATUS_CHANGED", "entityType": "TASK", "entityId": "uuid",
  "metadata": { "from": "TODO", "to": "IN_PROGRESS", "taskTitle": "Design login page" },
  "createdAt": "..." }

// Notification
{ "id": "uuid", "type": "TASK_ASSIGNED", "isRead": false,
  "actor": { "id", "name" }, "projectId": "uuid", "entityType": "TASK", "entityId": "uuid",
  "message": "Ravi assigned you \"Design login page\"", "link": "/tasks/uuid",
  "createdAt": "...", "readAt": null }
```

---

## 4. Endpoints

### 4.1 Auth

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/auth/login` | Public | Body `{ email, password }` → `{ data: { accessToken, user } }`. Sets the refresh token in an `httpOnly; SameSite=Lax; Path=/api/v1/auth` cookie. Wrong email or password: 401 `INVALID_CREDENTIALS` (same message for both). Deactivated: 401 `ACCOUNT_DEACTIVATED` (only revealed after a correct password). 10 failed attempts per IP per 15 min: 429 `RATE_LIMITED` + `Retry-After` |
| POST | `/auth/refresh` | Cookie | Rotates the refresh token and returns `{ data: { accessToken, user } }`. **No cookie → 204** (normal signed-out page load, not an error). Invalid/expired cookie → 401. A token already rotated more than 10 s ago → reuse detected: the whole login family is revoked → 401 |
| POST | `/auth/logout` | Auth | Revokes refresh token, clears cookie → 204 |
| GET | `/auth/me` | Auth | Current user + system role |

Access token: JWT, ~15 min, payload `{ sub, role }`. Project roles are **not** in the token. They're read from the DB on every request, so membership changes take effect immediately. The auth middleware also checks `users.is_active` on every request, so a deactivated user's still-valid access token is rejected right away (401).

### 4.2 Profile

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/me` | Auth | Same as `/auth/me` |
| PATCH | `/me` | Auth | `{ name?, avatarUrl? }`. Cannot change own role/email |
| PUT | `/me/password` | Auth | `{ currentPassword, newPassword }` → 204 |
| GET | `/me/tasks` | Auth | Tasks assigned to me across all projects. Filters: `status`, `projectId`, `dueBefore`. For the dashboard |

### 4.3 Users (Admin)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/users` | Admin, PM* | Filters: `search` (name/email), `role`, `isActive`. Sort: `name`, `createdAt`. *PMs get active users with public fields only, so they can pick people to add to a team |
| POST | `/users` | Admin | `{ name, email, password, role }` → 201. 409 on duplicate email |
| GET | `/users/:id` | Admin | |
| PATCH | `/users/:id` | Admin | `{ name?, email?, role? }`. Downgrading a role also downgrades project roles above the new ceiling (logged) |
| POST | `/users/:id/deactivate` | Admin | → 200. Revokes refresh tokens, sends `session.revoked` and closes their SSE streams, user can no longer log in. Admin cannot deactivate self |
| POST | `/users/:id/activate` | Admin | → 200 |

No `DELETE`: users are deactivated, so their history (tasks, comments, activity) stays intact.

### 4.4 Projects

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/projects` | Auth | Admin: all. Others: only projects they belong to. Filters: `status` (`ACTIVE` default / `ARCHIVED` / `ALL`), `search`. Sort: `name`, `createdAt`, `updatedAt` |
| POST | `/projects` | Admin | `{ name, description?, managerIds?: uuid[] }` → 201 |
| GET | `/projects/:id` | Project member / Admin | Includes `myRole` + `stats` |
| PATCH | `/projects/:id` | Admin, Manager | `{ name?, description?, version }`. Uses the same conflict check as tasks |
| POST | `/projects/:id/archive` | Admin | → 200, project becomes read-only. 409 if already archived |
| POST | `/projects/:id/unarchive` | Admin | → 200. 409 if not archived |
| DELETE | `/projects/:id` | Admin | Hard delete with cascade → 204. UI must confirm |

### 4.5 Project Members (Team)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/projects/:id/members` | Project member / Admin | Filter: `role` |
| POST | `/projects/:id/members` | Admin, Manager | `{ userId, role }` → 201. 409 if already a member. 400 if role exceeds the user's system-role ceiling. 403 if a Manager tries to add a MANAGER |
| PATCH | `/projects/:id/members/:userId` | Admin, Manager | `{ role }`. Only Admin may grant/revoke MANAGER. Changing someone to VIEWER unassigns their tasks (same as removal) |
| DELETE | `/projects/:id/members/:userId` | Admin, Manager | → 204. In the same transaction, the removed user's tasks in this project are unassigned and their `version` is bumped (logged + broadcast). A project may be left with zero managers; Admin still manages it (see DATA_MODEL P5) |

### 4.6 Tasks

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/projects/:id/tasks` | Project member / Admin | Filters: `status` (comma list), `priority`, `assigneeId` (uuid, `me`, or `none`), `search` (title), `dueBefore`, `dueAfter`. Sort: `createdAt`, `updatedAt`, `dueDate`, `priority` |
| POST | `/projects/:id/tasks` | Admin, Manager | `{ title, description?, priority?, assigneeId?, dueDate?, status? }` → 201, `version: 1`. Assignee must be a MEMBER/MANAGER of the project |
| GET | `/tasks/:id` | Project member / Admin | |
| PATCH | `/tasks/:id` | Admin, Manager, assignee (Member) | `{ version, title?, description?, priority?, dueDate? }`. Members may only send `description` (other fields → 403) |
| PATCH | `/tasks/:id/status` | Admin, Manager, assignee (Member) | `{ version, status }` |
| PATCH | `/tasks/:id/assignee` | Admin, Manager | `{ version, assigneeId \| null }` |
| DELETE | `/tasks/:id` | Admin, Manager | → 204 |

**Why separate status/assignee endpoints?** Each one maps to a single permission rule, a single activity action (`TASK_STATUS_CHANGED`, `TASK_ASSIGNED`) and a single notification type. This keeps the authorization code simple to audit.

### 4.7 Comments

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/tasks/:id/comments` | Project member / Admin | Oldest first. Paginated |
| POST | `/tasks/:id/comments` | Admin, Manager, Member | `{ body }` (1–5000 chars) → 201. Mentions use the token `@[Name](userId)` inserted by the UI's `@` picker. The server extracts the ids, dedupes them and keeps only active project members (not the author) to build `mentions` |
| DELETE | `/comments/:id` | Author, project Manager, Admin | → 204 |

### 4.8 Activity

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/projects/:id/activity` | Project member / Admin | Newest first. Filters: `action`, `entityType`, `actorId`, `from`, `to` |
| GET | `/tasks/:id/activity` | Project member / Admin | History for a single task |
| GET | `/activity` | Admin | System-wide feed (includes user management events). Same filters plus `projectId` |

Activity logs are append-only. There are no update/delete endpoints.

**Action catalogue:**
`PROJECT_CREATED, PROJECT_UPDATED, PROJECT_ARCHIVED, PROJECT_UNARCHIVED, PROJECT_DELETED, MEMBER_ADDED, MEMBER_REMOVED, MEMBER_ROLE_CHANGED, TASK_CREATED, TASK_UPDATED, TASK_ASSIGNED, TASK_UNASSIGNED, TASK_STATUS_CHANGED, TASK_DELETED, COMMENT_ADDED, COMMENT_DELETED, USER_CREATED, USER_UPDATED, USER_DEACTIVATED, USER_ACTIVATED`

The activity row is written **in the same DB transaction** as the change it records.

### 4.9 Notifications

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/notifications` | Auth (own only) | Filter: `isRead=true\|false`. Newest first. `meta.unreadCount` included |
| GET | `/notifications/unread-count` | Auth | `{ data: { count } }` for the bell badge |
| PATCH | `/notifications/:id` | Owner | `{ isRead: true\|false }` |
| POST | `/notifications/read-all` | Auth | `{ before: timestamp }` (when the client loaded its list) → 204. Only notifications created up to `before` are marked read, so ones arriving at that moment stay unread |

A user requesting another user's notification gets 404.

**Who gets notified** (the actor never notifies themselves):

| Type | Trigger | Recipients |
|---|---|---|
| `TASK_ASSIGNED` | Task assigned | New assignee |
| `TASK_UNASSIGNED` | Assignee removed/changed | Previous assignee |
| `TASK_STATUS_CHANGED` | Status change | Assignee + task creator |
| `TASK_UPDATED` | Details edited by someone else | Assignee |
| `COMMENT_ADDED` | New comment | Assignee + task creator + previous commenters |
| `MENTIONED` | `@username` in comment | Mentioned users (replaces COMMENT_ADDED for them) |
| `PROJECT_MEMBER_ADDED` | Added to project | The added user |
| `PROJECT_MEMBER_REMOVED` | Removed from project | The removed user |
| `PROJECT_ROLE_CHANGED` | Project role changed | That user |

### 4.10 Dashboard

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/dashboard` | Auth | Role-aware summary: my open tasks by status, overdue count, my projects with progress, unread notifications, recent activity across my projects (Admin: system-wide counts) |

---

## 5. Concurrent Update Handling (Optimistic Locking)

Every write to a task is a conditional update:

```sql
UPDATE tasks
SET status = $1, version = version + 1, updated_by = $2, updated_at = now()
WHERE id = $3 AND version = $4
RETURNING *;
```

- 1 row updated → 200 with the new task (`version` incremented).
- 0 rows updated → re-read the task. If it exists, return **409**; otherwise return 404.

```http
PATCH /api/v1/tasks/9f1c.../status
{ "status": "DONE", "version": 7 }
```

```http
HTTP/1.1 409 Conflict
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This task was modified by Ravi Kumar after you opened it.",
    "details": {
      "yourVersion": 7,
      "currentVersion": 8,
      "current": { /* full latest Task object */ }
    }
  }
}
```

**UI behaviour:** show a dialog that compares the user's changes with the latest version. The user can choose **Discard my changes** (load the latest) or **Re-apply on latest** (resubmit with `version: 8`). Real-time `task.updated` events also show a "this task was just updated" banner while the edit form is open, so conflicts are often caught before the user submits.

Projects use the same mechanism on `PATCH /projects/:id`.

---

## 6. Real-Time Contract (Server-Sent Events)

**Choice: SSE.** All the live traffic in this app flows **server → client**: task changes, comments, notifications. Every user action is already a REST call. SSE fits that one-way pattern exactly:
- It runs over plain HTTP, so the same CORS and cookie setup as the REST API applies.
- The browser's built-in `EventSource` reconnects automatically and resends the last event id it received (`Last-Event-ID`), which lets the server replay missed events.
- It needs no extra library on the client and no second protocol on the server.
- It has a single authorization path, because users can't send anything over the stream.

WebSockets would only be worth it for client→server streaming, such as live cursors or typing indicators, which this app doesn't have.

### 6.1 Rules
1. **All writes go through REST.** The stream is push-only.
2. **Events are published only after the DB transaction commits**, so clients never see changes that were rolled back.
3. Clients treat events as signals: they patch their TanStack Query cache or refetch. Events are never trusted for permissions.

### 6.2 Endpoints

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/events/ticket` | Auth (Bearer) | Returns `{ data: { ticket, expiresIn: 30 } }`: a random, **single-use** ticket that expires in 30 seconds and is bound to the user |
| GET | `/events?ticket=...` | Ticket holder | Opens the stream (`Content-Type: text/event-stream`). Without a valid ticket: 401 |

**Why a ticket?** The browser's `EventSource` can't send an `Authorization` header. Putting the long-lived JWT in the URL would leak it into server logs and browser history. The ticket is exchanged once via an authenticated POST, can only be used once and expires in seconds, so a ticket that appears in logs is useless.

Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`.

### 6.3 Who receives what (server-side filtering)

There are no client-side subscriptions. The server keeps an in-memory registry `userId → [open connections]`. When it publishes an event, it decides the recipients **at send time**:

| Scope | Recipients |
|---|---|
| Project event | Current members of that project (read from `project_members`, cached and invalidated whenever membership changes) + all Admins |
| User event | All open connections of that one user (every tab) |

Recipients are computed when the event is sent, so **removing a member takes effect on the stream immediately**. There are no rooms to leave, and there's nothing a client can subscribe to that it isn't allowed to see.

### 6.4 Wire format

```
id: 1042
event: task.updated
data: {"projectId":"uuid","actor":{"id":"uuid","name":"Ravi"},"data":{ /* full Task, same shape as REST */ },"occurredAt":"2026-10-10T09:12:00Z"}

```

| Event | Scope | `data` |
|---|---|---|
| `task.created` / `task.updated` / `task.deleted` | project | Task (deleted: `{ id }`) |
| `comment.created` / `comment.deleted` | project | Comment (deleted: `{ id, taskId }`) |
| `member.added` / `member.removed` / `member.role_changed` | project + affected user | ProjectMember |
| `project.updated` / `project.archived` / `project.unarchived` / `project.deleted` | project | Project (deleted: `{ id }`) |
| `activity.created` | project (+ Admins for system events) | ActivityLog |
| `notification.created` | user | Notification + `unreadCount` |
| `notification.read` | user | `{ ids, unreadCount }` (keeps the badge in sync across tabs) |
| `session.revoked` | user | Sent when the user is deactivated. The server then closes the stream and the client logs out |
| `resync` | connection | Replay not possible; the client should refetch its active queries |

### 6.5 Reliability
- **Heartbeat:** the server sends a comment line `: ping` every 25 s so proxies don't close idle streams.
- **Replay:** event ids increase monotonically. The server keeps the last ~1,000 events in memory. When a client reconnects with `Last-Event-ID`, the server replays the missed events the user is allowed to see. If the id is too old, the server sends `resync`.
- **Reconnect auth:** the browser reconnects to the same URL automatically, but tickets are single-use. So the client wraps `EventSource`: on error it closes the stream, fetches a fresh ticket and reopens with `?ticket=...&lastEventId=...`. The server accepts the id from either the header or the query param.
- **Connection limit:** browsers allow about 6 HTTP/1.1 connections per origin. The client opens **one stream per tab** (shared app-wide via a React context), never one per page.
- **Disconnect cleanup:** on `req.close` the connection is removed from the registry.
- **Scaling note:** the in-memory registry assumes one API instance, which is fine for this scope. Multiple instances would need Postgres `LISTEN/NOTIFY` (or Redis pub/sub) to share events between servers.

---

## 7. Validation Rules (summary)

| Field | Rule |
|---|---|
| email | valid format, unique (case-insensitive) |
| password | min 8 chars |
| name (user) | 1–100 chars, trimmed |
| project.name | 1–120 chars |
| task.title | 1–200 chars |
| task.description | ≤ 10,000 chars |
| status / priority / role | must be a valid enum value |
| dueDate | ISO date (`YYYY-MM-DD`) |
| assigneeId | must be an active user with project role MEMBER or MANAGER **in this project** (an Admin must be added as a member to be assigned) |
| version | required integer ≥ 1 on every task/project update |
| comment.body | 1–5,000 chars |
| pageSize | 1–100 |
| Unknown body fields | rejected (400) |

Validation happens in schema middleware (Zod / Pydantic) **before** authorization logic runs. Permission checks happen in a policy layer **before** any DB write.

---

## 8. Example Authorization Failures

```http
# Team Member tries to delete a task directly via Postman
DELETE /api/v1/tasks/9f1c...
→ 403 { "error": { "code": "FORBIDDEN", "message": "Only project managers can delete tasks." } }

# Team Member changes status of a task assigned to someone else
PATCH /api/v1/tasks/9f1c.../status
→ 403 { "error": { "code": "FORBIDDEN", "message": "You can only update tasks assigned to you." } }

# Viewer opens a project they are not a member of
GET /api/v1/projects/abcd...
→ 404 { "error": { "code": "NOT_FOUND", "message": "Project not found." } }
```

These cases form the core of the permission test suite.

---

## 9. Frontend ↔ Backend Connection

| Concern | Decision |
|---|---|
| Processes | Next.js on `http://localhost:3000`, API on `http://localhost:4000` |
| API base URL | `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` (in `.env.example`) |
| CORS | Allowlist `CORS_ORIGIN=http://localhost:3000`, `credentials: true` (needed for the refresh cookie) |
| Access token | Kept **in memory** on the client (not localStorage), sent as `Authorization: Bearer` |
| Refresh token | `httpOnly`, `SameSite=Lax`, `Path=/api/v1/auth` cookie. `localhost:3000` and `localhost:4000` count as the same site, so Lax works. On a 401, the client calls `/auth/refresh` once, then retries the request |
| Real-time | Opened from the client once after login: `POST /events/ticket` → `new EventSource(API_URL + "/events?ticket=...")` |
| Health check | `GET /health` → `{ data: { status: "ok", db: "ok", uptimeSeconds } }`, or 503 with `db: "down"` (public). Used by the README to verify setup |

---

## 10. Page → Endpoint Map

| Page | Endpoints used | Live events consumed |
|---|---|---|
| `/login` | `POST /auth/login` | – |
| `/dashboard` | `GET /dashboard`, `GET /me/tasks` | `task.*`, `notification.created` |
| `/projects` | `GET /projects`, `POST /projects` (Admin) | `project.*`, `member.added/removed` (for me) |
| `/projects/:id` | `GET /projects/:id`, `PATCH /projects/:id`, archive/unarchive/delete (Admin) | `project.*`, `task.*` (stats) |
| `/projects/:id/tasks` | `GET /projects/:id/tasks`, `POST /projects/:id/tasks`, status/assignee PATCHes (board) | `task.*` |
| `/projects/:id/team` | `GET/POST/PATCH/DELETE /projects/:id/members`, `GET /users` (picker) | `member.*` |
| `/projects/:id/activity` | `GET /projects/:id/activity` | `activity.created` |
| `/tasks/:id` | `GET /tasks/:id`, `PATCH /tasks/:id[/status\|/assignee]`, `DELETE /tasks/:id`, `GET/POST /tasks/:id/comments`, `DELETE /comments/:id`, `GET /tasks/:id/activity` | `task.updated/deleted`, `comment.*` (shows the "updated by X" banner during edits) |
| `/users` (Admin) | `GET/POST/PATCH /users`, deactivate/activate, `GET /activity` | – |
| `/notifications` | `GET /notifications`, `PATCH /notifications/:id`, `POST /notifications/read-all` | `notification.created/read` |
| `/profile` | `GET/PATCH /me`, `PUT /me/password` | – |
| Header (all pages) | `GET /notifications/unread-count`, `POST /auth/logout` | `notification.*`, `session.revoked` |

---

## 11. Requirements Traceability (checked against the challenge PDF)

| # | Requirement | Covered by |
|---|---|---|
| 1 | Multi-user platform: projects, tasks, members, comments, notifications | §4.4–4.9 |
| 2 | **Admin:** manage users | §4.3 (create, read, update, deactivate/activate) |
| 2 | **Admin:** create/delete projects | `POST /projects`, `DELETE /projects/:id` |
| 2 | **Admin:** assign project managers | `managerIds` on create; `POST/PATCH /projects/:id/members` with `MANAGER` (Admin-only) |
| 2 | **Admin:** view all projects + system activity | `GET /projects` (all for Admin), `GET /activity` |
| 2 | **PM:** manage assigned projects | `PATCH /projects/:id` (Manager of that project only) |
| 2 | **PM:** add/remove team members | §4.5 |
| 2 | **PM:** create/update/delete/assign tasks, change status, view activity | §4.6, §4.8 |
| 2 | **Member:** view own projects, view assigned tasks | `GET /projects` (membership-filtered), `GET /me/tasks`, `?assigneeId=me` |
| 2 | **Member:** update their tasks, change status, add comments | `PATCH /tasks/:id` (description), `/status` (assignee only), `POST /tasks/:id/comments` |
| 2 | **Viewer:** read-only projects, tasks, activity | All GETs allowed; every write → 403 (§2 matrix) |
| 3 | Suggested pages | §10 (every page mapped) |
| 4 | Users CRUD + deactivate | §4.3 |
| 4 | Projects create/read/update/archive | §4.4 |
| 4 | Team members add/remove/change project role | §4.5 |
| 4 | Tasks CRUD + assign + status | §4.6 |
| 4 | Comments create/read/delete | §4.7 |
| 5 | Real-time task create/update, status, assignment, comments, notifications | §6 (SSE): `task.*`, `comment.*`, `notification.*` |
| 5 | Justify real-time choice | §6 intro + §6.2 ticket rationale |
| 6 | Authentication | §4.1 (JWT + refresh cookie) |
| 6 | **Server-side authorization**, direct API calls rejected | §2 matrix, policy layer (§7), examples (§8) |
| 7 | Stale update rejected with 409 + UI guidance | §5 |
| 8 | Activity log for key actions, suggested fields | §4.8 catalogue; ActivityLog shape (`actor.id` = `user_id`, plus `project_id, action, entity_type, entity_id, metadata, created_at`) |
| 9 | Notifications: assignment, status, mentions, membership, comments | §4.9 recipient table |
| 9 | Unread/read state, real-time | `isRead`, `PATCH`, `read-all`, `unread-count`; `notification.created/read` events |
| 10 | Data model | [DATA_MODEL.md](DATA_MODEL.md): schema, constraints, indexes, 50+ edge cases |
| 11 | Naming, HTTP semantics, validation, authz, errors, pagination, filtering, consistency | §1, §4, §7 |
| P2 | Separate frontend/backend: base URL, CORS, tokens/cookies, real-time location | §9 |
| P2 | Meaningful status codes + clear errors | §1 status table, error shape, 409 body |
| P2 | Tests for permissions & conflict detection | §8 cases + §5 (to implement) |
| P2 | Seed data, migrations, `.env.example`, README, architecture note | Outside API scope. Covered in the build phase |
