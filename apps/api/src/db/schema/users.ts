import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { SYSTEM_ROLES, type SystemRole } from '@pm/shared';
import { createdAt, inList, notBlank, tstz, updatedAt } from './helpers';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(), // stored lower-cased + trimmed by the app
    passwordHash: text('password_hash').notNull(), // never returned by the API
    role: varchar('role', { length: 20 }).$type<SystemRole>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    avatarUrl: text('avatar_url'),
    lastLoginAt: tstz('last_login_at'),
    deactivatedAt: tstz('deactivated_at'),
    deactivatedBy: uuid('deactivated_by').references((): AnyPgColumn => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Case-insensitive uniqueness: Asha@x.com and asha@x.com are the same account
    uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    index('users_active_role_idx').on(t.isActive, t.role),
    check('users_name_not_blank', notBlank(t.name)),
    check('users_role_valid', inList(t.role, SYSTEM_ROLES)),
    // Active ⇔ no deactivation timestamp (reactivation clears it)
    check('users_deactivation_consistent', sql`${t.isActive} = (${t.deactivatedAt} IS NULL)`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
