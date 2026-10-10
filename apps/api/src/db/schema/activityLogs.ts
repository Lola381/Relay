import { check, index, jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_ENTITY_TYPES,
  type ActivityAction,
  type ActivityEntityType,
} from '@pm/shared';
import { createdAt, inList } from './helpers';
import { projects } from './projects';
import { users } from './users';

/**
 * Append-only audit trail (fields as suggested in the brief §8). The app has no UPDATE/DELETE
 * path for it. Deleting a project cascades its project-scoped rows; the PROJECT_DELETED entry
 * itself is written with project_id NULL and a metadata snapshot, so the system feed keeps it.
 */
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id), // actor; NULL = system
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 30 }).$type<ActivityAction>().notNull(),
    entityType: varchar('entity_type', { length: 20 }).$type<ActivityEntityType>().notNull(),
    entityId: uuid('entity_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_project_created_idx').on(t.projectId, t.createdAt.desc()),
    index('activity_entity_idx').on(t.entityType, t.entityId, t.createdAt.desc()),
    index('activity_created_idx').on(t.createdAt.desc()), // admin system feed
    check('activity_action_valid', inList(t.action, ACTIVITY_ACTIONS)),
    check('activity_entity_type_valid', inList(t.entityType, ACTIVITY_ENTITY_TYPES)),
  ],
);

export type ActivityLogRow = typeof activityLogs.$inferSelect;
