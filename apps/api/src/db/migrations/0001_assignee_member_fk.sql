-- Hand-written: Drizzle can't express this constraint (PostgreSQL 15+ column-list SET NULL).
--
-- A task's assignee must be a member of the SAME project:
--   (project_id, assignee_id) → project_members (project_id, user_id)
-- If that membership row is deleted, only assignee_id is nulled. Plain "ON DELETE SET NULL"
-- would also null project_id and violate its NOT NULL.
--
-- The app unassigns explicitly before removing a member (so it can bump versions, log and
-- notify); this FK is the safety net that makes an out-of-project assignee impossible.
-- MATCH SIMPLE (the default) means the FK isn't checked while assignee_id IS NULL.
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_assignee_member_fk"
  FOREIGN KEY ("project_id", "assignee_id")
  REFERENCES "project_members" ("project_id", "user_id")
  ON DELETE SET NULL ("assignee_id");
