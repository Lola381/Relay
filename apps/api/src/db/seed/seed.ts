// Idempotent demo seed: wipes all app data and recreates it in one transaction.
// Activity and notifications follow the same rules the API will apply (actor never notified,
// mentions replace COMMENT_ADDED, inactive users get nothing), so the demo looks like real usage.
import { sql } from 'drizzle-orm';
import { formatMention, type ActivityAction, type NotificationType, type TaskStatus } from '@pm/shared';
import type { Db, Tx } from '../client';
import {
  activityLogs,
  commentMentions,
  comments,
  notifications,
  projectMembers,
  projects,
  tasks,
  users,
} from '../schema';
import { hashPassword } from '../../lib/password';
import {
  COMMENTS,
  DEMO_PASSWORD,
  PROJECTS,
  TASKS,
  USERS,
  type ProjectKey,
  type UserKey,
} from './fixtures';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
/** A moment in the past. The minute offset keeps same-day events in a stable order. */
const ago = (days: number, minutes = 0) => new Date(now - days * DAY + minutes * 60_000);
/** ISO calendar date (UTC, matching the server's overdue rule) `days` from today. */
const isoDate = (days: number) => new Date(now + days * DAY).toISOString().slice(0, 10);
/** Notifications older than this count as already read. */
const READ_AFTER_DAYS = 3;

type ActivityInsert = typeof activityLogs.$inferInsert;
type NotificationInsert = typeof notifications.$inferInsert;

