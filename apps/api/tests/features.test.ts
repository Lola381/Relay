import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { formatMention } from '@pm/shared';
import { db } from '../src/db/client';
import { notifications, refreshTokens, tasks, users } from '../src/db/schema';
import { api, app, bearer, DEMO, loginAs, projectByName, resetDatabase, userByEmail } from './helpers';

// Comments, notifications, activity, user management, sign-up, /me, /dashboard and the SSE stream.

beforeEach(resetDatabase);

const V1 = '/api/v1';
const as = async (who: Parameters<typeof bearer>[0]) => ({ Authorization: await bearer(who) });

/** An open Website Revamp task assigned to `email`. */
async function taskOf(email: string) {
  const user = await userByEmail(email);
  const [task] = await db.select().from(tasks).where(eq(tasks.assigneeId, user.id));
  return task!;
}

describe('comments', () => {
  it('a member comments; @mentions notify the mentioned person and the assignee', async () => {
    const task = await taskOf(DEMO.alice);
    const bob = await userByEmail(DEMO.bob);
    const res = await api()
      .post(`${V1}/tasks/${task.id}/comments`)
      .set(await as('pm'))
      .send({ body: `Please pair on this ${formatMention(bob.name, bob.id)}` });
    expect(res.status).toBe(201);
    expect(res.body.data.mentions.map((m: { id: string }) => m.id)).toEqual([bob.id]);

    const types = await db
      .select({ recipientId: notifications.recipientId, type: notifications.type })
      .from(notifications)
      .where(eq(notifications.entityId, task.id));
    expect(types).toEqual(
      expect.arrayContaining([
        { recipientId: bob.id, type: 'MENTIONED' },
        { recipientId: task.assigneeId, type: 'COMMENT_ADDED' },
      ]),
    );

    const list = await api().get(`${V1}/tasks/${task.id}/comments`).set(await as('viewer'));
    expect(list.status).toBe(200);
    expect(list.body.data.some((c: { id: string }) => c.id === res.body.data.id)).toBe(true);
  });

  it('mentioning someone outside the project creates no mention', async () => {
    const task = await taskOf(DEMO.alice);
    const outsider = await userByEmail(DEMO.admin); // admin is not a project member row
    const res = await api()
      .post(`${V1}/tasks/${task.id}/comments`)
      .set(await as('pm'))
      .send({ body: `hi ${formatMention(outsider.name, outsider.id)}` });
    expect(res.body.data.mentions).toEqual([]);
  });

  it('viewers cannot comment (403); outsiders get 404; empty body is 400', async () => {
    const task = await taskOf(DEMO.alice);
    expect((await api().post(`${V1}/tasks/${task.id}/comments`).set(await as('viewer')).send({ body: 'x' })).status).toBe(403);
    const mobile = await projectByName('Mobile App');
    const [mobileTask] = (await db.select().from(tasks).where(eq(tasks.projectId, mobile.id))) as [typeof task];
    expect((await api().get(`${V1}/tasks/${mobileTask.id}/comments`).set(await as('carol'))).status).toBe(404);
    expect((await api().post(`${V1}/tasks/${task.id}/comments`).set(await as('alice')).send({ body: '   ' })).status).toBe(400);
  });

  it('authors delete their own comments, members cannot delete others\', managers can delete any', async () => {
    const task = await taskOf(DEMO.alice);
    const mine = await api().post(`${V1}/tasks/${task.id}/comments`).set(await as('alice')).send({ body: 'mine' });
    const pms = await api().post(`${V1}/tasks/${task.id}/comments`).set(await as('pm')).send({ body: 'pm' });
    expect((await api().delete(`${V1}/comments/${pms.body.data.id}`).set(await as('alice'))).status).toBe(403);
    expect((await api().delete(`${V1}/comments/${mine.body.data.id}`).set(await as('alice'))).status).toBe(204);
    const again = await api().post(`${V1}/tasks/${task.id}/comments`).set(await as('alice')).send({ body: 'again' });
    expect((await api().delete(`${V1}/comments/${again.body.data.id}`).set(await as('pm'))).status).toBe(204);
  });
});

