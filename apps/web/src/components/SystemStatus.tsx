'use client';

import { useEffect, useState } from 'react';
import { SYSTEM_ROLES, type ApiResponse, type HealthStatus } from '@pm/shared';
import { API_URL } from '@/lib/env';

type CheckState = 'checking' | 'ok' | 'down';

interface Status {
  api: CheckState;
  db: CheckState;
}

/** Phase 0 wiring check: web → API (CORS + base URL) → DB, and web → shared package. */
export function SystemStatus() {
  const [status, setStatus] = useState<Status>({ api: 'checking', db: 'checking' });

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_URL}/health`, { signal: controller.signal })
      .then(async (res) => {
        // 503 still carries a body that says which part is down
        const body = (await res.json()) as ApiResponse<HealthStatus>;
        setStatus({ api: 'ok', db: body.data.db === 'ok' ? 'ok' : 'down' });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setStatus({ api: 'down', db: 'down' });
      });

    return () => controller.abort();
  }, []);

  const tiles = [
    { label: 'API', value: status.api },
    { label: 'Database', value: status.db },
    { label: 'Shared package', value: `${SYSTEM_ROLES.length} roles` },
  ];

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex aspect-square flex-col justify-between bg-tile p-4">
          <span className="text-4xl font-light" aria-live="polite">
            {tile.value}
          </span>
          <span className="text-sm">{tile.label}</span>
        </div>
      ))}
    </div>
  );
}
