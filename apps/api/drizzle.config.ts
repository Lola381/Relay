import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs from apps/api; the single .env lives at the repo root.
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env'));
} catch {
  // fall back to variables already set in the shell
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
