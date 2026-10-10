import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Page not found' };

/** 404 for any unknown URL. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col justify-center bg-bg px-6 sm:px-16">
      <p className="text-2xl font-light text-muted">404</p>
      <h1 className="mt-2 text-5xl font-light sm:text-7xl">Page not found</h1>
      <p className="mt-6 max-w-xl text-muted">The page you were looking for doesn&apos;t exist, or it has moved.</p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/dashboard" className="inline-flex bg-accent px-5 py-2.5 text-accent-fg hover:brightness-110">
          Go to Dashboard
        </Link>
        <Link href="/projects" className="inline-flex border-2 border-border px-5 py-2 hover:border-accent">
          Projects
        </Link>
      </div>
    </main>
  );
}
