import { and, desc, eq, gte, ilike, inArray, isNull, lt, lte, ne, sql, type SQL } from 'drizzle-orm';
import {
  ERROR_CODES,
  isAssignableRole,
  type AuthUser,
  type NotificationType,
  type Paginated,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TASK_SORTS,
} from '@pm/shared';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { assertProjectCan } from '../../access/assert';
import { loadProjectAccess, type ProjectAccess } from '../../access/projectAccess';
import { db, type Tx } from '../../db/client';
import { projectMembers, tasks, users, type TaskRow } from '../../db/schema';
import { logActivity } from '../../domain/activity';
import { notify } from '../../domain/notify';
import { AppError, notFound } from '../../lib/errors';
import { likePattern, pageMeta, toLimitOffset } from '../../lib/pagination';
import { withTransaction, type Emit } from '../../lib/tx';
import { PRIORITY_RANK, queryTasks, taskDto } from './tasks.dto';

const taskDeleted = () => new AppError(404, ERROR_CODES.TASK_DELETED, 'This task has been deleted.');

// ── Queries ──

type ListQuery = {
  page: number;
  pageSize: number;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assigneeId?: string;
  search?: string;
  dueBefore?: string;
  dueAfter?: string;
  overdue?: boolean;
  sort: (typeof TASK_SORTS)[number];
};

const SORTS: Record<string, SQL | AnyPgColumn> = {
  updatedAt: tasks.updatedAt,
  createdAt: tasks.createdAt,
  dueDate: tasks.dueDate,
  priority: PRIORITY_RANK,
};

export async function listTasks(user: AuthUser, projectId: string, query: ListQuery): Promise<Paginated<Task>> {
  const access = await loadProjectAccess(db, projectId, user);
  assertProjectCan(access, 'project.view');

  const assigneeFilter =
    query.assigneeId === 'none'
      ? isNull(tasks.assigneeId)
      : query.assigneeId
        ? eq(tasks.assigneeId, query.assigneeId === 'me' ? user.id : query.assigneeId)
        : undefined;

  const where = and(
    eq(tasks.projectId, projectId),
    query.status?.length ? inArray(tasks.status, query.status) : undefined,
    query.priority?.length ? inArray(tasks.priority, query.priority) : undefined,
    assigneeFilter,
    query.search ? ilike(tasks.title, likePattern(query.search)) : undefined,
    query.dueBefore ? lte(tasks.dueDate, query.dueBefore) : undefined,
    query.dueAfter ? gte(tasks.dueDate, query.dueAfter) : undefined,
    query.overdue ? and(lt(tasks.dueDate, sql`current_date`), ne(tasks.status, 'DONE')) : undefined,
  );

  const descending = query.sort.startsWith('-');
  const column = SORTS[query.sort.replace('-', '')]!;
  // Undated tasks last when sorting by due date
  const order = descending ? sql`${column} desc nulls last` : sql`${column} asc nulls last`;

  const [data, total] = await Promise.all([
    queryTasks(db, where, { orderBy: [order], ...toLimitOffset(query) }),
    db.$count(tasks, where),
  ]);
  return { data, meta: pageMeta(query, total) };
}

/** Open tasks assigned to me across my projects (Start screen, "My tasks"). */
export async function myTasks(
  user: AuthUser,
  query: { page: number; pageSize: number; status?: TaskStatus[]; projectId?: string },
): Promise<Paginated<Task>> {
  const where = and(
    eq(tasks.assigneeId, user.id),
    query.status?.length ? inArray(tasks.status, query.status) : ne(tasks.status, 'DONE'),
    query.projectId ? eq(tasks.projectId, query.projectId) : undefined,
  );
  const [data, total] = await Promise.all([
    queryTasks(db, where, { orderBy: [sql`${tasks.dueDate} asc nulls last`, desc(PRIORITY_RANK)], ...toLimitOffset(query) }),
    db.$count(tasks, where),
  ]);
  return { data, meta: pageMeta(query, total) };
}

/** Project access for a task (404 for outsiders, exactly like a missing task). */
export async function accessForTask(executor: typeof db | Tx, user: AuthUser, taskId: string, lock: 'none' | 'share' = 'none') {
  const [row] = await executor.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId));
  if (!row) throw notFound('Task not found.');
  try {
    return await loadProjectAccess(executor, row.projectId, user, lock);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) throw notFound('Task not found.');
    throw err;
  }
}

export async function getTask(user: AuthUser, taskId: string): Promise<Task> {
  const access = await accessForTask(db, user, taskId);
  assertProjectCan(access, 'project.view');
  const dto = await taskDto(db, taskId);
  if (!dto) throw notFound('Task not found.');
  return dto;
}

// ── Commands ──

