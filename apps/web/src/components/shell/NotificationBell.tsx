'use client';

import Link from 'next/link';
import * as Popover from '@radix-ui/react-popover';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import type { Notification, NotificationPage } from '@pm/shared';
import { AlertRegular } from '@/components/icons';
import { api } from '@/lib/api/client';
import { notificationText } from '@/lib/messages';

const KEY = ['notifications', 'latest'];

/** Where a notification leads: the task (opened in its board) or the project. */
export function notificationHref(n: Notification): string {
  if (!n.projectId) return '/dashboard';
  if (n.entityType === 'TASK') return `/projects/${n.projectId}/tasks?task=${n.entityId}`;
  return `/projects/${n.projectId}`;
}

export function useNotifications() {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => api<NotificationPage>('/notifications?pageSize=15', { signal }),
  });
}

/** Top-bar bell with unread badge and the latest notifications. */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const query = useNotifications();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: refresh });
  const markOne = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refresh,
  });

  const unread = query.data?.unreadCount ?? 0;
  const items = query.data?.data ?? [];

  return (
    <Popover.Root>
      <Popover.Trigger className="relative p-2 hover:bg-border-subtle" aria-label={`Notifications, ${unread} unread`}>
        <AlertRegular fontSize={22} aria-hidden />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-5 bg-tile-alert px-1 text-center text-xs leading-5 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-[70vh] w-[min(380px,calc(100vw-32px))] overflow-y-auto border border-border-subtle bg-surface text-fg shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <p className="text-xl font-light">Notifications</p>
            {unread > 0 && (
              <button className="text-sm text-accent-text hover:underline" onClick={() => markAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 && <p className="px-4 py-6 text-muted">{"You're all caught up."}</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <Popover.Close asChild>
                  <Link
                    href={notificationHref(n)}
                    onClick={() => !n.readAt && markOne.mutate(n.id)}
                    className={`block border-l-4 px-4 py-3 hover:bg-border-subtle ${n.readAt ? 'border-transparent text-muted' : 'border-tile-notification'}`}
                  >
                    <p className="text-[15px]">{notificationText(n)}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {typeof n.metadata.projectName === 'string' && `${n.metadata.projectName} · `}
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </Link>
                </Popover.Close>
              </li>
            ))}
          </ul>
          <Popover.Close asChild>
            <Link href="/notifications" className="block border-t border-border-subtle px-4 py-3 text-center text-accent-text hover:bg-border-subtle">
              See all notifications
            </Link>
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