describe('task history', () => {
  it("shows the task's own changes and its comments; outsiders get 404", async () => {
    const task = await taskOf(DEMO.alice);
    await api().patch(`${V1}/tasks/${task.id}/status`).set(await as('pm')).send({ version: task.version, status: 'IN_REVIEW' });
    await api().post(`${V1}/tasks/${task.id}/comments`).set(await as('alice')).send({ body: 'ready' });
    const res = await api().get(`${V1}/tasks/${task.id}/activity`).set(await as('viewer'));
    expect(res.status).toBe(200);
    const actions = res.body.data.map((a: { action: string }) => a.action);
    expect(actions.slice(0, 2)).toEqual(['COMMENT_ADDED', 'TASK_STATUS_CHANGED']);
    expect(res.body.data.every((a: { entityId: string; metadata: { taskId?: string } }) => a.entityId === task.id || a.metadata.taskId === task.id)).toBe(true);
    expect((await api().get(`${V1}/tasks/${task.id}/activity`).set(await as('admin'))).status).toBe(200);
    const mobile = await projectByName('Mobile App');
    const [other] = await db.select().from(tasks).where(eq(tasks.projectId, mobile.id));
    expect((await api().get(`${V1}/tasks/${other!.id}/activity`).set(await as('carol'))).status).toBe(404);
  });
});

describe('notifications', () => {
  it('lists only my own, with an unread count; mark one and mark all read', async () => {
    const alice = await userByEmail(DEMO.alice);
    const res = await api().get(`${V1}/notifications?pageSize=100`).set(await as('alice'));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const mine = await db.$count(notifications, eq(notifications.recipientId, alice.id));
    expect(res.body.meta.total).toBe(mine);

    const unreadBefore = res.body.unreadCount as number;
    const target = res.body.data.find((n: { readAt: string | null }) => n.readAt === null);
    expect((await api().post(`${V1}/notifications/${target.id}/read`).set(await as('alice'))).status).toBe(204);
    expect((await api().get(`${V1}/notifications`).set(await as('alice'))).body.unreadCount).toBe(unreadBefore - 1);

    // Someone else's notification answers 404
    expect((await api().post(`${V1}/notifications/${target.id}/read`).set(await as('bob'))).status).toBe(404);

    // Toggle back to unread
    expect((await api().post(`${V1}/notifications/${target.id}/unread`).set(await as('alice'))).status).toBe(204);
    expect((await api().get(`${V1}/notifications`).set(await as('alice'))).body.unreadCount).toBe(unreadBefore);

    expect((await api().post(`${V1}/notifications/read-all`).set(await as('alice'))).status).toBe(204);
    expect((await api().get(`${V1}/notifications?unreadOnly=true`).set(await as('alice'))).body.data).toEqual([]);
  });
});

describe('activity', () => {
  it('project members see the project feed; outsiders get 404', async () => {
    const website = await projectByName('Website Revamp');
    const res = await api().get(`${V1}/projects/${website.id}/activity`).set(await as('viewer'));
    expect(res.status).toBe(200);
    expect(res.body.data.every((a: { projectId: string }) => a.projectId === website.id)).toBe(true);
    const mobile = await projectByName('Mobile App');
    expect((await api().get(`${V1}/projects/${mobile.id}/activity`).set(await as('carol'))).status).toBe(404);
  });

  it('the system feed is Admin-only', async () => {
    expect((await api().get(`${V1}/activity`).set(await as('admin'))).status).toBe(200);
    for (const who of ['pm', 'alice', 'viewer'] as const) {
      expect((await api().get(`${V1}/activity`).set(await as(who))).status).toBe(403);
    }
  });
});

