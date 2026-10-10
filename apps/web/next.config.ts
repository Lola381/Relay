import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// The monorepo keeps one .env at the repo root; Next.js only looks in the app folder by default.
loadEnvConfig(path.resolve(import.meta.dirname, '../..'));

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
