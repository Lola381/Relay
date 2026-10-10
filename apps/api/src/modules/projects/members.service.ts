import { and, eq } from 'drizzle-orm';
import {
  canHoldProjectRole,
  ERROR_CODES,
  type AuthUser,
  type Paginated,
  type ProjectMember,
  type ProjectRole,
} from '@pm/shared';
import { assertProjectCan } from '../../access/assert';
import { loadProjectAccess } from '../../access/projectAccess';
import { db, type Tx } from '../../db/client';
import { projectMembers, users } from '../../db/schema';
import { logActivity } from '../../domain/activity';
import { notify } from '../../domain/notify';
import { unassignMemberTasks } from '../../domain/unassign';
import { AppError, conflict, notFound } from '../../lib/errors';
import { pageMeta, toLimitOffset } from '../../lib/pagination';
import { withTransaction } from '../../lib/tx';
import { queryMembers } from './projects.dto';

const ROLE_NAMES: Record<ProjectRole, string> = { MANAGER: 'Manager', MEMBER: 'Member', VIEWER: 'Viewer' };

export async function listMembers(
  user: AuthUser,
  projectId: string,
  query: { page: number; pageSize: number; role?: ProjectRole },
): Promise<Paginated<ProjectMember>> {
  const access = await loadProjectAccess(db, projectId, user);
  assertProjectCan(access, 'project.view');

  const total = await db.$count(
    projectMembers,
    and(eq(projectMembers.projectId, projectId), query.role ? eq(projectMembers.role, query.role) : undefined),
  );
  const data = await queryMembers(db, projectId, { role: query.role, ...toLimitOffset(query) });
  return { data, meta: pageMeta(query, total) };
}

async function memberDto(tx: Tx, projectId: string, userId: string): Promise<ProjectMember> {
  const [dto] = await queryMembers(tx, projectId, { userId });
  return dto!;
}

async function findMembership(tx: Tx, projectId: string, userId: string) {
  const [membership] = await tx
    .select({ role: projectMembers.role, name: users.name })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  if (!membership) throw notFound('This person is not a member of the project.');
  return membership;
}

function assertRoleWithinCeiling(target: { name: string; role: AuthUser['role'] }, projectRole: ProjectRole) {
  if (!canHoldProjectRole(target.role, projectRole)) {
    throw new AppError(
      400,
      ERROR_CODES.ROLE_EXCEEDS_SYSTEM_ROLE,
      `${target.name} can't be a project ${ROLE_NAMES[projectRole].toLowerCase()} with their account type.`,
      [{ path: 'role', message: 'Role not allowed for this user.' }],
    );
  }
}

export async function addMember(
  user: AuthUser,
  projectId: string,
  input: { userId: string; role: ProjectRole },
): Promise<ProjectMember> {
  return withTransaction(async (tx, emit) => {
    const access = await loadProjectAccess(tx, projectId, user, 'share');
    assertProjectCan(access, 'member.add', { role: input.role });

    const target = await tx.query.users.findFirst({ where: eq(users.id, input.userId) });
    if (!target) throw notFound('User not found.');
    if (!target.isActive) {
      throw new AppError(400, ERROR_CODES.USER_INACTIVE, `${target.name} is deactivated and can't be added.`);
    }
    assertRoleWithinCeiling(target, input.role);

    const existing = await tx.query.projectMembers.findFirst({
      where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, target.id)),
      columns: { role: true },
    });
    if (existing) throw conflict(`${target.name} is already a member of this project.`, ERROR_CODES.ALREADY_MEMBER);

    await tx.insert(projectMembers).values({ projectId, userId: target.id, role: input.role, addedBy: user.id });

    const projectName = access.project.name;
    await logActivity(tx, emit, {
      actorId: user.id,
      projectId,
      action: 'MEMBER_ADDED',
      entityType: 'MEMBER',
      entityId: target.id,
      metadata: { userName: target.name, role: input.role },
    });
    await notify(tx, emit, {
      actorId: user.id,
      recipients: [{ userId: target.id, type: 'PROJECT_MEMBER_ADDED' }],
      projectId,
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: { projectName, role: input.role },
    });

    const dto = await memberDto(tx, projectId, target.id);
    emit({ type: 'member.added', projectId, userIds: [target.id], actorId: user.id, data: dto });
    return dto;
  });
}

export async function changeMemberRole(
  user: AuthUser,
  projectId: string,
  memberUserId: string,
  newRole: ProjectRole,
): Promise<ProjectMember> {
  return withTransaction(async (tx, emit) => {
    const access = await loadProjectAccess(tx, projectId, user, 'share');
    const membership = await findMembership(tx, projectId, memberUserId);
    assertProjectCan(access, 'member.changeRole', { currentRole: membership.role, newRole });

    if (membership.role === newRole) return memberDto(tx, projectId, memberUserId); // no-op

    const target = (await tx.query.users.findFirst({ where: eq(users.id, memberUserId) }))!;
    assertRoleWithinCeiling(target, newRole);

    // Viewers are read-only, so they can't keep open tasks (DATA_MODEL M5)
    const unassigned =
      newRole === 'VIEWER'
        ? await unassignMemberTasks(tx, emit, {
            projectId,
            userId: memberUserId,
            actorId: user.id,
            openOnly: true,
            userName: target.name,
          })
        : [];

    await tx
      .update(projectMembers)
      .set({ role: newRole, updatedAt: new Date() })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId)));

    await logActivity(tx, emit, {
      actorId: user.id,
      projectId,
      action: 'MEMBER_ROLE_CHANGED',
      entityType: 'MEMBER',
      entityId: memberUserId,
      metadata: {
        userName: target.name,
        from: membership.role,
        to: newRole,
        unassignedTaskIds: unassigned.map((t) => t.id),
      },
    });
    await notify(tx, emit, {
      actorId: user.id,
      recipients: [{ userId: memberUserId, type: 'PROJECT_ROLE_CHANGED' }],
      projectId,
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: { projectName: access.project.name, from: membership.role, to: newRole },
    });

    const dto = await memberDto(tx, projectId, memberUserId);
    emit({ type: 'member.role_changed', projectId, userIds: [memberUserId], actorId: user.id, data: dto });
    return dto;
  });
}

export async function removeMember(user: AuthUser, projectId: string, memberUserId: string): Promise<void> {
  await withTransaction(async (tx, emit) => {
    const access = await loadProjectAccess(tx, projectId, user, 'share');
    const membership = await findMembership(tx, projectId, memberUserId);
    assertProjectCan(access, 'member.remove', { currentRole: membership.role });

    // Explicitly (not via the FK's SET NULL) so versions bump and every change is logged
    const unassigned = await unassignMemberTasks(tx, emit, {
      projectId,
      userId: memberUserId,
      actorId: user.id,
      openOnly: false,
      userName: membership.name,
    });

    await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId)));

    await logActivity(tx, emit, {
      actorId: user.id,
      projectId,
      action: 'MEMBER_REMOVED',
      entityType: 'MEMBER',
      entityId: memberUserId,
      metadata: { userName: membership.name, role: membership.role, unassignedTaskIds: unassigned.map((t) => t.id) },
    });
    await notify(tx, emit, {
      actorId: user.id,
      recipients: [{ userId: memberUserId, type: 'PROJECT_MEMBER_REMOVED' }],
      projectId,
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: { projectName: access.project.name },
    });

    emit({
      type: 'member.removed',
      projectId,
      userIds: [memberUserId], // the removed user is no longer a project recipient
      actorId: user.id,
      data: { projectId, userId: memberUserId, projectName: access.project.name },
    });
  });
}
