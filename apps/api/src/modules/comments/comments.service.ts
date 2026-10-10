import { and, asc, eq, inArray } from 'drizzle-orm';
import { extractMentionIds, type AuthUser, type Comment, type Paginated } from '@pm/shared';
import { assertProjectCan } from '../../access/assert';
import { loadProjectAccess } from '../../access/projectAccess';
import { db, type Db, type Tx } from '../../db/client';
import { commentMentions, comments, projectMembers, tasks, users } from '../../db/schema';
import { logActivity } from '../../domain/activity';
import { notify } from '../../domain/notify';
import { AppError, notFound } from '../../lib/errors';
import { pageMeta, toLimitOffset } from '../../lib/pagination';
import { withTransaction } from '../../lib/tx';
import { accessForTask } from '../tasks/tasks.service';

/** Comments as DTOs, with author and resolved mentions. */
async function commentDtos(executor: Db | Tx, ids: string[]): Promise<Comment[]> {
  if (ids.length === 0) return [];
  const rows = await executor
    .select({
      comment: comments,
      author: { id: users.id, name: users.name, avatarUrl: users.avatarUrl, isActive: users.isActive },
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(inArray(comments.id, ids))
    .orderBy(asc(comments.createdAt), asc(comments.id));
  const mentions = await executor
    .select({ commentId: commentMentions.commentId, id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(commentMentions)
    .innerJoin(users, eq(users.id, commentMentions.userId))
    .where(inArray(commentMentions.commentId, ids));

  return rows.map((r) => ({
    id: r.comment.id,
    taskId: r.comment.taskId,
    projectId: r.comment.projectId,
    author: r.author,
    body: r.comment.body,
    mentions: mentions
      .filter((m) => m.commentId === r.comment.id)
      .map(({ id, name, avatarUrl }) => ({ id, name, avatarUrl })),
    createdAt: r.comment.createdAt.toISOString(),
  }));
}

export async function listComments(
  user: AuthUser,
  taskId: string,
  query: { page: number; pageSize: number },
): Promise<Paginated<Comment>> {
  const access = await accessForTask(db, user, taskId);
  assertProjectCan(access, 'project.view');
  const where = eq(comments.taskId, taskId);
  const { limit, offset } = toLimitOffset(query);
  const [ids, total] = await Promise.all([
    db
      .select({ id: comments.id })
      .from(comments)
      .where(where)
      .orderBy(asc(comments.createdAt), asc(comments.id))
      .limit(limit)
      .offset(offset),
    db.$count(comments, where),
  ]);
  return { data: await commentDtos(db, ids.map((r) => r.id)), meta: pageMeta(query, total) };
}

export async function createComment(user: AuthUser, taskId: string, input: { body: string }): Promise<Comment> {
  return withTransaction(async (tx, emit) => {
    const access = await accessForTask(tx, user, taskId, 'share');
    assertProjectCan(access, 'comment.create');
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw notFound('Task not found.');

    // Only people in this project can be mentioned; other tokens stay as plain text
    const mentionIds = extractMentionIds(input.body);
    const mentioned = mentionIds.length
      ? await tx
          .select({ userId: projectMembers.userId })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, task.projectId), inArray(projectMembers.userId, mentionIds)))
      : [];

    const [row] = await tx
      .insert(comments)
      .values({ taskId, projectId: task.projectId, authorId: user.id, body: input.body })
      .returning();
    if (mentioned.length) {
      await tx.insert(commentMentions).values(mentioned.map((m) => ({ commentId: row!.id, userId: m.userId })));
    }

    const excerpt = input.body.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').slice(0, 140);
    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: task.projectId,
      action: 'COMMENT_ADDED',
      entityType: 'COMMENT',
      entityId: row!.id,
      metadata: { taskId, taskTitle: task.title, excerpt },
    });
    await notify(tx, emit, {
      actorId: user.id,
      recipients: [
        ...mentioned.map((m) => ({ userId: m.userId, type: 'MENTIONED' as const })),
        ...(task.assigneeId ? [{ userId: task.assigneeId, type: 'COMMENT_ADDED' as const }] : []),
      ],
      projectId: task.projectId,
      entityType: 'TASK',
      entityId: taskId,
      metadata: { taskTitle: task.title, projectName: access.project.name, excerpt },
    });

    const [dto] = await commentDtos(tx, [row!.id]);
    emit({ type: 'comment.created', projectId: task.projectId, actorId: user.id, data: dto });
    return dto!;
  });
}

export async function deleteComment(user: AuthUser, commentId: string): Promise<void> {
  await withTransaction(async (tx, emit) => {
    const [found] = await tx.select().from(comments).where(eq(comments.id, commentId));
    if (!found) throw notFound('Comment not found.');
    let access;
    try {
      access = await loadProjectAccess(tx, found.projectId, user, 'share');
    } catch (err) {
      if (err instanceof AppError && err.status === 404) throw notFound('Comment not found.');
      throw err;
    }
    assertProjectCan(access, 'comment.delete', { authorId: found.authorId });
    const [task] = await tx.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, found.taskId));
    await tx.delete(comments).where(eq(comments.id, commentId));
    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: found.projectId,
      action: 'COMMENT_DELETED',
      entityType: 'COMMENT',
      entityId: commentId,
      metadata: { taskId: found.taskId, taskTitle: task?.title ?? null },
    });
    emit({
      type: 'comment.deleted',
      projectId: found.projectId,
      actorId: user.id,
      data: { id: commentId, taskId: found.taskId },
    });
  });
}
