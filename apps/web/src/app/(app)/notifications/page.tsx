'use client';

import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { useState } from 'react';
import type { Notification, NotificationPage } from '@pm/shared';
import { notificationHref } from '@/components/shell/NotificationBell';
import { EmptyState, ErrorState, LoadingState } from '@/components/metro/States';
import { api } from '@/lib/api/client';
import { notificationText } from '@/lib/messages';
import { btn } from '@/lib/ui';

type Filter = 'all' | 'unread';

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEEE, MMM d');
};

/** All my notifications, newest first, grouped by day (UI_REQUIREMENTS §3.11). Live via SSE. */
export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useInfiniteQuery({
    queryKey: ['notifications', 'page', filter],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<NotificationPage>(`/notifications?page=${pageParam}&pageSize=20${filter === 'unread' ? '&unreadOnly=true' : ''}`, { signal }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const toggle = useMutation({
    mutationFn: (n: Notification) => api(`/notifications/${n.id}/${n.readAt ? 'unread' : 'read'}`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const markAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: refresh });

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  const unread = query.data?.pages[0]?.unreadCount ?? 0;
  const groups: { day: string; items: Notification[] }[] = [];
  for (const n of items) {
    const day = dayLabel(n.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(n);
    else groups.push({ day, items: [n] });
  }

  return (
    <main className="px-4 pt-6 sm:px-16">
      <h1 className="text-5xl font-light sm:text-7xl">Notifications</h1>
      <div className="mt-6 mb-8 flex flex-wrap items-center gap-6">
        <div role="tablist" aria-label="Filter" className="flex gap-6 text-2xl font-light">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className="text-muted aria-selected:text-fg"
            >
              {f === 'all' ? 'All' : `Unread · ${unread}`}
            </button>
          ))}
        </div>
        {unread > 0 && (
          <button className={`${btn.secondary} ml-auto`} onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            Mark all read
          </button>
        )}
      </div>

      {query.isPending && <LoadingState label="Loading notifications" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.isSuccess && items.length === 0 && (
        <EmptyState title={filter === 'unread' ? "You're all caught up" : 'No notifications yet'} />
      )}

      <div className="max-w-3xl space-y-8">
        {groups.map((g) => (
          <section key={g.day} aria-label={g.day}>
            <h2 className="mb-2 text-sm tracking-wide text-muted uppercase">{g.day}</h2>
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {g.items.map((n) => (
                <li key={n.id} className={`flex items-start gap-3 border-l-4 py-3 pl-3 ${n.readAt ? 'border-transparent' : 'border-tile-notification'}`}>
                  <Link
                    href={notificationHref(n)}
                    onClick={() => !n.readAt && toggle.mutate(n)}
                    className="min-w-0 flex-1 hover:underline"
                  >
                    <p className={n.readAt ? 'text-muted' : ''}>{notificationText(n)}</p>
                    <p className="text-xs text-muted">
                      {typeof n.metadata.projectName === 'string' && `${n.metadata.projectName} · `}
                      <time dateTime={n.createdAt} title={format(new Date(n.createdAt), 'PPpp')}>
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </time>
                    </p>
                  </Link>
                  <button
                    className="shrink-0 px-2 py-1 text-sm text-accent-text hover:underline"
                    onClick={() => toggle.mutate(n)}
                    disabled={toggle.isPending}
                  >
                    {n.readAt ? 'Mark unread' : 'Mark read'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {query.hasNextPage && (
          <button className={btn.secondary} onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </main>
  );
}
