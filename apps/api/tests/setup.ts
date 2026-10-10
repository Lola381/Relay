import { afterAll } from 'vitest';
import { pool } from '../src/db/client';

// Each test file gets its own module instances; release its DB connections when it finishes.
afterAll(async () => {
  await pool.end();
});
