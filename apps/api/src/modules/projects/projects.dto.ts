// Builds Project / ProjectMember responses. Stats for a whole page of projects are computed in a
// handful of grouped queries (never one query per project).
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  TASK_STATUSES,
  type AuthUser,
  type Project,
  type ProjectMember,
  type ProjectRole,
  type TaskStatus,
} from '@pm/shared';
import type { Db, Tx } from '../../db/client';
import { comments, projectMembers, tasks, users, type ProjectRow } from '../../db/schema';

type Executor = Db | Tx;

const emptyTaskCounts = () =>
  Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;

export async function toProjectDtos(db: Executor, rows: ProjectRow[], viewer: AuthUser): Promise<Project[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((p) => p.id);

  const [taskAgg, memberAgg, managers, commentAgg, myRoles, creators] = await Promise.all([
    db
      .select({
        projectId: tasks.projectId,
        status: tasks.status,
        count: sql<number>`count(*)::int`,
        overdue: sql<number>`(count(*) filter (where ${tasks.dueDate} < current_date and ${tasks.status} <> 'DONE'))::int`,
        unassigned: sql<number>`(count(*) filter (where ${tasks.assigneeId} is null and ${tasks.status} <> 'DONE'))::int`,
        mine: sql<number>`(count(*) filter (where ${tasks.assigneeId} = ${viewer.id} and ${tasks.status} <> 'DONE'))::int`,
      })
      .from(tasks)
      .where(inArray(tasks.projectId, ids))
      .groupBy(tasks.projectId, tasks.status),
    db
      .select({ projectId: projectMembers.projectId, count: sql<number>`count(*)::int` })
      .from(projectMembers)
      .where(inArray(projectMembers.projectId, ids))
      .groupBy(projectMembers.projectId),
    db
      .select({ projectId: projectMembers.projectId, id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(and(inArray(projectMembers.projectId, ids), eq(projectMembers.role, 'MANAGER')))
      .orderBy(asc(users.name)),
    db
      .select({ projectId: comments.projectId, count: sql<number>`count(*)::int` })
      .from(comments)
      .where(inArray(comments.projectId, ids))
      .groupBy(comments.projectId),
    db
      .select({ projectId: projectMembers.projectId, role: projectMembers.role })
      .from(projectMembers)
      .where(and(inArray(projectMembers.projectId, ids), eq(projectMembers.userId, viewer.id))),
    db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, [...new Set(rows.map((p) => p.createdBy))])),
  ]);

  return rows.map((project) => {
    const taskCounts = emptyTaskCounts();
    let overdueCount = 0;
    let unassignedCount = 0;
    let myOpenTaskCount = 0;
    for (const agg of taskAgg) {
      if (agg.projectId !== project.id) continue;
      taskCounts[agg.status] = agg.count;
      overdueCount += agg.overdue;
      unassignedCount += agg.unassigned;
      myOpenTaskCount += agg.mine;
    }
    const role = myRoles.find((m) => m.projectId === project.id)?.role;
    const creator = creators.find((u) => u.id === project.createdBy);

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      version: project.version,
      myRole: viewer.role === 'ADMIN' ? 'ADMIN' : (role as ProjectRole),
      managers: managers
        .filter((m) => m.projectId === project.id)
        .map(({ id, name, avatarUrl }) => ({ id, name, avatarUrl })),
      createdBy: creator ?? { id: project.createdBy, name: 'Unknown', avatarUrl: null },
      stats: {
        memberCount: memberAgg.find((m) => m.projectId === project.id)?.count ?? 0,
        taskCount: Object.values(taskCounts).reduce((a, b) => a + b, 0),
        taskCounts,
        overdueCount,
        unassignedCount,
        commentCount: commentAgg.find((c) => c.projectId === project.id)?.count ?? 0,
        myOpenTaskCount,
      },
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      archivedAt: project.archivedAt?.toISOString() ?? null,
    };
  });
}

export async function toProjectDto(db: Executor, row: ProjectRow, viewer: AuthUser): Promise<Project> {
  const [dto] = await toProjectDtos(db, [row], viewer);
  return dto!;
}

const ROLE_ORDER = sql`case ${projectMembers.role} when 'MANAGER' then 1 when 'MEMBER' then 2 else 3 end`;

/** Members of a project with their open-task counts, managers first, then by name. */
export async function queryMembers(
  db: Executor,
  projectId: string,
  opts: { role?: ProjectRole; userId?: string; limit?: number; offset?: number } = {},
): Promise<ProjectMember[]> {
  const openTasks = db
    .select({ assigneeId: tasks.assigneeId, count: sql<number>`count(*)::int`.as('count') })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), ne(tasks.status, 'DONE')))
    .groupBy(tasks.assigneeId)
    .as('open_tasks');

  const rows = await db
    .select({
      role: projectMembers.role,
      addedAt: projectMembers.createdAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
      },
      openTaskCount: sql<number>`coalesce(${openTasks.count}, 0)::int`,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .leftJoin(openTasks, eq(openTasks.assigneeId, projectMembers.userId))
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        opts.role ? eq(projectMembers.role, opts.role) : undefined,
        opts.userId ? eq(projectMembers.userId, opts.userId) : undefined,
      ),
    )
    .orderBy(ROLE_ORDER, asc(users.name))
    .limit(opts.limit ?? 1000)
    .offset(opts.offset ?? 0);

  return rows.map((r) => ({
    projectId,
    user: r.user,
    role: r.role,
    openTaskCount: r.openTaskCount,
    addedAt: r.addedAt.toISOString(),
  }));
}
