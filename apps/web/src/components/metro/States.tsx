'use client';

import Link from 'next/link';
import { InfoRegular, WarningRegular } from '@/components/icons';
import { ApiError } from '@/lib/api/client';
import { btn } from '@/lib/ui';
import { FlyingDots } from './FlyingDots';

/** Placeholder tiles in the real sizes, so nothing jumps when data arrives. */
export function SkeletonTiles({ count = 4, wide = false }: { count?: number; wide?: boolean }) {
  return (
    <div
      aria-hidden
      className="grid"
      style={{ gridTemplateColumns: 'repeat(4, var(--tile-unit))', gridAutoRows: 'var(--tile-unit)', gap: 'var(--tile-gap)' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${wide ? 'col-span-4' : 'col-span-2'} row-span-2 animate-pulse bg-border-subtle`} />
      ))}
    </div>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="py-10">
      <FlyingDots label={label} />
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="max-w-xl border-l-4 border-accent bg-surface px-6 py-5">
      <p className="text-xl font-light">{title}</p>
      {message && <p className="mt-1 text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Error with Retry; 404 / 403 get their specific wording (UI_REQUIREMENTS §2.3). */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="py-10">
        <h1 className="text-5xl font-light">Not found</h1>
        <p className="mt-4 max-w-xl text-muted">This was deleted, or you don&apos;t have access to it.</p>
        <Link href="/projects" className={`${btn.secondary} mt-6`}>
          Back to projects
        </Link>
      </div>
    );
  }
  const message =
    error instanceof ApiError && error.status === 403
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Something went wrong.';
  return (
    <div role="alert" className="flex max-w-xl flex-col items-start gap-4 border-l-4 border-danger bg-surface px-6 py-5">
      <p className="flex items-center gap-2">
        <WarningRegular aria-hidden fontSize={20} className="text-danger" />
        {message}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={btn.secondary}>
          Retry
        </button>
      )}
    </div>
  );
}

/** Full-width strip under the top bar for page-level state (archived, read-only…). */
export function Banner({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: React.ReactNode }) {
  const Icon = tone === 'info' ? InfoRegular : WarningRegular;
  return (
    <div role="status" className={`${tone === 'info' ? 'bg-accent text-accent-fg' : 'bg-warning text-white'}`}>
      <p className="flex items-center gap-3 px-4 py-3 text-[15px] sm:px-16">
        <Icon aria-hidden fontSize={20} className="shrink-0" />
        {children}
      </p>
    </div>
  );
}