/** An assignee must be an ACTIVE MEMBER/MANAGER of the project (viewers are read-only). */
async function assertAssignable(tx: Tx, projectId: string, userId: string) {
  const [row] = await tx
    .select({ role: projectMembers.role, isActive: users.isActive, name: users.name })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  if (!row || !row.isActive || !isAssignableRole(row.role)) {
    throw new AppError(400, ERROR_CODES.INVALID_ASSIGNEE, 'Choose an active member of this project.', [
      { path: 'assigneeId', message: 'Choose an active member of this project.' },
    ]);
  }
  return row;
}

export async function createTask(
  user: AuthUser,
  projectId: string,
  input: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    assigneeId: string | null;
    dueDate: string | null;
  },
): Promise<Task> {
  return withTransaction(async (tx, emit) => {
    const access = await loadProjectAccess(tx, projectId, user, 'share');
    assertProjectCan(access, 'task.create');
    const assignee = input.assigneeId ? await assertAssignable(tx, projectId, input.assigneeId) : null;

    const [task] = await tx
      .insert(tasks)
      .values({
        projectId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: input.status,
        assigneeId: input.assigneeId,
        dueDate: input.dueDate,
        completedAt: input.status === 'DONE' ? new Date() : null,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();

    const meta = { taskTitle: task!.title, projectName: access.project.name };
    await logActivity(tx, emit, {
      actorId: user.id,
      projectId,
      action: 'TASK_CREATED',
      entityType: 'TASK',
      entityId: task!.id,
      metadata: { taskTitle: task!.title, priority: task!.priority },
    });
    if (assignee) {
      await logActivity(tx, emit, {
        actorId: user.id,
        projectId,
        action: 'TASK_ASSIGNED',
        entityType: 'TASK',
        entityId: task!.id,
        metadata: { taskTitle: task!.title, assigneeId: input.assigneeId, assigneeName: assignee.name, previousAssigneeId: null },
      });
      await notify(tx, emit, {
        actorId: user.id,
        recipients: [{ userId: input.assigneeId!, type: 'TASK_ASSIGNED' }],
        projectId,
        entityType: 'TASK',
        entityId: task!.id,
        metadata: meta,
      });
    }

    const dto = (await taskDto(tx, task!.id))!;
    emit({ type: 'task.created', projectId, actorId: user.id, data: dto });
    return dto;
  });
}

/**
 * Shared skeleton for every task write (DATA_MODEL §5): lock project (FOR SHARE) → lock task
 * (FOR UPDATE) → permission on the CURRENT row → version check → change. Lock order is always
 * project → task, so concurrent writers can't deadlock.
 */
async function mutateTask<T>(
  user: AuthUser,
  taskId: string,
  _version: number | undefined,
  work: (ctx: { tx: Tx; emit: Emit; access: ProjectAccess; task: TaskRow }) => Promise<T>,
): Promise<T> {
  return withTransaction(async (tx, emit) => {
    const access = await accessForTask(tx, user, taskId, 'share');
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for('update');
    if (!task) throw taskDeleted();
    return work({ tx, emit, access, task });
  });
}

/** 409 with the latest state, naming who changed it (spec §7). */
async function assertVersion(tx: Tx, task: TaskRow, version: number) {
  if (task.version === version) return;
  const editor = await tx.query.users.findFirst({ where: eq(users.id, task.updatedBy), columns: { name: true } });
  throw new AppError(
    409,
    ERROR_CODES.VERSION_CONFLICT,
    `${editor?.name ?? 'Someone'} changed this task while you were editing.`,
    { yourVersion: version, currentVersion: task.version, current: await taskDto(tx, task.id) },
  );
}

async function finish(tx: Tx, emit: Emit, user: AuthUser, taskId: string, projectId: string) {
  const dto = (await taskDto(tx, taskId))!;
  emit({ type: 'task.updated', projectId, actorId: user.id, data: dto });
  return dto;
}

export function updateTask(
  user: AuthUser,
  taskId: string,
  input: { version: number; title?: string; description?: string | null; priority?: TaskPriority; dueDate?: string | null },
): Promise<Task> {
  return mutateTask(user, taskId, input.version, async ({ tx, emit, access, task }) => {
    // Title/priority/due date: managers only. Description: managers or the assignee (T6).
    const touchesDetails = input.title !== undefined || input.priority !== undefined || input.dueDate !== undefined;
    if (touchesDetails) assertProjectCan(access, 'task.updateDetails');
    if (input.description !== undefined) assertProjectCan(access, 'task.updateDescription', { assigneeId: task.assigneeId });
    await assertVersion(tx, task, input.version);

    const changes: Record<string, [unknown, unknown]> = {};
    for (const key of ['title', 'description', 'priority', 'dueDate'] as const) {
      if (input[key] !== undefined && input[key] !== task[key]) changes[key] = [task[key], input[key]];
    }
    if (Object.keys(changes).length === 0) return (await taskDto(tx, taskId))!; // no-op (T4)

    await tx
      .update(tasks)
      .set({
        ...Object.fromEntries(Object.entries(changes).map(([k, [, next]]) => [k, next])),
        version: sql`${tasks.version} + 1`,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    const title = (changes.title?.[1] as string | undefined) ?? task.title;
    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: task.projectId,
      action: 'TASK_UPDATED',
      entityType: 'TASK',
      entityId: taskId,
      metadata: {
        taskTitle: title,
        // Long descriptions are summarised, not copied into the log
        changes: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, k === 'description' ? 'changed' : v])),
      },
    });
    if (task.assigneeId) {
      await notify(tx, emit, {
        actorId: user.id,
        recipients: [{ userId: task.assigneeId, type: 'TASK_UPDATED' }],
        projectId: task.projectId,
        entityType: 'TASK',
        entityId: taskId,
        metadata: { taskTitle: title, projectName: access.project.name, fields: Object.keys(changes) },
      });
    }
    return finish(tx, emit, user, taskId, task.projectId);
  });
}

