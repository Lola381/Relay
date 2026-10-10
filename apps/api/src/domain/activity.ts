import type { ActivityAction, ActivityEntityType } from '@pm/shared';
import type { Tx } from '../db/client';
import { activityLogs } from '../db/schema';
import type { Emit } from '../lib/tx';

export interface ActivityInput {
  actorId: string | null;
  /** NULL for system-level events (user management, deleted projects). */
  projectId: string | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  /** Snapshot of names/titles, so the entry still reads correctly after renames and deletes. */
  metadata?: Record<string, unknown>;
}

/** The single place that writes the audit trail. Always called inside the change's transaction. */
export async function logActivity(tx: Tx, emit: Emit, input: ActivityInput) {
  const [row] = await tx
    .insert(activityLogs)
    .values({
      userId: input.actorId,
      projectId: input.projectId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    })
    .returning();

  emit({
    type: 'activity.created',
    projectId: input.projectId ?? undefined,
    actorId: input.actorId ?? undefined,
    data: row,
  });
  return row!;
}
