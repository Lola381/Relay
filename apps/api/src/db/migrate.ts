import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client';

const MIN_SERVER_VERSION = 150000; // composite FK "ON DELETE SET NULL (assignee_id)" needs PG15+

/** Applies every pending migration in ./migrations (generated + hand-written SQL), in order. */
export async function runMigrations(db: Db) {
  const result = await db.execute<{ server_version_num: string }>(sql`SHOW server_version_num`);
  const version = Number(result.rows[0]?.server_version_num);
  if (version < MIN_SERVER_VERSION) {
    throw new Error(`PostgreSQL 15+ is required (connected server reports ${version}).`);
  }

  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, 'migrations'),
    migrationsSchema: 'drizzle',
    migrationsTable: '__migrations',
  });
}

/** Drops everything (app tables + migration history) so migrations can rebuild from zero. */
export async function dropAll(db: Db) {
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
}
