import { and, asc, desc, eq, ilike, inArray, ne, sql, type SQL } from 'drizzle-orm';
import {
  canHoldProjectRole,
  ERROR_CODES,
  type AuthUser,
  type Paginated,
  type Project,
  type PROJECT_SORTS,
  type ProjectStatus,
} from '@pm/shared';
import { assertProjectCan, assertSystemCan } from '../../access/assert';
import { loadProjectAccess } from '../../access/projectAccess';
import { db, type Tx } from '../../db/client';
import { comments, projectMembers, projects, tasks, users } from '../../db/schema';
import { logActivity } from '../../domain/activity';
import { notify } from '../../domain/notify';
import { AppError, badRequest, conflict } from '../../lib/errors';
import { likePattern, pageMeta, toLimitOffset } from '../../lib/pagination';
import { withTransaction } from '../../lib/tx';
import { toProjectDto, toProjectDtos } from './projects.dto';

const systemActor = (user: AuthUser) => ({ userId: user.id, systemRole: user.role });

// ── Queries ──

const SORT_COLUMNS = { name: projects.name, createdAt: projects.createdAt, updatedAt: projects.updatedAt };

export interface ProjectListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** For the "6 active · 2 archived" header (respects visibility and search, not the status filter). */
  statusCounts: Record<ProjectStatus, number>;
}

export async function listProjects(
  user: AuthUser,
  query: {
    page: number;
    pageSize: number;
    status: ProjectStatus | 'ALL';
    search?: string;
    sort: (typeof PROJECT_SORTS)[number];
  },
): Promise<Paginated<Project> & { meta: ProjectListMeta }> {
  // Admins see every project; everyone else only projects they belong to
  const visible: SQL | undefined =
    user.role === 'ADMIN'
      ? undefined
      : sql`exists (select 1 from ${projectMembers} where ${projectMembers.projectId} = ${projects.id} and ${projectMembers.userId} = ${user.id})`;
  const searched = query.search ? ilike(projects.name, likePattern(query.search)) : undefined;
  const where = and(visible, searched, query.status === 'ALL' ? undefined : eq(projects.status, query.status));

  const descending = query.sort.startsWith('-');
  const column = SORT_COLUMNS[query.sort.replace('-', '') as keyof typeof SORT_COLUMNS];
  const { limit, offset } = toLimitOffset(query);

  const [rows, statusRows] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(where)
      .orderBy(descending ? desc(column) : asc(column), asc(projects.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ status: projects.status, count: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(visible, searched))
      .groupBy(projects.status),
  ]);

  const statusCounts = { ACTIVE: 0, ARCHIVED: 0 };
  for (const r of statusRows) statusCounts[r.status] = r.count;
  const total = query.status === 'ALL' ? statusCounts.ACTIVE + statusCounts.ARCHIVED : statusCounts[query.status];

  return {
    data: await toProjectDtos(db, rows, user),
    meta: { ...pageMeta(query, total), statusCounts },
  };
}

export async function getProject(user: AuthUser, projectId: string): Promise<Project> {
  const access = await loadProjectAccess(db, projectId, user);
  assertProjectCan(access, 'project.view');
  return toProjectDto(db, access.project, user);
}

// ── Commands ──

/** Friendly pre-check; the partial unique index is the race-proof backstop (→ 409 via dbErrors). */
async function assertNameFree(tx: Tx, name: string, exceptId?: string) {
  const clash = await tx.query.projects.findFirst({
    where: and(
      sql`lower(${projects.name}) = lower(${name})`,
      eq(projects.status, 'ACTIVE'),
      exceptId ? ne(projects.id, exceptId) : undefined,
    ),
    columns: { id: true },
  });
  if (clash) {
    throw new AppError(409, ERROR_CODES.PROJECT_NAME_TAKEN, 'A project with this name already exists.', [
      { path: 'name', message: 'A project with this name already exists.' },
    ]);
  }
}

export async function createProject(
  user: AuthUser,
  input: { name: string; description: string | null; managerIds: string[] },
): Promise<Project> {
  assertSystemCan(systemActor(user), 'project.create');

  return withTransaction(async (tx, emit) => {
    // Managers must exist, be active, and be allowed to hold the MANAGER role
    const candidates = input.managerIds.length
      ? await tx.query.users.findMany({ where: inArray(users.id, input.managerIds) })
      : [];
    for (const id of input.managerIds) {
      const manager = candidates.find((u) => u.id === id);
      if (!manager) throw badRequest('A selected manager no longer exists.', [{ path: 'managerIds', message: 'Unknown user.' }]);
      if (!manager.isActive) {
        throw new AppError(400, ERROR_CODES.USER_INACTIVE, `${manager.name} is deactivated.`);
      }
      if (!canHoldProjectRole(manager.role, 'MANAGER')) {
        throw new AppError(400, ERROR_CODES.ROLE_EXCEEDS_SYSTEM_ROLE, `${manager.name} can't be a project manager.`);
      }
    }
    await assertNameFree(tx, input.name);

    const [project] = await tx
      .insert(projects)
      .values({ name: input.name, description: input.description, createdBy: user.id, updatedBy: user.id })
      .returning();

    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: project!.id,
      action: 'PROJECT_CREATED',
      entityType: 'PROJECT',
      entityId: project!.id,
      metadata: { projectName: project!.name },
    });

    for (const manager of candidates) {
      await tx.insert(projectMembers).values({ projectId: project!.id, userId: manager.id, role: 'MANAGER', addedBy: user.id });
      await logActivity(tx, emit, {
        actorId: user.id,
        projectId: project!.id,
        action: 'MEMBER_ADDED',
        entityType: 'MEMBER',
        entityId: manager.id,
        metadata: { userName: manager.name, role: 'MANAGER' },
      });
    }
    await notify(tx, emit, {
      actorId: user.id,
      recipients: candidates.map((m) => ({ userId: m.id, type: 'PROJECT_MEMBER_ADDED' })),
      projectId: project!.id,
      entityType: 'PROJECT',
      entityId: project!.id,
      metadata: { projectName: project!.name, role: 'MANAGER' },
    });

    const dto = await toProjectDto(tx, project!, user);
    emit({ type: 'project.created', projectId: project!.id, actorId: user.id, data: dto });
    return dto;
  });
}

