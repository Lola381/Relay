import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { AuthUser, Paginated, SystemRole, UserSummary } from '@pm/shared';
import { assertSystemCan } from '../../access/assert';
import { db } from '../../db/client';
import { projectMembers, users } from '../../db/schema';
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
