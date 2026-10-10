// Once per test run: rebuild the test database from zero with the real migrations,
// which also proves the migrations work on an empty database.
export async function setup() {
  const { db, pool } = await import('../src/db/client');
  const { dropAll, runMigrations } = await import('../src/db/migrate');
  try {
    await dropAll(db);
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
