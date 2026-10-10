import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Tests run against TEST_DATABASE_URL (pm_test), which they wipe and rebuild. Never the dev DB.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env'));
} catch {
  // fall back to variables already set in the shell (e.g. CI)
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is not set (see .env.example).');
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL: the test suite wipes its database.');
}

const testEnv = { NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl, LOG_LEVEL: 'silent' } as const;
// globalSetup runs in this (main) process, so it needs the same overrides
Object.assign(process.env, testEnv);

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setup.ts'],
    env: testEnv,
    // One shared database: run test files one after another
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