export function changeStatus(user: AuthUser, taskId: string, input: { version: number; status: TaskStatus }): Promise<Task> {
  return mutateTask(user, taskId, input.version, async ({ tx, emit, access, task }) => {
    assertProjectCan(access, 'task.changeStatus', { assigneeId: task.assigneeId });
    await assertVersion(tx, task, input.version);
    if (task.status === input.status) return (await taskDto(tx, taskId))!; // no-op

    await tx
      .update(tasks)
      .set({
        status: input.status,
        completedAt: input.status === 'DONE' ? new Date() : null, // T8
        version: sql`${tasks.version} + 1`,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: task.projectId,
      action: 'TASK_STATUS_CHANGED',
      entityType: 'TASK',
      entityId: taskId,
      metadata: { taskTitle: task.title, from: task.status, to: input.status },
    });
    const recipients: { userId: string; type: NotificationType }[] = [{ userId: task.createdBy, type: 'TASK_STATUS_CHANGED' }];
    if (task.assigneeId) recipients.push({ userId: task.assigneeId, type: 'TASK_STATUS_CHANGED' });
    await notify(tx, emit, {
      actorId: user.id,
      recipients,
      projectId: task.projectId,
      entityType: 'TASK',
      entityId: taskId,
      metadata: { taskTitle: task.title, projectName: access.project.name, from: task.status, to: input.status },
    });
    return finish(tx, emit, user, taskId, task.projectId);
  });
}

export function changeAssignee(user: AuthUser, taskId: string, input: { version: number; assigneeId: string | null }): Promise<Task> {
  return mutateTask(user, taskId, input.version, async ({ tx, emit, access, task }) => {
    assertProjectCan(access, 'task.assign');
    await assertVersion(tx, task, input.version);
    if (task.assigneeId === input.assigneeId) return (await taskDto(tx, taskId))!; // no-op

    const next = input.assigneeId ? await assertAssignable(tx, task.projectId, input.assigneeId) : null;
    await tx
      .update(tasks)
      .set({ assigneeId: input.assigneeId, version: sql`${tasks.version} + 1`, updatedBy: user.id, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: task.projectId,
      action: input.assigneeId ? 'TASK_ASSIGNED' : 'TASK_UNASSIGNED',
      entityType: 'TASK',
      entityId: taskId,
      metadata: {
        taskTitle: task.title,
        assigneeId: input.assigneeId,
        assigneeName: next?.name ?? null,
        previousAssigneeId: task.assigneeId,
      },
    });
    const recipients: { userId: string; type: NotificationType }[] = [];
    if (input.assigneeId) recipients.push({ userId: input.assigneeId, type: 'TASK_ASSIGNED' });
    if (task.assigneeId) recipients.push({ userId: task.assigneeId, type: 'TASK_UNASSIGNED' });
    await notify(tx, emit, {
      actorId: user.id,
      recipients,
      projectId: task.projectId,
      entityType: 'TASK',
      entityId: taskId,
      metadata: { taskTitle: task.title, projectName: access.project.name },
    });
    return finish(tx, emit, user, taskId, task.projectId);
  });
}

export function deleteTask(user: AuthUser, taskId: string): Promise<void> {
  return mutateTask(user, taskId, undefined, async ({ tx, emit, access, task }) => {
    assertProjectCan(access, 'task.delete');
    await tx.delete(tasks).where(eq(tasks.id, taskId)); // comments + mentions cascade (T11)
    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: task.projectId,
      action: 'TASK_DELETED',
      entityType: 'TASK',
      entityId: taskId,
      metadata: { taskTitle: task.title, projectName: access.project.name },
    });
    emit({ type: 'task.deleted', projectId: task.projectId, actorId: user.id, data: { id: taskId, title: task.title } });
  });
}

