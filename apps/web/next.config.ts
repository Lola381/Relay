import path from 'node:path';
import type { NextConfig } from 'next';

// The monorepo keeps one .env at the repo root; Next.js only reads .env files in the app folder.
// (@next/env's loadEnvConfig can't be used here: it caches the app-folder load Next already did.)
// Node's built-in loader doesn't override variables that are already set in the shell.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env'));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

if (!process.env.NEXT_PUBLIC_API_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env at the repo root.');
}

const nextConfig: NextConfig = {
  // Make the root-level value available to client code (inlined at build time).
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
};

export default nextConfig;