export async function seed(db: Db): Promise<string> {
  const passwordHash = await hashPassword(DEMO_PASSWORD); // hashed once, shared by all demo users

  return db.transaction(async (tx) => {
    await wipe(tx);

    // ── Users ──
    const userIds = {} as Record<UserKey, string>;
    const userNames = {} as Record<UserKey, string>;
    const deactivatedAt = {} as Partial<Record<UserKey, Date>>;
    const activity: ActivityInsert[] = [];
    const notes: NotificationInsert[] = [];

    for (const fixture of USERS) {
      const [row] = await tx
        .insert(users)
        .values({
          name: fixture.name,
          email: fixture.email,
          passwordHash,
          role: fixture.role,
          createdAt: ago(90),
          updatedAt: ago(90),
        })
        .returning({ id: users.id });
      userIds[fixture.key] = row!.id;
      userNames[fixture.key] = fixture.name;
    }

    for (const fixture of USERS) {
      activity.push({
        userId: fixture.key === 'admin' ? null : userIds.admin, // the first admin is created by the system
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: userIds[fixture.key],
        metadata: { userName: fixture.name, email: fixture.email, role: fixture.role },
        createdAt: ago(90),
      });
    }

    /** Queues a notification unless it would go to the actor or to a user inactive at that time. */
    const notify = (
      recipient: UserKey,
      actor: UserKey,
      type: NotificationType,
      at: Date,
      target: { projectId: string; entityType: 'PROJECT' | 'TASK'; entityId: string },
      metadata: Record<string, unknown>,
    ) => {
      if (recipient === actor) return;
      const inactiveSince = deactivatedAt[recipient];
      if (inactiveSince && inactiveSince <= at) return;
      const isOld = now - at.getTime() > READ_AFTER_DAYS * DAY;
      notes.push({
        recipientId: userIds[recipient],
        actorId: userIds[actor],
        type,
        ...target,
        metadata: { actorName: userNames[actor], ...metadata },
        readAt: isOld ? new Date(at.getTime() + HOUR) : null,
        createdAt: at,
      });
    };

    // Deactivations happen "after" everything else they would affect, but the timestamps are
    // needed up front so notifications created after that point are skipped.
    for (const fixture of USERS) {
      if (fixture.deactivatedDaysAgo !== undefined) {
        deactivatedAt[fixture.key] = ago(fixture.deactivatedDaysAgo);
      }
    }

    // ── Projects + members ──
    const projectIds = {} as Record<ProjectKey, string>;
    const projectNames = {} as Record<ProjectKey, string>;

    for (const fixture of PROJECTS) {
      const createdAt = ago(fixture.createdDaysAgo);
      const archivedAt = fixture.archivedDaysAgo !== undefined ? ago(fixture.archivedDaysAgo) : null;
      const [row] = await tx
        .insert(projects)
        .values({
          name: fixture.name,
          description: fixture.description,
          status: archivedAt ? 'ARCHIVED' : 'ACTIVE',
          version: archivedAt ? 2 : 1,
          createdBy: userIds.admin,
          archivedAt,
          archivedBy: archivedAt ? userIds.admin : null,
          createdAt,
          updatedAt: archivedAt ?? createdAt,
        })
        .returning({ id: projects.id });
      const projectId = row!.id;
      projectIds[fixture.key] = projectId;
      projectNames[fixture.key] = fixture.name;

      activity.push({
        userId: userIds.admin,
        projectId,
        action: 'PROJECT_CREATED',
        entityType: 'PROJECT',
        entityId: projectId,
        metadata: { projectName: fixture.name },
        createdAt,
      });

      for (const [index, member] of fixture.members.entries()) {
        // The Admin assigns managers; the manager then builds the team
        const addedBy: UserKey = member.role === 'MANAGER' ? 'admin' : 'pm';
        const addedAt = ago(fixture.createdDaysAgo, 10 + index);
        await tx.insert(projectMembers).values({
          projectId,
          userId: userIds[member.user],
          role: member.role,
          addedBy: userIds[addedBy],
          createdAt: addedAt,
          updatedAt: addedAt,
        });
        activity.push({
          userId: userIds[addedBy],
          projectId,
          action: 'MEMBER_ADDED',
          entityType: 'MEMBER',
          entityId: userIds[member.user],
          metadata: { userName: userNames[member.user], role: member.role },
          createdAt: addedAt,
        });
        notify(
          member.user,
          addedBy,
          'PROJECT_MEMBER_ADDED',
          addedAt,
          { projectId, entityType: 'PROJECT', entityId: projectId },
          { projectName: fixture.name, role: member.role },
        );
      }

      if (archivedAt) {
        activity.push({
          userId: userIds.admin,
          projectId,
          action: 'PROJECT_ARCHIVED',
          entityType: 'PROJECT',
          entityId: projectId,
          metadata: { projectName: fixture.name },
          createdAt: archivedAt,
        });
      }
    }

    // ── Tasks (created by the PM; status changes made by the assignee) ──
    const taskIds: Record<string, string> = {};
    const taskInfo: Record<string, { title: string; project: ProjectKey; assignee?: UserKey }> = {};

    for (const fixture of TASKS) {
      const projectId = projectIds[fixture.project];
      const createdAt = ago(fixture.createdDaysAgo);
      const transitions = fixture.transitions ?? [];
      const last = transitions.at(-1);
      const status: TaskStatus = last?.to ?? 'TODO';
      const mover: UserKey = fixture.assignee ?? 'pm';
      const lastChangeAt = last ? ago(last.daysAgo) : createdAt;

      const [row] = await tx
        .insert(tasks)
        .values({
          projectId,
          title: fixture.title,
          description: fixture.description ?? null,
          status,
          priority: fixture.priority,
          assigneeId: fixture.assignee ? userIds[fixture.assignee] : null,
          dueDate: fixture.dueInDays !== undefined ? isoDate(fixture.dueInDays) : null,
          completedAt: status === 'DONE' ? lastChangeAt : null,
          version: 1 + transitions.length, // every status change bumped the version
          createdBy: userIds.pm,
          updatedBy: last ? userIds[mover] : userIds.pm,
          createdAt,
          updatedAt: lastChangeAt,
        })
        .returning({ id: tasks.id });
      const taskId = row!.id;
      taskIds[fixture.ref] = taskId;
      taskInfo[fixture.ref] = { title: fixture.title, project: fixture.project, assignee: fixture.assignee };
      const target = { projectId, entityType: 'TASK' as const, entityId: taskId };
      const taskMeta = { taskTitle: fixture.title, projectName: projectNames[fixture.project] };

      const log = (action: ActivityAction, actor: UserKey, at: Date, metadata: Record<string, unknown>) =>
        activity.push({
          userId: userIds[actor],
          projectId,
          action,
          entityType: 'TASK',
          entityId: taskId,
          metadata: { taskTitle: fixture.title, ...metadata },
          createdAt: at,
        });

      log('TASK_CREATED', 'pm', createdAt, { priority: fixture.priority });

      if (fixture.assignee) {
        const assignedAt = ago(fixture.createdDaysAgo, 1);
        log('TASK_ASSIGNED', 'pm', assignedAt, {
          assigneeId: userIds[fixture.assignee],
          assigneeName: userNames[fixture.assignee],
          previousAssigneeId: null,
        });
        notify(fixture.assignee, 'pm', 'TASK_ASSIGNED', assignedAt, target, taskMeta);
      }

      let from: TaskStatus = 'TODO';
      for (const step of transitions) {
        const at = ago(step.daysAgo);
        log('TASK_STATUS_CHANGED', mover, at, { from, to: step.to });
        // Assignee + creator hear about status changes (creator is always the PM here)
        notify('pm', mover, 'TASK_STATUS_CHANGED', at, target, { ...taskMeta, from, to: step.to });
        from = step.to;
      }
    }

    // ── Comments with mentions ──
    const commenters: Record<string, Set<UserKey>> = {};

    for (const fixture of COMMENTS) {
      const info = taskInfo[fixture.task]!;
      const taskId = taskIds[fixture.task]!;
      const projectId = projectIds[info.project];
      const at = new Date(now - fixture.hoursAgo * HOUR);

      const mentioned: UserKey[] = [];
      const body = fixture.body.replace(/\{(\w+)\}/g, (_, key: UserKey) => {
        mentioned.push(key);
        return formatMention(userNames[key], userIds[key]);
      });

      const [row] = await tx
        .insert(comments)
        .values({ taskId, projectId, authorId: userIds[fixture.author], body, createdAt: at })
        .returning({ id: comments.id });
      const commentId = row!.id;

      if (mentioned.length) {
        await tx
          .insert(commentMentions)
          .values(mentioned.map((key) => ({ commentId, userId: userIds[key] })));
      }

      const excerpt = fixture.body.replace(/\{(\w+)\}/g, (_, key: UserKey) => `@${userNames[key]}`).slice(0, 120);
      activity.push({
        userId: userIds[fixture.author],
        projectId,
        action: 'COMMENT_ADDED',
        entityType: 'COMMENT',
        entityId: commentId,
        metadata: { taskId, taskTitle: info.title, excerpt },
        createdAt: at,
      });

      // Recipients: mentioned → MENTIONED; assignee, creator and earlier commenters → COMMENT_ADDED
      const target = { projectId, entityType: 'TASK' as const, entityId: taskId };
      const meta = { taskTitle: info.title, projectName: projectNames[info.project], commentId, excerpt };
      const others = new Set<UserKey>(['pm', ...(info.assignee ? [info.assignee] : [])]);
      for (const key of commenters[fixture.task] ?? []) others.add(key);

      for (const key of mentioned) notify(key, fixture.author, 'MENTIONED', at, target, meta);
      for (const key of others) {
        if (!mentioned.includes(key)) notify(key, fixture.author, 'COMMENT_ADDED', at, target, meta);
      }
      (commenters[fixture.task] ??= new Set()).add(fixture.author);
    }

    // ── Deactivations (after the history they took part in) ──
    for (const fixture of USERS) {
      const at = deactivatedAt[fixture.key];
      if (!at) continue;
      await tx
        .update(users)
        .set({ isActive: false, deactivatedAt: at, deactivatedBy: userIds.admin, updatedAt: at })
        .where(sql`${users.id} = ${userIds[fixture.key]}`);
      activity.push({
        userId: userIds.admin,
        action: 'USER_DEACTIVATED',
        entityType: 'USER',
        entityId: userIds[fixture.key],
        metadata: { userName: fixture.name },
        createdAt: at,
      });
    }

    await tx.insert(activityLogs).values(activity);
    if (notes.length) await tx.insert(notifications).values(notes);

    return [
      `${USERS.length} users`,
      `${PROJECTS.length} projects`,
      `${TASKS.length} tasks`,
      `${COMMENTS.length} comments`,
      `${notes.length} notifications`,
      `${activity.length} activity entries`,
    ].join(', ');
  });
}

/** Removes all app data (keeps the schema). Order doesn't matter with CASCADE. */
async function wipe(tx: Tx) {
  await tx.execute(sql`
    TRUNCATE activity_logs, notifications, comment_mentions, comments, tasks,
             project_members, projects, refresh_tokens, users
    RESTART IDENTITY CASCADE
  `);
}