describe('user management (Admin)', () => {
  const newUser = { name: 'Dana Test', email: 'dana@demo.com', password: 'Password123!', role: 'TEAM_MEMBER' };

  it('admin creates a user; duplicate email (any case) is 409; others get 403', async () => {
    const res = await api().post(`${V1}/users`).set(await as('admin')).send(newUser);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'dana@demo.com', role: 'TEAM_MEMBER', isActive: true });
    expect(res.body.data.passwordHash).toBeUndefined();
    const dup = await api().post(`${V1}/users`).set(await as('admin')).send({ ...newUser, email: 'DANA@demo.com' });
    expect(dup.status).toBe(409);
    expect((await api().post(`${V1}/users`).set(await as('pm')).send({ ...newUser, email: 'x@demo.com' })).status).toBe(403);
  });

  it('deactivating signs the user out everywhere; reactivating restores login', async () => {
    const bob = await userByEmail(DEMO.bob);
    await loginAs('bob');
    const off = await api().patch(`${V1}/users/${bob.id}`).set(await as('admin')).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data.isActive).toBe(false);
    expect(await db.$count(refreshTokens, and(eq(refreshTokens.userId, bob.id), isNull(refreshTokens.revokedAt)))).toBe(0);
    expect((await api().post(`${V1}/auth/login`).send({ email: DEMO.bob, password: 'Password123!' })).status).toBe(401);
    expect((await api().patch(`${V1}/users/${bob.id}`).set(await as('admin')).send({ isActive: true })).status).toBe(200);
    expect((await api().post(`${V1}/auth/login`).send({ email: DEMO.bob, password: 'Password123!' })).status).toBe(200);
  });

  it('cannot demote or deactivate yourself / the last admin', async () => {
    const admin = await userByEmail(DEMO.admin);
    expect((await api().patch(`${V1}/users/${admin.id}`).set(await as('admin')).send({ role: 'VIEWER' })).status).toBe(409);
    expect((await api().patch(`${V1}/users/${admin.id}`).set(await as('admin')).send({ isActive: false })).status).toBe(409);
  });

  it('a demotion that would break the role ceiling is refused', async () => {
    const pm = await userByEmail(DEMO.pm); // manages projects
    const res = await api().patch(`${V1}/users/${pm.id}`).set(await as('admin')).send({ role: 'TEAM_MEMBER' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROLE_EXCEEDS_SYSTEM_ROLE');
  });
});

describe('sign-up', () => {
  it('signs up as a non-admin role and is signed in immediately', async () => {
    const res = await api()
      .post(`${V1}/auth/register`)
      .send({ name: 'New Person', email: 'New.Person@Demo.com', password: 'Password123!', role: 'VIEWER' });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'new.person@demo.com', role: 'VIEWER' });
    expect(res.headers['set-cookie']?.toString()).toContain('pm_refresh=');
    const me = await api().get(`${V1}/me`).set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.body.data.email).toBe('new.person@demo.com');
  });

  it('cannot sign up as Admin (400) or with a taken email (409)', async () => {
    const admin = await api()
      .post(`${V1}/auth/register`)
      .send({ name: 'Mallory', email: 'mallory@demo.com', password: 'Password123!', role: 'ADMIN' });
    expect(admin.status).toBe(400);
    expect(await db.$count(users, eq(users.email, 'mallory@demo.com'))).toBe(0);
    const taken = await api()
      .post(`${V1}/auth/register`)
      .send({ name: 'Alice 2', email: 'ALICE@demo.com', password: 'Password123!', role: 'TEAM_MEMBER' });
    expect(taken.status).toBe(409);
  });
});

