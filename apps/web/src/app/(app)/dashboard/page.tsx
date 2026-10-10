'use client';

import { useCurrentUser } from '@/lib/auth/AuthProvider';
import { firstName, roleLabel } from '@/lib/format';

// Placeholder Start screen: the live tile groups are built in Phase 8.
export default function DashboardPage() {
  const user = useCurrentUser();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="px-4 pt-8 pb-16 sm:px-16">
      <h1 className="text-5xl font-light sm:text-7xl">Hello, {firstName(user.name)}</h1>
      <p className="mt-4 text-muted">{today}</p>

      <div className="mt-12 grid max-w-[640px] grid-cols-2 gap-3">
        <div className="flex aspect-square flex-col justify-end bg-tile-work p-5 text-white">
          <span className="text-3xl font-light">{roleLabel(user.role)}</span>
          <span className="mt-1 text-sm">Your role</span>
        </div>
        <div className="flex aspect-square flex-col justify-end bg-tile-project p-5 text-white">
          <span className="truncate text-xl font-light">{user.email}</span>
          <span className="mt-1 text-sm">Signed in as</span>
        </div>
      </div>
    </main>
  );
}
