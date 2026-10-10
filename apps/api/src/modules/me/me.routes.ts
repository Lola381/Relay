import { Router } from 'express';
import { and, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import {
  changePasswordSchema,
  ERROR_CODES,
  TASK_STATUSES,
  updateProfileSchema,
  type ApiResponse,
  type AuthUser,
  type DashboardSummary,
  type TaskStatus,
} from '@pm/shared';
import { db } from '../../db/client';
import { activityLogs, notifications, projectMembers, projects, refreshTokens, tasks, users } from '../../db/schema';
import { logActivity } from '../../domain/activity';
import { readRefreshCookie } from '../../lib/cookies';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { hashToken } from '../../lib/tokens';
import { withTransaction } from '../../lib/tx';
import { parse } from '../../lib/validation';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { feed } from '../activity/activity.routes';
import { toAuthUser } from '../users/users.mapper';

/** Mounted at /api/v1. Your own profile, password and the Start-screen summary. */
export const meRouter = Router();

meRouter.get('/me', authenticate, (req, res) => {
  res.json({ data: currentUser(req) } satisfies ApiResponse<AuthUser>);
});

/** Name and avatar only: role and email are changed by an admin, never by the user. */
meRouter.patch('/me', authenticate, async (req, res) => {
  const user = currentUser(req);
  const input = parse(updateProfileSchema, req.body);
  const row = await withTransaction(async (tx, emit) => {
    const [updated] = await tx
      .update(users)
      .set({ ...(input.name !== undefined && { name: input.name }), ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }) })
      .where(eq(users.id, user.id))
      .returning();
    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: null,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { userName: updated!.name, fields: Object.keys(input), self: true },
    });
    emit({ type: 'user.updated', userIds: [user.id], actorId: user.id, data: { id: user.id } });
    return updated!;
  });
  res.json({ data: toAuthUser(row) } satisfies ApiResponse<AuthUser>);
});

/** Checks the current password; signs out every OTHER session, keeps this one. */
meRouter.put('/me/password', authenticate, async (req, res) => {
  const user = currentUser(req);
  const input = parse(changePasswordSchema, req.body);
  const row = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!row || !(await verifyPassword(input.currentPassword, row.passwordHash))) {
    throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Your current password is incorrect.', [
      { path: 'currentPassword', message: 'Your current password is incorrect.' },
    ]);
  }
  const passwordHash = await hashPassword(input.newPassword);

  const cookie = readRefreshCookie(req);
  const current = cookie
    ? await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, hashToken(cookie)) })
    : undefined;

  await withTransaction(async (tx, emit) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, user.id),
          isNull(refreshTokens.revokedAt),
          current ? ne(refreshTokens.familyId, current.familyId) : undefined,
        ),
      );
    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: null,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { userName: row.name, fields: ['password'], self: true },
    });
  });
  res.status(204).end();
});

/** Role-aware Start-screen summary in one call (API_DESIGN §4.10). */
meRouter.get('/dashboard', authenticate, async (req, res) => {
  const user = currentUser(req);
  const isAdmin = user.role === 'ADMIN';

  const myProjectIds = isAdmin
    ? undefined
    : (await db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, user.id))).map(
        (r) => r.id,
      );
  const inMyProjects = (column: typeof projects.id | typeof activityLogs.projectId) =>
    myProjectIds === undefined ? undefined : myProjectIds.length ? inArray(column, myProjectIds) : sql`false`;

  const [statusRows, overdue, projectRows, unread, activity, system] = await Promise.all([
    db
      .select({ status: tasks.status, count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.assigneeId, user.id))
      .groupBy(tasks.status),
    db.$count(tasks, and(eq(tasks.assigneeId, user.id), ne(tasks.status, 'DONE'), lt(tasks.dueDate, sql`current_date`))),
    db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        role: projectMembers.role,
        taskCount: sql<number>`(select count(*) from ${tasks} where ${tasks.projectId} = ${projects.id})::int`,
        doneCount: sql<number>`(select count(*) from ${tasks} where ${tasks.projectId} = ${projects.id} and ${tasks.status} = 'DONE')::int`,
      })
      .from(projects)
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, user.id)))
      .where(inMyProjects(projects.id))
      .orderBy(desc(projects.updatedAt))
      .limit(20),
    db.$count(notifications, and(eq(notifications.recipientId, user.id), isNull(notifications.readAt))),
    feed(inMyProjects(activityLogs.projectId), { page: 1, pageSize: 10 }),
    isAdmin
      ? Promise.all([
          db.$count(users),
          db.$count(users, eq(users.isActive, true)),
          db.$count(projects),
          db.$count(projects, eq(projects.status, 'ACTIVE')),
          db.$count(tasks),
        ])
      : undefined,
  ]);

  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  for (const r of statusRows) byStatus[r.status] = r.count;

  const data: DashboardSummary = {
    myTasks: { open: TASK_STATUSES.filter((s) => s !== 'DONE').reduce((n, s) => n + byStatus[s], 0), overdue, byStatus },
    projects: projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      myRole: isAdmin ? 'ADMIN' : p.role!,
      taskCount: p.taskCount,
      doneCount: p.doneCount,
    })),
    unreadNotifications: unread,
    recentActivity: activity.data,
    ...(system && {
      system: { users: system[0], activeUsers: system[1], projects: system[2], activeProjects: system[3], tasks: system[4] },
    }),
  };
  res.json({ data } satisfies ApiResponse<DashboardSummary>);
});
