# Architecture Note

## Overview
The browser (Next.js on :3000) calls a separate Express API (:4000), which owns all business logic, authorization and database access. Both apps import `packages/shared`: enums, Zod request schemas, DTO types and the **permission rulebook**.

## Data model
PostgreSQL tables: `users`, `refresh_tokens`, `projects`, `project_members`, `tasks`, `comments`, `comment_mentions`, `notifications`, `activity_logs`. Full detail and 56 edge cases are in [DATA_MODEL.md](DATA_MODEL.md).

Key constraints:
- **Case-insensitive unique email.**
- **Unique active project names:** a partial unique index, so archived projects can reuse a name.
- **Assignee must be in the task's project:** a composite FK `(project_id, assignee_id) → project_members ON DELETE SET NULL (assignee_id)` (PostgreSQL 15). An assignee can never be outside the task's project.
- **Consistency CHECKs:** `completed_at` ⇔ DONE, `archived_at` ⇔ ARCHIVED, `deactivated_at` ⇔ inactive.
- **No self-notifications:** enforced by a CHECK.
- **Append-only activity log:** history keeps a snapshot of names and titles in `metadata`.

## Authorization
- **One rulebook:** `can(actor, action, context)` lives in `packages/shared/permissions.ts`. The API **enforces** it; the web app uses it only to **hide** controls.
- **Roles read fresh:** every request re-reads the user (deactivation applies immediately) and their **current** project role inside the same transaction as the write.
- **404 for outsiders:** non-members get 404, so a project's existence is never revealed. Members who aren't allowed get 403 with a specific message. Archived projects return 403 `PROJECT_ARCHIVED` for every write.
- **Role ceiling:** a TEAM_MEMBER can never be a project MANAGER, and only admins grant or revoke the manager role.

## Concurrent updates
- **Versioned rows:** tasks and projects have an integer `version`. Each write locks the project row `FOR SHARE`, then the task `FOR UPDATE`, always in that order, so concurrent writers can't deadlock.
- **Stale writes:** a mismatched version gets **409 `VERSION_CONFLICT`** with the latest state and the name of whoever changed it. The UI then offers *Use latest*, *Re-apply only my changes* or *Move anyway*.
- **No-op writes** don't bump the version.
- **Indirect changes bump versions too:** unassigning a removed member's tasks increments their versions, so stale edits fail instead of silently overwriting.
- **Archiving vs. writes:** archive takes `FOR UPDATE` on the project, so no write can slip into a project being archived.

## Real-time (designed; partially implemented)
- **Choice: Server-Sent Events.** All live traffic is server → client, and every write already goes through REST.
- **Done:** every service queues domain events during its transaction, and `withTransaction` publishes them **only after commit** (rolled-back changes never broadcast).
- **Designed but not built:**
  - The stream endpoint, authenticated with a single-use 30-second ticket (`EventSource` can't send headers).
  - Recipients computed at send time from current memberships.
  - A replay buffer for `Last-Event-ID`.
  - Details in [API_DESIGN §6](API_DESIGN.md).

## Sessions
- **Access token:** a 15-minute HS256 JWT, kept in memory only.
- **Refresh token:** random, stored as a SHA-256 hash, sent in an `httpOnly; SameSite=Lax; Path=/api/v1/auth` cookie, and rotated on every use.
- **Reuse detection:** reusing a rotated token revokes the whole login. A 10-second grace window plus a cross-tab Web Lock keep simultaneous refreshes from two tabs from triggering it.
