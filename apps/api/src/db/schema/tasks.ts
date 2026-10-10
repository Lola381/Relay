import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@pm/shared';
import { createdAt, inList, notBlank, tstz, updatedAt } from './helpers';
import { projects } from './projects';
import { users } from './users';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id') // immutable: tasks never move between projects
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 12 }).$type<TaskStatus>().notNull().default('TODO'),
    priority: varchar('priority', { length: 8 }).$type<TaskPriority>().notNull().default('MEDIUM'),
    /**
     * Must be a member of the SAME project. Enforced by the composite FK
     * (project_id, assignee_id) → project_members ON DELETE SET NULL (assignee_id), which needs
     * PostgreSQL 15 syntax Drizzle can't express. It lives in migration 0001_assignee_member_fk.sql.
     */
    assigneeId: uuid('assignee_id'),
    dueDate: date('due_date'), // calendar day, not an instant
    completedAt: tstz('completed_at'),
    version: integer('version').notNull().default(1), // optimistic locking
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tasks_project_status_idx').on(t.projectId, t.status, t.updatedAt.desc()),
    index('tasks_assignee_status_idx')
      .on(t.assigneeId, t.status)
      .where(sql`assignee_id IS NOT NULL`),
    index('tasks_project_due_idx').on(t.projectId, t.dueDate).where(sql`status <> 'DONE'`),
    index('tasks_title_search_idx').using('gin', sql`to_tsvector('simple', ${t.title})`),
    check('tasks_title_not_blank', notBlank(t.title)),
    check('tasks_description_length', sql`length(${t.description}) <= 10000`),
    check('tasks_status_valid', inList(t.status, TASK_STATUSES)),
    check('tasks_priority_valid', inList(t.priority, TASK_PRIORITIES)),
    check('tasks_version_positive', sql`${t.version} >= 1`),
    // completed_at is set exactly when the task is DONE
    check('tasks_completed_consistent', sql`(${t.status} = 'DONE') = (${t.completedAt} IS NOT NULL)`),
  ],
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
