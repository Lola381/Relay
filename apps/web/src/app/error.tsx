'use client';

import Link from 'next/link';

/** Crash fallback for any page (the app shell and providers keep working). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col justify-center bg-bg px-6 sm:px-16">
      <h1 className="text-5xl font-light sm:text-7xl">Something went wrong</h1>
      <p className="mt-6 max-w-xl text-muted">
        This page hit an unexpected error. Your data is safe: try again, or go back home.
      </p>
      {error.digest && <p className="mt-2 text-sm text-muted">Reference: {error.digest}</p>}
      <div className="mt-10 flex flex-wrap gap-3">
        <button onClick={reset} className="inline-flex bg-accent px-5 py-2.5 text-accent-fg hover:brightness-110">
          Try again
        </button>
        <Link href="/dashboard" className="inline-flex border-2 border-border px-5 py-2 hover:border-accent">
          Go home
        </Link>
      </div>
    </main>
  );
}
