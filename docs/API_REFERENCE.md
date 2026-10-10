# API Reference (as built)

This is what the running API implements. [API_DESIGN.md](API_DESIGN.md) is the original design and explains why each choice was made.

## Format

| | |
|---|---|
| Base URL | `http://localhost:4000/api/v1` |
| Auth | `Authorization: Bearer <accessToken>`. The token comes from `/auth/login` and lasts 15 minutes. The refresh token is an httpOnly cookie. |
| Body | JSON, `camelCase`, ISO-8601 UTC timestamps, UUID ids |
| One item | `{ "data": { ... } }` |
| A list | `{ "data": [ ... ], "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }` |
| Error | `{ "error": { "code": "VERSION_CONFLICT", "message": "Ravi Kumar changed this task while you were editing.", "details": ... } }` |
| Pagination / sort | `?page=1&pageSize=20` (maximum 100). `?sort=-updatedAt`, where a leading `-` means descending. |
| Concurrency | Task and project writes send the `version` the user's edit started from. If the stored version has moved on, the server answers **409**. |

### Status codes
| Code | Meaning | Error code(s) |
|---|---|---|
| 200 / 201 / 204 | OK / created / no content | none |
| 400 | Invalid input. `details` lists `{ path, message }` for each bad field. | `VALIDATION_ERROR`, `INVALID_ASSIGNEE` |
| 401 | No token, or a bad or expired one | `UNAUTHENTICATED`, `ACCOUNT_DEACTIVATED` |
| 403 | Signed in, but not allowed to do this | `FORBIDDEN`, `PROJECT_ARCHIVED` |
| 404 | Doesn't exist. Also returned for projects you're not a member of, so their existence isn't revealed. | `NOT_FOUND`, `TASK_DELETED` |
| 409 | Stale version, or a duplicate | `VERSION_CONFLICT`, `PROJECT_NAME_TAKEN`, `ALREADY_MEMBER`, `EMAIL_TAKEN`, `LAST_ADMIN`, … |
| 429 | Too many failed logins | `RATE_LIMITED` |

### Examples
```http
PATCH /api/v1/tasks/43a6…/status
Authorization: Bearer eyJ…
Content-Type: application/json

{ "version": 3, "status": "IN_REVIEW" }
```
```json
200 OK
{ "data": { "id": "43a6…", "title": "Write copy for About page", "status": "IN_REVIEW", "version": 4,
            "assignee": { "id": "…", "name": "Bob Mathew", "isActive": true }, "updatedBy": { "name": "Ravi Kumar" }, … } }
```
```json
409 Conflict
{ "error": { "code": "VERSION_CONFLICT", "message": "Ravi Kumar changed this task while you were editing.",
             "details": { "yourVersion": 3, "currentVersion": 4, "current": { …latest task… } } } }
```
```json
403 Forbidden
{ "error": { "code": "FORBIDDEN", "message": "You can only update tasks assigned to you." } }
```

## Endpoints

