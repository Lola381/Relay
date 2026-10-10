// Database commands. Usage: tsx src/db/cli.ts <migrate|seed|reset>
// Targets DATABASE_URL (set it in the shell to point at another database, e.g. the test DB).
import { env } from '../config/env';
import { db, pool } from './client';
import { dropAll, runMigrations } from './migrate';
import { seed } from './seed/seed';

const commands: Record<string, () => Promise<void>> = {
  async migrate() {
    await runMigrations(db);
    console.log('Migrations applied.');
  },
  async seed() {
    const summary = await seed(db);
    console.log(`Seeded: ${summary}`);
  },
  async reset() {
    if (env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database.');
    await dropAll(db);
    console.log('Dropped all tables.');
    await commands.migrate!();
    await commands.seed!();
  },
};

const name = process.argv[2] ?? '';
const command = commands[name];

if (!command) {
  console.error(`Unknown command "${name}". Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

const target = new URL(env.DATABASE_URL);
console.log(`[db:${name}] ${target.host}${target.pathname}`);

command()
  .catch((err: Error) => {
    console.error(`[db:${name}] failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
