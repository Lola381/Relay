import { Router, type Request, type Response } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { listNotificationsQuerySchema, uuidParamSchema, type Notification, type NotificationPage } from '@pm/shared';
import { db } from '../../db/client';
import { notifications, users } from '../../db/schema';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { notFound } from '../../lib/errors';
import { publishCommitted } from '../../lib/events';
import { pageMeta, toLimitOffset } from '../../lib/pagination';
import { parse } from '../../lib/validation';

/** Mounted at /api/v1/notifications. Everyone only ever sees their own. */
export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const query = parse(listNotificationsQuerySchema, req.query);
  const mine = eq(notifications.recipientId, user.id);
  const unread = and(mine, isNull(notifications.readAt));
  const where = query.unreadOnly ? unread : mine;
  const { limit, offset } = toLimitOffset(query);

  const [rows, total, unreadCount] = await Promise.all([
    db
      .select({ n: notifications, actor: { id: users.id, name: users.name, avatarUrl: users.avatarUrl } })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit)
      .offset(offset),
    db.$count(notifications, where),
    db.$count(notifications, unread),
  ]);

  const data: Notification[] = rows.map(({ n, actor }) => ({
    id: n.id,
    type: n.type,
    actor: actor?.id ? actor : null,
    projectId: n.projectId,
    entityType: n.entityType,
    entityId: n.entityId,
    metadata: n.metadata,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
  res.json({ data, meta: pageMeta(query, total), unreadCount } satisfies NotificationPage);
});

notificationsRouter.post('/read-all', async (req, res) => {
  const user = currentUser(req);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, user.id), isNull(notifications.readAt)));
  // Keeps the badge in sync across the user's other tabs
  publishCommitted([{ type: 'notification.read', userIds: [user.id], data: { all: true } }]);
  res.status(204).end();
});

/** POST /:id/read and /:id/unread (the per-item toggle). */
const setRead = (read: boolean) => async (req: Request, res: Response) => {
  const user = currentUser(req);
  const { id } = parse(uuidParamSchema, req.params);
  const [row] = await db
    .update(notifications)
    .set({ readAt: read ? new Date() : null })
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, user.id)))
    .returning({ id: notifications.id });
  if (!row) throw notFound('Notification not found.');
  publishCommitted([{ type: 'notification.read', userIds: [user.id], data: { id } }]);
  res.status(204).end();
};
notificationsRouter.post('/:id/read', setRead(true));
notificationsRouter.post('/:id/unread', setRead(false));
