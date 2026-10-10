import { sql } from 'drizzle-orm';
import { char, index, pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { createdAt, tstz } from './helpers';
import { users } from './users';

/**
 * Rotating refresh tokens. Only a SHA-256 hash is stored. All rotations of one login share a
 * family_id; presenting an already-revoked token revokes the whole family (reuse detection).
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique('refresh_tokens_hash_uq'),
    familyId: uuid('family_id').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
    replacedBy: uuid('replaced_by').references((): AnyPgColumn => refreshTokens.id),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('refresh_tokens_user_active_idx').on(t.userId).where(sql`${t.revokedAt} IS NULL`),
    index('refresh_tokens_family_idx').on(t.familyId),
  ],
);
