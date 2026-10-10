import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { canHoldProjectRole, ERROR_CODES, type AuthUser, type Paginated, type SystemRole, type UserSummary } from '@pm/shared';
import { assertSystemCan } from '../../access/assert';
import { db } from '../../db/client';
import { projectMembers, refreshTokens, users, type UserRow } from '../../db/schema';
import { logActivity } from '../../domain/activity';
import { AppError, notFound } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { withTransaction } from '../../lib/tx';
import { likePattern, pageMeta, toLimitOffset } from '../../lib/pagination';

const SORT_COLUMNS = { name: users.name, createdAt: users.createdAt };

/**
 * The user directory behind the member / manager pickers (Admin + Project managers).
 * Project managers only ever see active users; full user management is Admin-only (Phase 8).
 */
export async function listUsers(
  viewer: AuthUser,
  query: {
    page: number;
    pageSize: number;
    search?: string;
    role?: SystemRole;
    roles?: SystemRole[];
    isActive?: boolean;
    notInProject?: string;
    sort: 'name' | '-name' | 'createdAt' | '-createdAt';
  },
): Promise<Paginated<UserSummary>> {
  assertSystemCan({ userId: viewer.id, systemRole: viewer.role }, 'user.list');

  const isActive = viewer.role === 'ADMIN' ? query.isActive : true;
  const where = and(
    query.search ? or(ilike(users.name, likePattern(query.search)), ilike(users.email, likePattern(query.search))) : undefined,
    query.role ? eq(users.role, query.role) : undefined,
    query.roles?.length ? inArray(users.role, query.roles) : undefined,
    isActive === undefined ? undefined : eq(users.isActive, isActive),
    query.notInProject
      ? sql`not exists (select 1 from ${projectMembers} where ${projectMembers.projectId} = ${query.notInProject} and ${projectMembers.userId} = ${users.id})`
      : undefined,
  );

  const descending = query.sort.startsWith('-');
  const column = SORT_COLUMNS[query.sort.replace('-', '') as keyof typeof SORT_COLUMNS];
  const { limit, offset } = toLimitOffset(query);

  const [rows, total] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
      })
      .from(users)
      .where(where)
      .orderBy(descending ? desc(column) : asc(column), asc(users.id))
      .limit(limit)
      .offset(offset),
    db.$count(users, where),
  ]);

  return { data: rows, meta: pageMeta(query, total) };
}

// ── User management (Admin) ──

type UserSummaryRow = Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'avatarUrl' | 'isActive'>;
const summary = ({ id, name, email, role, avatarUrl, isActive }: UserSummaryRow): UserSummary => ({
  id,
  name,
  email,
  role,
  avatarUrl,
  isActive,
});

export async function createUser(
  admin: AuthUser,
  input: { name: string; email: string; password: string; role: SystemRole },
): Promise<UserSummary> {
  assertSystemCan({ userId: admin.id, systemRole: admin.role }, 'user.manage');
  return insertUser(admin.id, input);
}

/** Public sign-up (POST /auth/register). The schema already rules out ADMIN. */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  role: Exclude<SystemRole, 'ADMIN'>;
}): Promise<UserSummary> {
  return insertUser(null, input);
}

async function insertUser(
  actorId: string | null,
  input: { name: string; email: string; password: string; role: SystemRole },
): Promise<UserSummary> {
  const passwordHash = await hashPassword(input.password);
  return withTransaction(async (tx, emit) => {
    const [taken] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
    if (taken) {
      throw new AppError(409, ERROR_CODES.EMAIL_TAKEN, 'An account with this email already exists.', [
        { path: 'email', message: 'An account with this email already exists.' },
      ]);
    }
    const [row] = await tx
      .insert(users)
      .values({ name: input.name, email: input.email, passwordHash, role: input.role })
      .returning();
    await logActivity(tx, emit, {
      actorId,
      projectId: null,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: row!.id,
      metadata: { userName: row!.name, role: row!.role, selfSignup: actorId === null },
    });
    emit({ type: 'user.created', actorId: actorId ?? undefined, data: { id: row!.id } });
    return summary(row!);
  });
}

export async function updateUser(
  admin: AuthUser,
  userId: string,
  input: { name?: string; role?: SystemRole; isActive?: boolean },
): Promise<UserSummary> {
  assertSystemCan({ userId: admin.id, systemRole: admin.role }, 'user.manage');
  return withTransaction(async (tx, emit) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
    if (!target) throw notFound('User not found.');

    if (userId === admin.id && (input.isActive === false || (input.role && input.role !== 'ADMIN'))) {
      throw new AppError(409, ERROR_CODES.LAST_ADMIN, 'You cannot deactivate or demote yourself.');
    }
    const losesAdmin = target.role === 'ADMIN' && target.isActive && (input.isActive === false || (input.role && input.role !== 'ADMIN'));
    if (losesAdmin) {
      const admins = await tx.$count(users, and(eq(users.role, 'ADMIN'), eq(users.isActive, true)));
      if (admins <= 1) throw new AppError(409, ERROR_CODES.LAST_ADMIN, 'There must always be at least one active administrator.');
    }
    if (input.role && input.role !== target.role) {
      // Role ceiling: a demoted user can't keep project roles above their new system role
      const held = await tx
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(eq(projectMembers.userId, userId));
      if (held.some((m) => !canHoldProjectRole(input.role!, m.role))) {
        throw new AppError(
          409,
          ERROR_CODES.ROLE_EXCEEDS_SYSTEM_ROLE,
          'This person holds project roles above the new system role. Change those project roles first.',
        );
      }
    }

    const deactivating = input.isActive === false && target.isActive;
    const activating = input.isActive === true && !target.isActive;
    const [row] = await tx
      .update(users)
      .set({
        name: input.name ?? target.name,
        role: input.role ?? target.role,
        ...(deactivating ? { isActive: false, deactivatedAt: new Date(), deactivatedBy: admin.id } : {}),
        ...(activating ? { isActive: true, deactivatedAt: null, deactivatedBy: null } : {}),
      })
      .where(eq(users.id, userId))
      .returning();

    // Deactivation signs them out everywhere
    if (deactivating) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    }

    await logActivity(tx, emit, {
      actorId: admin.id,
      projectId: null,
      action: deactivating ? 'USER_DEACTIVATED' : activating ? 'USER_ACTIVATED' : 'USER_UPDATED',
      entityType: 'USER',
      entityId: userId,
      metadata: { userName: row!.name, role: row!.role, previousRole: target.role },
    });
    emit({ type: 'user.updated', userIds: [userId], actorId: admin.id, data: { id: userId } });
    return summary(row!);
  });
}
