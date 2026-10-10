// One-time setup for a locally installed PostgreSQL (instead of Docker).
// Creates the `pm` role and the `pm` + `pm_test` databases. Safe to run repeatedly.
//
// Usage (PowerShell):
//   $env:PG_ADMIN_URL = "postgres://postgres:<your-postgres-password>@localhost:5432/postgres"
//   npm run db:setup-local
import pg from 'pg';

const adminUrl = process.env.PG_ADMIN_URL;
if (!adminUrl) {
  console.error('Set PG_ADMIN_URL to a superuser connection string first, e.g.');
  console.error('  postgres://postgres:<password>@localhost:5432/postgres');
  process.exit(1);
}

const ROLE = 'pm';
const PASSWORD = 'pm'; // local dev only; matches .env.example
const DATABASES = ['pm', 'pm_test'];

const client = new pg.Client({ connectionString: adminUrl });

try {
  await client.connect();

  const { rows: [{ server_version_num: versionNum }] } = await client.query('SHOW server_version_num');
  if (Number(versionNum) < 150000) {
    throw new Error(`PostgreSQL 15+ is required (found ${versionNum}).`);
  }

  const role = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE]);
  if (role.rowCount === 0) {
    await client.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${PASSWORD}'`);
    console.log(`Created role "${ROLE}"`);
  } else {
    await client.query(`ALTER ROLE ${ROLE} LOGIN PASSWORD '${PASSWORD}'`);
    console.log(`Role "${ROLE}" already exists (password reset to the dev default)`);
  }

  for (const db of DATABASES) {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE ${db} OWNER ${ROLE}`);
      console.log(`Created database "${db}"`);
    } else {
      console.log(`Database "${db}" already exists`);
    }
  }

  console.log('\nDone. In .env use: postgres://pm:pm@localhost:5432/pm (and /pm_test)');
} catch (err) {
  console.error('Setup failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