export async function updateProject(
  user: AuthUser,
  projectId: string,
  input: { version: number; name?: string; description?: string | null },
): Promise<Project> {
  return withTransaction(async (tx, emit) => {
    const { project, ...access } = await loadProjectAccess(tx, projectId, user, 'update');
    assertProjectCan({ project, ...access }, 'project.update');

    // The row is locked FOR UPDATE, so this comparison can't race with another writer
    if (input.version !== project.version) {
      const editor = await tx.query.users.findFirst({ where: eq(users.id, project.updatedBy), columns: { name: true } });
      throw new AppError(
        409,
        ERROR_CODES.VERSION_CONFLICT,
        `${editor?.name ?? 'Someone'} updated this project while you were editing.`,
        { yourVersion: input.version, currentVersion: project.version, current: await toProjectDto(tx, project, user) },
      );
    }

    const changes: Record<string, [unknown, unknown]> = {};
    if (input.name !== undefined && input.name !== project.name) changes.name = [project.name, input.name];
    if (input.description !== undefined && input.description !== project.description) {
      changes.description = [project.description, input.description];
    }
    if (Object.keys(changes).length === 0) return toProjectDto(tx, project, user); // no-op: no version bump

    if (changes.name && project.status === 'ACTIVE') await assertNameFree(tx, input.name!, project.id);

    const [updated] = await tx
      .update(projects)
      .set({
        ...(changes.name ? { name: input.name } : {}),
        ...(changes.description ? { description: input.description } : {}),
        version: sql`${projects.version} + 1`,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, project.id))
      .returning();

    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: project.id,
      action: 'PROJECT_UPDATED',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: {
        projectName: updated!.name,
        ...(changes.name ? { name: changes.name } : {}),
        ...(changes.description ? { descriptionChanged: true } : {}),
      },
    });

    const dto = await toProjectDto(tx, updated!, user);
    emit({ type: 'project.updated', projectId: project.id, actorId: user.id, data: dto });
    return dto;
  });
}

export async function setArchived(user: AuthUser, projectId: string, archive: boolean): Promise<Project> {
  assertSystemCan(systemActor(user), 'project.archive');

  return withTransaction(async (tx, emit) => {
    const { project } = await loadProjectAccess(tx, projectId, user, 'update');

    if (archive && project.status === 'ARCHIVED') {
      throw conflict('This project is already archived.', ERROR_CODES.ALREADY_ARCHIVED);
    }
    if (!archive && project.status === 'ACTIVE') {
      throw conflict('This project is not archived.', ERROR_CODES.NOT_ARCHIVED);
    }
    // Unarchiving can clash with an active project created meanwhile (DATA_MODEL P2)
    if (!archive) await assertNameFree(tx, project.name, project.id);

    const now = new Date();
    const [updated] = await tx
      .update(projects)
      .set({
        status: archive ? 'ARCHIVED' : 'ACTIVE',
        archivedAt: archive ? now : null,
        archivedBy: archive ? user.id : null,
        version: sql`${projects.version} + 1`,
        updatedBy: user.id,
        updatedAt: now,
      })
      .where(eq(projects.id, project.id))
      .returning();

    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: project.id,
      action: archive ? 'PROJECT_ARCHIVED' : 'PROJECT_UNARCHIVED',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: { projectName: project.name },
    });

    const dto = await toProjectDto(tx, updated!, user);
    emit({ type: archive ? 'project.archived' : 'project.unarchived', projectId: project.id, actorId: user.id, data: dto });
    return dto;
  });
}

export async function deleteProject(user: AuthUser, projectId: string): Promise<void> {
  assertSystemCan(systemActor(user), 'project.delete');

  await withTransaction(async (tx, emit) => {
    const { project } = await loadProjectAccess(tx, projectId, user, 'update');

    const [members, taskCount, commentCount] = await Promise.all([
      tx.select({ userId: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, project.id)),
      tx.$count(tasks, eq(tasks.projectId, project.id)),
      tx.$count(comments, eq(comments.projectId, project.id)),
    ]);

    // Cascades to members, tasks, comments, mentions, notifications and project activity
    await tx.delete(projects).where(eq(projects.id, project.id));

    // Permanent record in the system feed (project_id NULL, so it isn't cascaded away)
    await logActivity(tx, emit, {
      actorId: user.id,
      projectId: null,
      action: 'PROJECT_DELETED',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: {
        projectId: project.id,
        projectName: project.name,
        taskCount,
        commentCount,
        memberCount: members.length,
      },
    });

    // Membership is gone, so name the former members explicitly
    emit({
      type: 'project.deleted',
      userIds: members.map((m) => m.userId),
      actorId: user.id,
      data: { id: project.id, name: project.name },
    });
  });
}
