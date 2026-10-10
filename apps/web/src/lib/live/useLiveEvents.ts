'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ApiResponse, LiveEvent, Notification } from '@pm/shared';
import { api } from '@/lib/api/client';
import { API_URL } from '@/lib/env';
import { notificationText } from '@/lib/messages';

export type LiveStatus = 'connecting' | 'live' | 'offline';

/**
 * Real-time updates over Server-Sent Events. EventSource can't send an Authorization header, so
 * each (re)connect first trades the access token for a single-use ticket. Events only tell us
 * WHAT changed; the affected queries are refetched, so the server stays the source of truth
 * (and permissions are re-checked on every read).
 */
export function useLiveEvents(userId: string): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const handle = (event: LiveEvent) => {
      const [scope] = event.type.split('.');
      if (scope === 'notification') {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        if (event.type === 'notification.created') {
          toast(notificationText(event.data as Notification));
        }
        return;
      }
      if (scope === 'user') {
        void queryClient.invalidateQueries({ queryKey: ['users'] });
        return;
      }
      // task.*, comment.*, member.*, project.*, activity.*
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    };

    const connect = async () => {
      setStatus('connecting');
      try {
        const { data } = await api<ApiResponse<{ ticket: string }>>('/events/ticket', { method: 'POST' });
        if (stopped) return;
        source = new EventSource(`${API_URL}/events?ticket=${encodeURIComponent(data.ticket)}`);
        source.onopen = () => setStatus('live');
        source.onmessage = (message) => {
          try {
            handle(JSON.parse(message.data as string) as LiveEvent);
          } catch {
            // Ignore malformed messages
          }
        };
        source.onerror = () => {
          // The ticket was single-use, so reconnect ourselves with a fresh one
          source?.close();
          scheduleRetry();
        };
      } catch {
        scheduleRetry();
      }
    };

    const scheduleRetry = () => {
      if (stopped) return;
      setStatus('offline');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void connect(), 3000);
    };

    void connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [queryClient, userId]);

  return status;
}
