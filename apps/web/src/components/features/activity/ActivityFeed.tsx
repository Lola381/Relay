'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import type { ActivityEntry, Paginated } from '@pm/shared';
import { ErrorState, LoadingState } from '@/components/metro/States';
import { api } from '@/lib/api/client';
import { activityText } from '@/lib/messages';
import { btn } from '@/lib/ui';

/** Paged activity log, newest first. `path` is /projects/:id/activity or /activity. */
export function ActivityFeed({ path, queryKey }: { path: string; queryKey: readonly unknown[] }) {
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api<Paginated<ActivityEntry>>(`${path}?page=${pageParam}&pageSize=30`, { signal }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });

  if (query.isPending) return <LoadingState label="Loading activity" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const entries = query.data.pages.flatMap((p) => p.data);

  return (
    <div className="max-w-3xl">
      {entries.length === 0 && <p className="text-muted">Nothing has happened yet.</p>}
      <ol className="border-l-2 border-border-subtle">
        {entries.map((a) => (
          <li key={a.id} className="relative py-3 pl-6">
            <span className="absolute top-5 -left-[7px] size-3 bg-tile-activity" aria-hidden />
            <p>{activityText(a)}</p>
            <p className="text-sm text-muted">
              {typeof a.metadata.projectName === 'string' && !path.startsWith('/projects') && `${a.metadata.projectName} · `}
              <time dateTime={a.createdAt}>{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</time>
            </p>
          </li>
        ))}
      </ol>
      {query.hasNextPage && (
        <button className={`${btn.secondary} mt-4`} onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
