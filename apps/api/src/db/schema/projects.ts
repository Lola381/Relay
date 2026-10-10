import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  PROJECT_ROLES,
  PROJECT_STATUSES,
  type ProjectRole,
  type ProjectStatus,
} from '@pm/shared';
import { createdAt, inList, notBlank, tstz, updatedAt } from './helpers';
import { users } from './users';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 10 }).$type<ProjectStatus>().notNull().default('ACTIVE'),
    version: integer('version').notNull().default(1), // optimistic locking
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    archivedAt: tstz('archived_at'),
    archivedBy: uuid('archived_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Two ACTIVE projects can't share a name; archived names may be reused
    uniqueIndex('projects_active_name_uq')
      .on(sql`lower(${t.name})`)
      .where(sql`status = 'ACTIVE'`),
    index('projects_status_updated_idx').on(t.status, t.updatedAt.desc()),
    check('projects_name_not_blank', notBlank(t.name)),
    check('projects_description_length', sql`length(${t.description}) <= 5000`),
    check('projects_status_valid', inList(t.status, PROJECT_STATUSES)),
    check('projects_version_positive', sql`${t.version} >= 1`),
    check(
      'projects_archive_consistent',
      sql`(${t.status} = 'ARCHIVED') = (${t.archivedAt} IS NOT NULL)`,
    ),
  ],
);

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: varchar('role', { length: 10 }).$type<ProjectRole>().notNull(),
    addedBy: uuid('added_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One membership per user per project (also the target of tasks' assignee FK)
    primaryKey({ name: 'project_members_pkey', columns: [t.projectId, t.userId] }),
    index('project_members_user_idx').on(t.userId), // "my projects"
    check('project_members_role_valid', inList(t.role, PROJECT_ROLES)),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectMemberRow = typeof projectMembers.$inferSelect;
