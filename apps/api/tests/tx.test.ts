// Events are published only after COMMIT, and never for a rolled-back change (DATA_MODEL R2).
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { activityLogs } from '../src/db/schema';
import { onCommittedEvent, type AppEvent } from '../src/lib/events';
import { withTransaction } from '../src/lib/tx';

let unsubscribe: (() => void) | undefined;
afterEach(() => unsubscribe?.());

const logRow = (entityId: string) => ({
  action: 'TASK_CREATED' as const,
  entityType: 'TASK' as const,
  entityId,
  metadata: {},
});

describe('withTransaction', () => {
  it('publishes queued events after commit, when the data is visible to other connections', async () => {
    const entityId = randomUUID();
    const seen: { event: AppEvent; visibleElsewhere: boolean }[] = [];
    const checks: Promise<void>[] = [];

    unsubscribe = onCommittedEvent((event) => {
      // Query through a different pooled connection than the transaction used
      checks.push(
        pool
          .query('SELECT 1 FROM activity_logs WHERE entity_id = $1', [entityId])
          .then((r) => void seen.push({ event, visibleElsewhere: r.rowCount === 1 })),
      );
    });

    await withTransaction(async (tx, emit) => {
      await tx.insert(activityLogs).values(logRow(entityId));
      emit({ type: 'task.created', data: { entityId } });
      emit({ type: 'activity.created', data: { entityId } });
    });
    await Promise.all(checks);

    expect(seen.map((s) => s.event.type)).toEqual(['task.created', 'activity.created']);
    expect(seen.every((s) => s.visibleElsewhere)).toBe(true);
  });

  it('discards events and data when the work throws', async () => {
    const entityId = randomUUID();
    const seen: AppEvent[] = [];
    unsubscribe = onCommittedEvent((event) => seen.push(event));

    await expect(
      withTransaction(async (tx, emit) => {
        await tx.insert(activityLogs).values(logRow(entityId));
        emit({ type: 'task.created', data: { entityId } });
        throw new Error('validation failed halfway');
      }),
    ).rejects.toThrow('validation failed halfway');

    expect(seen).toEqual([]);
    const rows = await db.select().from(activityLogs).where(eq(activityLogs.entityId, entityId));
    expect(rows).toEqual([]);
  });

  it('a throwing listener does not break the request that committed', async () => {
    unsubscribe = onCommittedEvent(() => {
      throw new Error('stream closed');
    });
    const result = await withTransaction(async (_tx, emit) => {
      emit({ type: 'x', data: null });
      return 'committed';
    });
    expect(result).toBe('committed');
  });
});
