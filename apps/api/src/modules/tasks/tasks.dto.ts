import { asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Task } from '@pm/shared';
import type { Db, Tx } from '../../db/client';
import { comments, projects, tasks, users } from '../../db/schema';

const assignee = alias(users, 'assignee');
const creator = alias(users, 'creator');
const editor = alias(users, 'editor');


/** Selects tasks as API DTOs (joins people + project name + comment count). */
export async function queryTasks(
  db: Db | Tx,
  where: SQL | undefined,
  opts: { orderBy?: SQL[]; limit?: number; offset?: number } = {},
): Promise<Task[]> {
  const rows = await db
    .select({
      task: tasks,
      projectName: projects.name,
      assignee: { id: assignee.id, name: assignee.name, avatarUrl: assignee.avatarUrl, isActive: assignee.isActive },
      creator: { id: creator.id, name: creator.name, avatarUrl: creator.avatarUrl },
      editor: { id: editor.id, name: editor.name, avatarUrl: editor.avatarUrl },
      commentCount: sql<number>`(select count(*) from ${comments} where ${comments.taskId} = ${tasks.id})::int`,
      isOverdue: sql<boolean>`(${tasks.dueDate} < current_date and ${tasks.status} <> 'DONE')`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .innerJoin(creator, eq(creator.id, tasks.createdBy))
    .innerJoin(editor, eq(editor.id, tasks.updatedBy))
    .where(where)
    .orderBy(...(opts.orderBy ?? [desc(tasks.updatedAt)]), asc(tasks.id))
    .limit(opts.limit ?? 1000)
    .offset(opts.offset ?? 0);

  return rows.map((r) => ({
    id: r.task.id,
    projectId: r.task.projectId,
    projectName: r.projectName,
    title: r.task.title,
    description: r.task.description,
    status: r.task.status,
    priority: r.task.priority,
    assignee: r.task.assigneeId && r.assignee?.id ? { id: r.assignee.id, name: r.assignee.name!, avatarUrl: r.assignee.avatarUrl ?? null, isActive: r.assignee.isActive! } : null,
    dueDate: r.task.dueDate,
    isOverdue: Boolean(r.isOverdue),
    completedAt: r.task.completedAt?.toISOString() ?? null,
    version: r.task.version,
    commentCount: r.commentCount,
    createdBy: r.creator,
    updatedBy: r.editor,
    createdAt: r.task.createdAt.toISOString(),
    updatedAt: r.task.updatedAt.toISOString(),
  }));
}

export async function taskDto(db: Db | Tx, taskId: string): Promise<Task | null> {
  const [dto] = await queryTasks(db, eq(tasks.id, taskId));
  return dto ?? null;
}

export async function taskDtos(db: Db | Tx, ids: string[]): Promise<Task[]> {
  return ids.length ? queryTasks(db, inArray(tasks.id, ids)) : [];
}

export const PRIORITY_RANK = sql`case ${tasks.priority} when 'URGENT' then 4 when 'HIGH' then 3 when 'MEDIUM' then 2 else 1 end`;