| Area | Method and path | Who |
|---|---|---|
| **Health** | `GET /health` | Public |
| **Auth** | `POST /auth/login` · `POST /auth/register` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` | Public (`/me`: signed in) |
| **Me** | `GET /me` · `PATCH /me` (name, avatar; never role or email) · `PUT /me/password` (checks the current one; signs out your other sessions) → 204 | Signed in |
| **Dashboard** | `GET /dashboard`: one role-aware summary (my tasks by status and overdue, my projects with progress, unread count, recent activity; Admin also gets system-wide counts) | Signed in |
| **Users** | `GET /users` | Admin, Project Manager (for the people pickers) |
| | `POST /users` · `PATCH /users/:id` | Admin |
| **Projects** | `GET /projects` · `GET /projects/:id` | Members (Admin sees all) |
| | `POST /projects` · `POST /projects/:id/archive` · `POST /projects/:id/unarchive` · `DELETE /projects/:id` | Admin |
| | `PATCH /projects/:id` | Project manager |
| **Members** | `GET /projects/:id/members` | Members |
| | `POST /projects/:id/members` · `PATCH /projects/:id/members/:userId` · `DELETE /projects/:id/members/:userId` | Manager. Only an Admin can grant or revoke the Manager role. |
| **Tasks** | `GET /projects/:id/tasks` · `GET /tasks/:id` · `GET /me/tasks` | Members |
| | `POST /projects/:id/tasks` · `PATCH /tasks/:id` (title, priority, due date) · `PATCH /tasks/:id/assignee` · `DELETE /tasks/:id` | Manager |
| | `PATCH /tasks/:id/status` · `PATCH /tasks/:id` (description) | Manager, or the assignee |
| **Comments** | `GET /tasks/:id/comments` | Members |
| | `POST /tasks/:id/comments` | Members (not viewers) |
| | `DELETE /comments/:id` | The author, or a manager |
| **Activity** | `GET /projects/:id/activity` · `GET /tasks/:id/activity` (task history, including its comments) | Members |
| | `GET /activity` | Admin (whole system) |
| **Notifications** | `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/:id/unread` · `POST /notifications/read-all` | Your own only |
| **Real-time** | `POST /events/ticket` → `{ data: { ticket } }` (single use, 30 seconds), then `GET /events?ticket=…` (`text/event-stream`) | Signed in |

Real-time messages look like `data: {"type":"task.updated","projectId":"…","actorId":"…","data":{…}}`. The types are:
- `task.created`, `task.updated`, `task.deleted`
- `comment.created`, `comment.deleted`
- `member.added`, `member.role_changed`, `member.removed`
- `project.*`
- `activity.created`
- `notification.created`, `notification.read`
- `user.created`, `user.updated`

## Code layout

```
apps/api/src
├── server.ts                 starts the HTTP server
├── app.ts                    middleware (helmet, CORS, JSON, cookies, logging) and route mounting
├── config/env.ts             reads environment variables and checks them with Zod
├── middleware/               authenticate (Bearer → user, re-read every request), rate limit, error handler
├── access/                   projectAccess (loads the project + caller's CURRENT role, with row locks), assert (rulebook → 403/404)
├── modules/<area>/           *.routes.ts: HTTP only (parse input, call service, send JSON)
│                             *.service.ts: business logic in one transaction
│                             *.dto.ts: database rows → API shapes
├── domain/                   activity log, notifications, unassigning tasks (shared by services)
├── lib/                      errors, validation, tokens, cookies, pagination, transactions + after-commit events
└── db/                       Drizzle schema, SQL migrations, seed
packages/shared/src           enums, Zod request schemas, DTO types, the permission rulebook (used by API and web)
```

### What happens to one request (`PATCH /tasks/:id/status`)
1. [tasks.routes.ts](../apps/api/src/modules/tasks/tasks.routes.ts): `authenticate` checks the token and re-reads the user, then `parse(changeStatusSchema, body)` gives a **400** if the input is invalid.
2. [tasks.service.ts](../apps/api/src/modules/tasks/tasks.service.ts) `changeStatus`: inside `withTransaction`:
   1. Lock the project row (FOR SHARE), then the task row (FOR UPDATE).
   2. `assertProjectCan(access, 'task.changeStatus', { assigneeId })`: **403** if not allowed, **404** for outsiders.
   3. Compare `version`: **409** if it's stale.
   4. Update the row and bump `version`.
   5. `logActivity` and `notify` write in the same transaction.
   6. `emit('task.updated')`.
3. [tx.ts](../apps/api/src/lib/tx.ts): after **COMMIT**, the queued events are published, and [events.routes.ts](../apps/api/src/modules/events/events.routes.ts) pushes them to the project's current members over SSE.
4. [errorHandler.ts](../apps/api/src/middleware/errorHandler.ts): any thrown `AppError` becomes `{ error: { code, message, details } }` with the right status code.

The permission rules live in one place, [permissions.ts](../packages/shared/src/permissions.ts). The API calls them to **enforce** access; the web app calls them only to **hide** buttons.