describe('/me', () => {
  it('updates my name but never my role', async () => {
    const res = await api().patch(`${V1}/me`).set(await as('carol')).send({ name: 'Carol D.' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Carol D.');
    expect((await api().patch(`${V1}/me`).set(await as('carol')).send({ role: 'ADMIN' })).status).toBe(400);
  });

  it('changing the password needs the current one and revokes my other sessions', async () => {
    const other = await loginAs('meera');
    const current = await loginAs('meera');
    const wrong = await api()
      .put(`${V1}/me/password`)
      .set('Authorization', `Bearer ${current.token}`)
      .send({ currentPassword: 'nope', newPassword: 'BrandNew123!' });
    expect(wrong.status).toBe(400);

    const ok = await api()
      .put(`${V1}/me/password`)
      .set('Authorization', `Bearer ${current.token}`)
      .set('Cookie', current.cookie)
      .send({ currentPassword: 'Password123!', newPassword: 'BrandNew123!' });
    expect(ok.status).toBe(204);
    expect((await api().post(`${V1}/auth/refresh`).set('Cookie', other.cookie)).status).toBe(401); // other session gone
    expect((await api().post(`${V1}/auth/refresh`).set('Cookie', current.cookie)).status).toBe(200); // this one kept
    expect((await api().post(`${V1}/auth/login`).send({ email: DEMO.meera, password: 'BrandNew123!' })).status).toBe(200);
  });
});

describe('/dashboard', () => {
  it('summarises my work; only admins get system counts', async () => {
    const alice = await api().get(`${V1}/dashboard`).set(await as('alice'));
    expect(alice.status).toBe(200);
    const aliceId = (await userByEmail(DEMO.alice)).id;
    const open = await db.$count(tasks, and(eq(tasks.assigneeId, aliceId)));
    const done = alice.body.data.myTasks.byStatus.DONE as number;
    expect(alice.body.data.myTasks.open + done).toBe(open);
    expect(alice.body.data.projects.map((p: { name: string }) => p.name).sort()).toEqual(['Legacy CRM', 'Website Revamp']);
    expect(alice.body.data.system).toBeUndefined();

    const admin = await api().get(`${V1}/dashboard`).set(await as('admin'));
    expect(admin.body.data.system.users).toBe(await db.$count(users));
    expect((await api().get(`${V1}/dashboard`)).status).toBe(401);
  });
});

describe('real-time stream (SSE)', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${V1}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  /** Opens a stream for `who` and collects the event types it receives. */
  async function connect(who: Parameters<typeof bearer>[0]) {
    const ticket = await api().post(`${V1}/events/ticket`).set(await as(who));
    expect(ticket.status).toBe(201);
    const controller = new AbortController();
    const received: string[] = [];
    const res = await fetch(`${base}/events?ticket=${ticket.body.data.ticket}`, { signal: controller.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    void (async () => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const m of decoder.decode(value).matchAll(/"type":"([a-z._]+)"/g)) received.push(m[1]!);
        }
      } catch {
        // aborted
      }
    })();
    return { received, close: () => controller.abort(), ticket: ticket.body.data.ticket as string };
  }

  it('needs a valid ticket, and each ticket works only once', async () => {
    expect((await fetch(`${base}/events?ticket=bogus`)).status).toBe(401);
    const stream = await connect('alice');
    expect((await fetch(`${base}/events?ticket=${stream.ticket}`)).status).toBe(401);
    stream.close();
  });

  it('project members receive task events; outsiders do not', async () => {
    // Alice and Carol are on Website Revamp but not on Mobile App
    const alice = await connect('alice');
    const carol = await connect('carol');
    const mobile = await projectByName('Mobile App');
    const created = await api().post(`${V1}/projects/${mobile.id}/tasks`).set(await as('pm')).send({ title: 'Mobile only' });
    expect(created.status).toBe(201);
    const task = await taskOf(DEMO.alice);
    await api().patch(`${V1}/tasks/${task.id}/status`).set(await as('pm')).send({ version: task.version, status: 'IN_REVIEW' });
    await new Promise((r) => setTimeout(r, 300));
    alice.close();
    carol.close();

    expect(alice.received).toContain('task.updated'); // her project
    expect(alice.received).not.toContain('task.created'); // Mobile App: not hers
    expect(carol.received).toContain('task.updated');
    expect(carol.received).not.toContain('task.created');
  });
});
