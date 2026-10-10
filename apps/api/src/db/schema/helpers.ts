import { sql, type SQL } from 'drizzle-orm';
import { timestamp, type AnyPgColumn } from 'drizzle-orm/pg-core';

/** `timestamptz NOT NULL DEFAULT now()`: every table's created_at / updated_at. */
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/** Nullable `timestamptz`. */
export const tstz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * `col IN ('A','B',...)` for CHECK constraints, built from the enum arrays in @pm/shared,
 * so the DB and the application can never disagree about allowed values.
 * Values are compile-time constants from our own code (never user input), so sql.raw is safe.
 */
export function inList(column: AnyPgColumn, values: readonly string[]): SQL {
  const list = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
  return sql`${column} IN (${sql.raw(list)})`;
}

/** `length(trim(col)) > 0`: rejects empty and whitespace-only strings. */
export const notBlank = (column: AnyPgColumn): SQL => sql`length(trim(${column})) > 0`;
