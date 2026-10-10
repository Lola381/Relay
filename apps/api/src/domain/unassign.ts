import { and, eq, ne, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { tasks } from '../db/schema';
import type { Emit } from '../lib/tx';
import { logActivity } from './activity';

/**
 * Unassigns a member's tasks in a project (DATA_MODEL M5). Used when a member is removed
 * (all their tasks) or becomes a VIEWER (open tasks only; who completed a DONE task is kept).
 *
 * Each task's version is bumped, so anyone editing it with the old version gets a 409 instead of
 * silently overwriting the change. Returns the affected tasks for the caller's activity metadata.
 */
export async function unassignMemberTasks(
  tx: Tx,
  emit: Emit,
  opts: { projectId: string; userId: string; actorId: string; openOnly: boolean; userName: string },
) {
  const affected = await tx
    .update(tasks)
    .set({
      assigneeId: null,
      version: sql`${tasks.version} + 1`,
      updatedBy: opts.actorId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.projectId, opts.projectId),
        eq(tasks.assigneeId, opts.userId),
        opts.openOnly ? ne(tasks.status, 'DONE') : undefined,
      ),
    )
    .returning({ id: tasks.id, title: tasks.title, version: tasks.version });

  for (const task of affected) {
    await logActivity(tx, emit, {
      actorId: opts.actorId,
      projectId: opts.projectId,
      action: 'TASK_UNASSIGNED',
      entityType: 'TASK',
      entityId: task.id,
      metadata: { taskTitle: task.title, previousAssigneeId: opts.userId, previousAssigneeName: opts.userName },
    });
    emit({
      type: 'task.updated',
      projectId: opts.projectId,
      actorId: opts.actorId,
      data: { id: task.id, assigneeId: null, version: task.version },
    });
  }
  return affected;
}
