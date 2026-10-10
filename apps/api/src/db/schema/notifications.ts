import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import {
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
  type NotificationEntityType,
  type NotificationType,
} from '@pm/shared';
import { createdAt, inList, tstz } from './helpers';
import { projects } from './projects';
import { users } from './users';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id),
    actorId: uuid('actor_id').references(() => users.id), // NULL = system
    type: varchar('type', { length: 30 }).$type<NotificationType>().notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type', { length: 20 }).$type<NotificationEntityType>().notNull(),
    entityId: uuid('entity_id').notNull(), // polymorphic, no FK: the entity may be deleted later
    // Snapshot (taskTitle, projectName, actorName, from/to...). The message text is rendered from
    // type + metadata when read, so wording can change without a data migration.
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    readAt: tstz('read_at'), // NULL = unread
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_recipient_created_idx').on(t.recipientId, t.createdAt.desc()),
    // Fast unread badge count
    index('notifications_unread_idx').on(t.recipientId).where(sql`read_at IS NULL`),
    check('notifications_type_valid', inList(t.type, NOTIFICATION_TYPES)),
    check('notifications_entity_type_valid', inList(t.entityType, NOTIFICATION_ENTITY_TYPES)),
    // Never notify yourself
    check(
      'notifications_not_self',
      sql`${t.actorId} IS NULL OR ${t.actorId} <> ${t.recipientId}`,
    ),
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
