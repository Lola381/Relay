import { and, eq } from 'drizzle-orm';
import type { Actor, AuthUser } from '@pm/shared';
import type { Db, Tx } from '../db/client';
import { projectMembers, projects, type ProjectRow } from '../db/schema';
import { notFound } from '../lib/errors';

export interface ProjectAccess {
  project: ProjectRow;
  /** The caller, with their CURRENT role in this project (read in the same transaction). */
  actor: Actor;
}

/**
 * Row lock taken on the project:
 * - 'share':  any write inside the project (tasks, comments, members). Blocks a concurrent
 *             archive/delete until we commit, so nothing slips into an archived project (P3).
 * - 'update': archive / unarchive / delete / edit of the project row itself.
 * - 'none':   reads.
 * Lock order is always project row → task row, to avoid deadlocks (DATA_MODEL R4).
 */
export type ProjectLock = 'none' | 'share' | 'update';

/**
 * Loads a project and the caller's membership. A project the caller can't see answers exactly
 * like one that doesn't exist (404), so other projects' existence isn't revealed.
 */
export async function loadProjectAccess(
  executor: Db | Tx,
  projectId: string,
  user: AuthUser,
  lock: ProjectLock = 'none',
): Promise<ProjectAccess> {
  const query = executor.select().from(projects).where(eq(projects.id, projectId));
  const [project] = await (lock === 'none' ? query : query.for(lock === 'share' ? 'share' : 'update'));
  if (!project) throw notFound('Project not found.');

  const [membership] = await executor
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)));

  if (!membership && user.role !== 'ADMIN') throw notFound('Project not found.');

  return {
    project,
    actor: { userId: user.id, systemRole: user.role, projectRole: membership?.role ?? null },
  };
}
