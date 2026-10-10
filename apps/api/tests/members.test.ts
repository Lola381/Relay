import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { activityLogs, notifications, tasks } from '../src/db/schema';
import { onCommittedEvent, type AppEvent } from '../src/lib/events';
import { api, bearer, DEMO, projectByName, resetDatabase, userByEmail, type DemoUser } from './helpers';

const members = (projectId: string) => `/api/v1/projects/${projectId}/members`;

beforeEach(resetDatabase);

let events: AppEvent[] = [];
let stop: (() => void) | undefined;
beforeEach(() => {
  events = [];
  stop = onCommittedEvent((e) => events.push(e));
});
afterEach(() => stop?.());

const ids = async () => ({
  website: (await projectByName('Website Revamp')).id,
  mobile: (await projectByName('Mobile App')).id,
  crm: (await projectByName('Legacy CRM')).id,
  pm: (await userByEmail(DEMO.pm)).id,
  alice: (await userByEmail(DEMO.alice)).id,
  bob: (await userByEmail(DEMO.bob)).id,
  ishaan: (await userByEmail(DEMO.inactive)).id,
});

describe('GET /projects/:id/members', () => {
  it('every member (viewers too) sees the team, managers first, with open-task counts', async () => {
    const { website } = await ids();
    const res = await api().get(members(website)).set('Authorization', await bearer('viewer'));
    expect(res.status).toBe(200);
    expect(res.body.data.map((m: { role: string; user: { name: string } }) => `${m.role} ${m.user.name}`)).toEqual([
      'MANAGER Ravi Kumar',
      'MEMBER Alice Fernandes',
      'MEMBER Bob Mathew',
      'MEMBER Ishaan Verma',
      'VIEWER Vikram Rao',
    ]);
    const alice = res.body.data.find((m: { user: { name: string } }) => m.user.name === 'Alice Fernandes');
    expect(alice.openTaskCount).toBe(2);
    expect(res.body.data.find((m: { user: { name: string } }) => m.user.name === 'Ishaan Verma').user.isActive).toBe(false);
  });

  it('404 for outsiders', async () => {
    const { mobile } = await ids();
    expect((await api().get(members(mobile)).set('Authorization', await bearer('alice'))).status).toBe(404);
  });
});

