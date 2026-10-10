import { and, eq, inArray } from 'drizzle-orm';
import type { NotificationEntityType, NotificationType } from '@pm/shared';
import type { Tx } from '../db/client';
import { notifications, users } from '../db/schema';
import type { Emit } from '../lib/tx';

/** When one action reaches a person for several reasons, they get only the most relevant one. */
const PRIORITY: Partial<Record<NotificationType, number>> = { MENTIONED: 1, TASK_ASSIGNED: 2 };
const priorityOf = (type: NotificationType) => PRIORITY[type] ?? 10;

export interface NotifyInput {
  actorId: string;
  recipients: { userId: string; type: NotificationType }[];
  projectId: string | null;
  entityType: NotificationEntityType;
  entityId: string;
  /** Snapshot for rendering the message later (projectName, taskTitle, role, from/to…). */
  metadata: Record<string, unknown>;
}

/**
 * Creates notifications, applying the rules from DATA_MODEL §4.6:
 * never notify the actor (N1), one notification per person per action (N2),
 * nothing for deactivated users (N6). Runs inside the change's transaction.
 */
export async function notify(tx: Tx, emit: Emit, input: NotifyInput): Promise<void> {
  const best = new Map<string, NotificationType>();
  for (const { userId, type } of input.recipients) {
    if (userId === input.actorId) continue;
    const current = best.get(userId);
    if (!current || priorityOf(type) < priorityOf(current)) best.set(userId, type);
  }
  if (best.size === 0) return;

  const active = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, [...best.keys()]), eq(users.isActive, true)));
  if (active.length === 0) return;

  const actor = await tx.query.users.findFirst({
    where: eq(users.id, input.actorId),
    columns: { name: true },
  });

  const rows = await tx
    .insert(notifications)
    .values(
      active.map(({ id }) => ({
        recipientId: id,
        actorId: input.actorId,
        type: best.get(id)!,
        projectId: input.projectId,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: { actorName: actor?.name ?? null, ...input.metadata },
      })),
    )
    .returning();

  for (const row of rows) {
    emit({ type: 'notification.created', userIds: [row.recipientId], actorId: input.actorId, data: row });
  }
}
