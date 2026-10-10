import pg from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000,
});

// An idle client erroring (e.g. DB restarted) must not crash the process.
pool.on('error', (err) => logger.error({ err }, 'Idle PostgreSQL client error'));

export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    // One line, not a stack trace: this runs on every health check while the DB is down.
    const code = (err as { code?: string }).code ?? (err as Error).message;
    logger.warn(`Database ping failed (${code}). Is PostgreSQL running and DATABASE_URL correct?`);
    return false;
  }
}