describe('POST /projects/:id/members', () => {
  it('a manager adds a member: activity, notification, events', async () => {
    const { mobile, alice } = await ids();
    const res = await api().post(members(mobile)).set('Authorization', await bearer('pm')).send({ userId: alice, role: 'MEMBER' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ role: 'MEMBER', openTaskCount: 0, user: { id: alice, name: 'Alice Fernandes' } });
    expect(await db.$count(activityLogs, and(eq(activityLogs.action, 'MEMBER_ADDED'), eq(activityLogs.projectId, mobile)))).toBe(3);
    const [note] = await db.select().from(notifications).where(and(eq(notifications.recipientId, alice), eq(notifications.projectId, mobile)));
    expect(note).toMatchObject({ type: 'PROJECT_MEMBER_ADDED', metadata: expect.objectContaining({ projectName: 'Mobile App', role: 'MEMBER' }) });
    expect(events.find((e) => e.type === 'member.added')).toMatchObject({ projectId: mobile, userIds: [alice] });

    // The new member can see the project immediately
    expect((await api().get(`/api/v1/projects/${mobile}`).set('Authorization', await bearer('alice'))).status).toBe(200);
  });

  it('only admins can add a MANAGER', async () => {
    const { website } = await ids();
    // The admin user can hold MANAGER, so only the caller's permission is being tested here
    const res = await api()
      .post(members(website))
      .set('Authorization', await bearer('pm'))
      .send({ userId: (await userByEmail(DEMO.admin)).id, role: 'MANAGER' });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Only administrators can assign project managers.');
  });

  it('enforces the role ceiling (a team member cannot be a manager)', async () => {
    const { mobile, alice } = await ids();
    const res = await api().post(members(mobile)).set('Authorization', await bearer('admin')).send({ userId: alice, role: 'MANAGER' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ROLE_EXCEEDS_SYSTEM_ROLE');
  });

  it('409 when already a member; 400 for a deactivated user; 404 for an unknown user', async () => {
    const { website, mobile, ishaan } = await ids();
    const auth = await bearer('admin');
    const dup = await api().post(members(website)).set('Authorization', auth).send({ userId: (await userByEmail(DEMO.bob)).id, role: 'MEMBER' });
    expect(dup.body.error.code).toBe('ALREADY_MEMBER');
    const inactive = await api().post(members(mobile)).set('Authorization', auth).send({ userId: ishaan, role: 'MEMBER' });
    expect(inactive.body.error.code).toBe('USER_INACTIVE');
    const unknown = await api().post(members(mobile)).set('Authorization', auth).send({ userId: randomUUID(), role: 'MEMBER' });
    expect(unknown.status).toBe(404);
  });

  it.each([
    ['alice', 403],
    ['viewer', 403],
  ] as [DemoUser, number][])('%s cannot add members (%i)', async (who, status) => {
    const { website, pm } = await ids();
    const res = await api().post(members(website)).set('Authorization', await bearer(who)).send({ userId: pm, role: 'MEMBER' });
    expect(res.status).toBe(status);
  });

  it('archived projects are read-only', async () => {
    const { crm, bob } = await ids();
    const res = await api().post(members(crm)).set('Authorization', await bearer('pm')).send({ userId: bob, role: 'MEMBER' });
    expect(res.body.error.code).toBe('PROJECT_ARCHIVED');
  });
});

describe('PATCH /projects/:id/members/:userId', () => {
  it('MEMBER → VIEWER unassigns their OPEN tasks (bumping versions), keeps completed history', async () => {
    const { website, alice } = await ids();
    const before = await db.select().from(tasks).where(and(eq(tasks.projectId, website), eq(tasks.assigneeId, alice)));
    expect(before.map((t) => t.title).sort()).toEqual([
      'Design new homepage layout',
      'Fix contact form validation',
      'Implement responsive navigation',
    ]);

    const res = await api().patch(`${members(website)}/${alice}`).set('Authorization', await bearer('pm')).send({ role: 'VIEWER' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ role: 'VIEWER', openTaskCount: 0 });

    const after = await db.select().from(tasks).where(eq(tasks.projectId, website));
    const homepage = after.find((t) => t.title === 'Design new homepage layout')!;
    expect(homepage.assigneeId).toBe(alice); // DONE: who completed it is kept
    for (const title of ['Fix contact form validation', 'Implement responsive navigation']) {
      const task = after.find((t) => t.title === title)!;
      const old = before.find((t) => t.title === title)!;
      expect(task.assigneeId).toBeNull();
      expect(task.version).toBe(old.version + 1); // a stale edit will now get 409
    }

    const [log] = await db.select().from(activityLogs).where(eq(activityLogs.action, 'MEMBER_ROLE_CHANGED'));
    expect((log!.metadata as { unassignedTaskIds: string[] }).unassignedTaskIds).toHaveLength(2);
    expect(await db.$count(activityLogs, eq(activityLogs.action, 'TASK_UNASSIGNED'))).toBe(2);
    expect(events.filter((e) => e.type === 'task.updated')).toHaveLength(2);
    expect(await db.$count(notifications, and(eq(notifications.recipientId, alice), eq(notifications.type, 'PROJECT_ROLE_CHANGED')))).toBe(1);
  });

  it('managers cannot promote to MANAGER; the ceiling still applies for admins', async () => {
    const { website, bob } = await ids();
    const byPm = await api().patch(`${members(website)}/${bob}`).set('Authorization', await bearer('pm')).send({ role: 'MANAGER' });
    expect(byPm.status).toBe(403);
    const byAdmin = await api().patch(`${members(website)}/${bob}`).set('Authorization', await bearer('admin')).send({ role: 'MANAGER' });
    expect(byAdmin.body.error.code).toBe('ROLE_EXCEEDS_SYSTEM_ROLE');
  });

  it('a manager cannot demote another manager (or themselves)', async () => {
    const { website, pm } = await ids();
    const res = await api().patch(`${members(website)}/${pm}`).set('Authorization', await bearer('pm')).send({ role: 'MEMBER' });
    expect(res.status).toBe(403);
  });

  it('same role is a no-op: no activity', async () => {
    const { website, bob } = await ids();
    const res = await api().patch(`${members(website)}/${bob}`).set('Authorization', await bearer('pm')).send({ role: 'MEMBER' });
    expect(res.status).toBe(200);
    expect(await db.$count(activityLogs, eq(activityLogs.action, 'MEMBER_ROLE_CHANGED'))).toBe(0);
  });

  it('404 for someone who is not a member', async () => {
    const { mobile, alice } = await ids();
    const res = await api().patch(`${members(mobile)}/${alice}`).set('Authorization', await bearer('pm')).send({ role: 'VIEWER' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /projects/:id/members/:userId', () => {
  it('removes the member, unassigns all their tasks, and revokes access immediately', async () => {
    const { website, bob } = await ids();
    const res = await api().delete(`${members(website)}/${bob}`).set('Authorization', await bearer('pm'));
    expect(res.status).toBe(204);

    expect(await db.$count(tasks, and(eq(tasks.projectId, website), eq(tasks.assigneeId, bob)))).toBe(0);
    const [log] = await db.select().from(activityLogs).where(eq(activityLogs.action, 'MEMBER_REMOVED'));
    expect((log!.metadata as { unassignedTaskIds: string[] }).unassignedTaskIds).toHaveLength(2);
    expect(events.find((e) => e.type === 'member.removed')).toMatchObject({ userIds: [bob] });

    // bob's still-valid token no longer opens the project
    expect((await api().get(`/api/v1/projects/${website}`).set('Authorization', await bearer('bob'))).status).toBe(404);
  });

  it('a manager cannot remove a manager; an admin can (leaving zero managers is allowed)', async () => {
    const { website, pm } = await ids();
    expect((await api().delete(`${members(website)}/${pm}`).set('Authorization', await bearer('pm'))).status).toBe(403);
    expect((await api().delete(`${members(website)}/${pm}`).set('Authorization', await bearer('admin'))).status).toBe(204);
    const project = await api().get(`/api/v1/projects/${website}`).set('Authorization', await bearer('admin'));
    expect(project.body.data.managers).toEqual([]);
  });

  it('members and viewers cannot remove anyone', async () => {
    const { website, bob } = await ids();
    for (const who of ['alice', 'viewer'] as const) {
      expect((await api().delete(`${members(website)}/${bob}`).set('Authorization', await bearer(who))).status).toBe(403);
    }
  });
});

describe('GET /users (picker directory)', () => {
  it('admins see everyone, including deactivated users', async () => {
    const res = await api().get('/api/v1/users').set('Authorization', await bearer('admin'));
    expect(res.body.meta.total).toBe(6);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('project managers only ever see active users', async () => {
    const res = await api().get('/api/v1/users?isActive=false').set('Authorization', await bearer('pm'));
    expect(res.body.data.every((u: { isActive: boolean }) => u.isActive)).toBe(true);
    expect(res.body.meta.total).toBe(5);
  });

  it('members and viewers cannot browse users', async () => {
    for (const who of ['alice', 'viewer'] as const) {
      expect((await api().get('/api/v1/users').set('Authorization', await bearer(who))).status).toBe(403);
    }
  });

  it('notInProject + roles filters power the pickers', async () => {
    const { mobile } = await ids();
    const res = await api().get(`/api/v1/users?notInProject=${mobile}&sort=name`).set('Authorization', await bearer('pm'));
    expect(res.body.data.map((u: { name: string }) => u.name)).toEqual(['Alice Fernandes', 'Neha Kapoor', 'Vikram Rao']);
    const managers = await api().get('/api/v1/users?roles=ADMIN,PROJECT_MANAGER').set('Authorization', await bearer('admin'));
    expect(managers.body.data.map((u: { role: string }) => u.role).sort()).toEqual(['ADMIN', 'PROJECT_MANAGER']);
  });
});
