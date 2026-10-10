import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { BoardRegular } from '@/components/icons';
import { FlyingDots } from '@/components/metro/FlyingDots';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="relative grid min-h-screen md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ThemeToggle className="absolute top-3 right-3 z-10" />
      {/* Brand panel (desktop) */}
      <section className="hidden flex-col justify-between bg-accent px-14 py-14 text-accent-fg md:sticky md:top-0 md:flex md:h-screen">
        <p className="text-3xl font-light">relay</p>
        <div>
          <BoardRegular aria-hidden fontSize={64} className="mb-10 opacity-90" />
          <h1 className="text-6xl leading-[1.15] font-light lg:text-7xl">
            Good work.
            <br />
            Together.
          </h1>
          <p className="mt-8 text-xl font-light">A clear place for every project.</p>
          <div aria-hidden className="mt-16 grid w-fit grid-cols-[208px_96px] gap-3">
            <span className="h-24 bg-tile-project" />
            <span className="h-24 bg-tile-work" />
            <span className="flex gap-3">
              <span className="h-24 w-24 bg-tile-notification" />
              <span className="h-24 w-24 bg-tile-user" />
            </span>
          </div>
        </div>
        <p className="text-sm">Projects · People · Progress</p>
      </section>

      {/* Brand bar (phone) */}
      <header className="bg-accent px-4 py-4 text-2xl font-light text-accent-fg md:hidden">relay</header>

      <section className="px-4 py-10 sm:px-12 md:px-16 md:py-20 lg:px-24">
        <div className="max-w-[660px]">
          <h2 className="text-5xl font-light sm:text-6xl">Sign in</h2>
          <p className="mt-6 mb-8 text-muted">Welcome back to your workspace.</p>
          {/* useSearchParams (?next, ?reason) needs a Suspense boundary */}
          <Suspense fallback={<FlyingDots label="Loading sign-in form" />}>
            <LoginForm />
          </Suspense>
          <p className="mt-8 text-muted">
            New here?{' '}
            <Link href="/signup" className="text-accent-text underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
