'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FullScreenStatus } from '@/components/metro/FullScreenStatus';
import { TopBar } from '@/components/shell/TopBar';
import { useAuth } from '@/lib/auth/AuthProvider';
import { stepsBackIntoSession } from '@/lib/auth/historyGuard';
import { useLiveEvents } from '@/lib/live/useLiveEvents';
import type { AuthUser } from '@pm/shared';

/**
 * Everything under (app) requires a session. This guard is UX only: the API enforces
 * authentication and authorization on every request regardless.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { state, retry } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Back pressed past the sign-in point (into an earlier session's pages) → step forward again
  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const steps = stepsBackIntoSession();
    if (steps > 0) window.history.go(steps);
  }, [state.status, pathname]);

  useEffect(() => {
    if (state.status !== 'anonymous') return;
    const params = new URLSearchParams();
    if (state.reason) params.set('reason', state.reason);
    // Come back here after signing in again (not after a deliberate sign-out)
    if (state.reason !== 'signed-out') params.set('next', pathname + window.location.search);
    const query = params.toString();
    router.replace(query ? `/login?${query}` : '/login');
  }, [state, pathname, router]);

  if (state.status === 'unreachable') {
    return (
      <FullScreenStatus
        title="Can't reach the server"
        message="The API isn't responding. Check that it's running, then try again."
        action={
          <button onClick={retry} className="border-2 border-border px-5 py-2.5 hover:border-accent">
            Try again
          </button>
        }
      />
    );
  }

  if (state.status !== 'authenticated') {
    return <FullScreenStatus loading title="Opening your workspace" />;
  }

  return <SignedInShell user={state.user}>{children}</SignedInShell>;
}

/** Mounted only with a session, so the live stream connects once signed in. */
function SignedInShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const live = useLiveEvents(user.id);
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar live={live} />
      {/* Bottom padding keeps content clear of the fixed app bar */}
      <div className="flex-1 pb-32">{children}</div>
    </div>
  );
}
