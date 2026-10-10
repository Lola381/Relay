'use client';

import { ActivityFeed } from '@/components/features/activity/ActivityFeed';
import { EmptyState } from '@/components/metro/States';
import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { canInSystem } from '@/lib/permissions';

/** System-wide activity (Admin). */
export default function SystemActivityPage() {
  const user = useCurrentUser();
  return (
    <main className="px-4 pt-6 sm:px-16">
      <h1 className="mb-8 text-5xl font-light sm:text-7xl">Activity</h1>
      {canInSystem(user, 'activity.viewSystem') ? (
        <ActivityFeed path="/activity" queryKey={['activity', 'system']} />
      ) : (
        <EmptyState title="Administrators only" message="Project activity is on each project's Activity tab." />
      )}
    </main>
  );
}
