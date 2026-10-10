import { Router } from 'express';
import { desc, eq, type SQL } from 'drizzle-orm';
import { listActivityQuerySchema, uuidParamSchema, type ActivityEntry, type Paginated } from '@pm/shared';
import { assertProjectCan, assertSystemCan } from '../../access/assert';
import { loadProjectAccess } from '../../access/projectAccess';
import { db } from '../../db/client';
import { activityLogs, users } from '../../db/schema';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { pageMeta, toLimitOffset } from '../../lib/pagination';
import { parse } from '../../lib/validation';

async function feed(
  where: SQL | undefined,
  query: { page: number; pageSize: number },
): Promise<Paginated<ActivityEntry>> {
  const { limit, offset } = toLimitOffset(query);
  const [rows, total] = await Promise.all([
    db
      .select({ a: activityLogs, actor: { id: users.id, name: users.name, avatarUrl: users.avatarUrl } })
      .from(activityLogs)
      .leftJoin(users, eq(users.id, activityLogs.userId))
      .where(where)
      .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
      .limit(limit)
      .offset(offset),
    db.$count(activityLogs, where),
  ]);
  return {
    data: rows.map(({ a, actor }) => ({
      id: a.id,
      projectId: a.projectId,
      actor: actor?.id ? actor : null,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: a.metadata,
      createdAt: a.createdAt.toISOString(),
    })),
    meta: pageMeta(query, total),
  };
}

/** Mounted at /api/v1 */
export const activityRouter = Router();
activityRouter.use(authenticate);

activityRouter.get('/projects/:id/activity', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  const access = await loadProjectAccess(db, id, currentUser(req));
  assertProjectCan(access, 'activity.view');
  res.json(await feed(eq(activityLogs.projectId, id), parse(listActivityQuerySchema, req.query)));
});

/** System-wide feed (Admin): every project plus user management and deleted projects. */
activityRouter.get('/activity', async (req, res) => {
  const user = currentUser(req);
  assertSystemCan({ userId: user.id, systemRole: user.role }, 'activity.viewSystem');
  res.json(await feed(undefined, parse(listActivityQuerySchema, req.query)));
});
