import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../src/db/client';
import { activityLogs, notifications, projects, tasks } from '../src/db/schema';
import { onCommittedEvent, type AppEvent } from '../src/lib/events';
import { api, bearer, DEMO, projectByName, resetDatabase, userByEmail } from './helpers';

const P = '/api/v1/projects';

beforeEach(resetDatabase);

let events: AppEvent[] = [];
let stop: (() => void) | undefined;
beforeEach(() => {
  events = [];
  stop = onCommittedEvent((e) => events.push(e));
});
afterEach(() => stop?.());

describe('GET /projects', () => {
  it('admins see every project; status counts power the header', async () => {
    const res = await api().get(`${P}?status=ALL`).set('Authorization', await bearer('admin'));
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { name: string }) => p.name).sort()).toEqual(['Legacy CRM', 'Mobile App', 'Website Revamp']);
    expect(res.body.meta).toMatchObject({ total: 3, statusCounts: { ACTIVE: 2, ARCHIVED: 1 } });
  });

  it.each([
    ['alice', ['Legacy CRM', 'Website Revamp']],
    ['bob', ['Mobile App', 'Website Revamp']],
    ['viewer', ['Website Revamp']],
  ] as const)('%s only sees projects they belong to', async (who, names) => {
    const res = await api().get(`${P}?status=ALL&sort=name`).set('Authorization', await bearer(who));
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(names);
  });

  it('defaults to ACTIVE projects, newest activity first', async () => {
    const res = await api().get(P).set('Authorization', await bearer('admin'));
    expect(res.body.data.every((p: { status: string }) => p.status === 'ACTIVE')).toBe(true);
  });

  it('searches by name, treating % and _ literally', async () => {
    const auth = await bearer('admin');
    const web = await api().get(`${P}?search=web&status=ALL`).set('Authorization', auth);
    expect(web.body.data.map((p: { name: string }) => p.name)).toEqual(['Website Revamp']);
    const wildcard = await api().get(`${P}?search=%25&status=ALL`).set('Authorization', auth);
    expect(wildcard.body.data).toEqual([]);
  });

  it('paginates', async () => {
    const res = await api().get(`${P}?status=ALL&pageSize=1&page=2&sort=name`).set('Authorization', await bearer('admin'));
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['Mobile App']);
    expect(res.body.meta).toMatchObject({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
  });

  it('rejects an unknown sort or status with 400', async () => {
    const res = await api().get(`${P}?sort=password`).set('Authorization', await bearer('admin'));
    expect(res.status).toBe(400);
  });

  it('computes the tile stats', async () => {
    const res = await api().get(`${P}?search=website`).set('Authorization', await bearer('alice'));
    const website = res.body.data[0];
    expect(website.myRole).toBe('MEMBER');
    expect(website.managers.map((m: { name: string }) => m.name)).toEqual(['Ravi Kumar']);
    expect(website.stats).toEqual({
      memberCount: 5,
      taskCount: 8,
      taskCounts: { TODO: 4, IN_PROGRESS: 2, IN_REVIEW: 1, DONE: 1 },
      overdueCount: 2, // "About page" (in review) and "Contact form" are past due
      unassignedCount: 1,
      commentCount: 3,
      myOpenTaskCount: 2, // alice: navigation + contact form (homepage is DONE)
    });
  });

  it('requires authentication', async () => {
    expect((await api().get(P)).status).toBe(401);
  });
});

describe('GET /projects/:id', () => {
  it('404 for a project the caller is not in, the same as one that does not exist', async () => {
    const mobile = await projectByName('Mobile App');
    const auth = await bearer('alice');
    const notMember = await api().get(`${P}/${mobile.id}`).set('Authorization', auth);
    const missing = await api().get(`${P}/${randomUUID()}`).set('Authorization', auth);
    expect(notMember.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(notMember.body).toEqual(missing.body);
  });

  it('400 for a malformed id', async () => {
    const res = await api().get(`${P}/not-a-uuid`).set('Authorization', await bearer('admin'));
    expect(res.status).toBe(400);
  });

  it('admins get myRole ADMIN', async () => {
    const website = await projectByName('Website Revamp');
    const res = await api().get(`${P}/${website.id}`).set('Authorization', await bearer('admin'));
    expect(res.body.data.myRole).toBe('ADMIN');
  });
});

describe('POST /projects', () => {
  it('admin creates a project with managers: memberships, activity, notification, event', async () => {
    const pm = await userByEmail(DEMO.pm);
    const res = await api()
      .post(P)
      .set('Authorization', await bearer('admin'))
      .send({ name: '  Brand Refresh ', description: 'New logo and guidelines', managerIds: [pm.id] });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Brand Refresh',
      status: 'ACTIVE',
      version: 1,
      managers: [{ id: pm.id, name: 'Ravi Kumar' }],
      stats: { memberCount: 1, taskCount: 0 },
    });

    const id = res.body.data.id;
    const actions = await db.select({ action: activityLogs.action }).from(activityLogs).where(eq(activityLogs.projectId, id));
    expect(actions.map((a) => a.action).sort()).toEqual(['MEMBER_ADDED', 'PROJECT_CREATED']);

    const notes = await db.select().from(notifications).where(eq(notifications.projectId, id));
    expect(notes).toEqual([expect.objectContaining({ recipientId: pm.id, type: 'PROJECT_MEMBER_ADDED' })]);
    expect(events.map((e) => e.type)).toContain('project.created');
  });

  it.each(['pm', 'alice', 'viewer'] as const)('%s cannot create projects (403)', async (who) => {
    const res = await api().post(P).set('Authorization', await bearer(who)).send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('409 PROJECT_NAME_TAKEN for an active name (any case), mapped to the name field', async () => {
    const res = await api().post(P).set('Authorization', await bearer('admin')).send({ name: 'WEBSITE revamp' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROJECT_NAME_TAKEN');
    expect(res.body.error.details).toEqual([{ path: 'name', message: 'A project with this name already exists.' }]);
  });

  it('an archived project name can be reused', async () => {
    const res = await api().post(P).set('Authorization', await bearer('admin')).send({ name: 'Legacy CRM' });
    expect(res.status).toBe(201);
  });

  it('rejects managers who are team members (role ceiling) or deactivated', async () => {
    const auth = await bearer('admin');
    const alice = await userByEmail(DEMO.alice);
    const ishaan = await userByEmail(DEMO.inactive);
    const ceiling = await api().post(P).set('Authorization', auth).send({ name: 'A', managerIds: [alice.id] });
    expect(ceiling.body.error.code).toBe('ROLE_EXCEEDS_SYSTEM_ROLE');
    const inactive = await api().post(P).set('Authorization', auth).send({ name: 'B', managerIds: [ishaan.id] });
    expect(inactive.body.error.code).toBe('USER_INACTIVE');
  });

  it('validates input: blank name, unknown fields', async () => {
    const auth = await bearer('admin');
    const blank = await api().post(P).set('Authorization', auth).send({ name: '   ' });
    expect(blank.status).toBe(400);
    expect(blank.body.error.details[0]).toEqual({ path: 'name', message: 'Name is required.' });
    const extra = await api().post(P).set('Authorization', auth).send({ name: 'X', status: 'ARCHIVED' });
    expect(extra.status).toBe(400);
  });
});

describe('PATCH /projects/:id', () => {
  const patch = async (who: Parameters<typeof bearer>[0], body: object, name = 'Website Revamp') => {
    const project = await projectByName(name);
    return api().patch(`${P}/${project.id}`).set('Authorization', await bearer(who)).send(body);
  };

  it('the project manager renames it: version bumps, activity records the change', async () => {
    const res = await patch('pm', { version: 1, name: 'Website Relaunch' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Website Relaunch', version: 2 });
    const [log] = await db.select().from(activityLogs).where(eq(activityLogs.action, 'PROJECT_UPDATED'));
    expect(log!.metadata).toMatchObject({ name: ['Website Revamp', 'Website Relaunch'] });
  });

  it.each(['alice', 'viewer'] as const)('%s cannot edit the project (403)', async (who) => {
    const res = await patch(who, { version: 1, name: 'Hijacked' });
    expect(res.status).toBe(403);
  });

  it("409 VERSION_CONFLICT for a stale version, naming who changed it and returning the latest", async () => {
    await patch('admin', { version: 1, description: 'Edited by the admin' });
    const stale = await patch('pm', { version: 1, name: 'Late edit' });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      message: 'Neha Kapoor updated this project while you were editing.',
      details: { yourVersion: 1, currentVersion: 2, current: { description: 'Edited by the admin', version: 2 } },
    });
  });

  it('a no-op update does not bump the version or log activity', async () => {
    const res = await patch('pm', { version: 1, name: 'Website Revamp' });
    expect(res.body.data.version).toBe(1);
    expect(await db.$count(activityLogs, eq(activityLogs.action, 'PROJECT_UPDATED'))).toBe(0);
  });

  it('archived projects are read-only, even for their manager', async () => {
    const res = await patch('pm', { version: 2, name: 'Revive' }, 'Legacy CRM');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROJECT_ARCHIVED');
  });

  it('cannot take the name of another active project', async () => {
    const res = await patch('admin', { version: 1, name: 'mobile app' });
    expect(res.body.error.code).toBe('PROJECT_NAME_TAKEN');
  });
});

describe('archive / unarchive', () => {
  it('only admins archive; archiving makes the project read-only; unarchive restores it', async () => {
    const website = await projectByName('Website Revamp');
    const url = `${P}/${website.id}`;

    expect((await api().post(`${url}/archive`).set('Authorization', await bearer('pm'))).status).toBe(403);

    const archived = await api().post(`${url}/archive`).set('Authorization', await bearer('admin'));
    expect(archived.status).toBe(200);
    expect(archived.body.data).toMatchObject({ status: 'ARCHIVED', version: 2 });
    expect(archived.body.data.archivedAt).toBeTruthy();

    const again = await api().post(`${url}/archive`).set('Authorization', await bearer('admin'));
    expect(again.body.error.code).toBe('ALREADY_ARCHIVED');

    const blocked = await api().patch(url).set('Authorization', await bearer('pm')).send({ version: 2, name: 'X' });
    expect(blocked.body.error.code).toBe('PROJECT_ARCHIVED');

    const restored = await api().post(`${url}/unarchive`).set('Authorization', await bearer('admin'));
    expect(restored.body.data).toMatchObject({ status: 'ACTIVE', archivedAt: null, version: 3 });

    const notArchived = await api().post(`${url}/unarchive`).set('Authorization', await bearer('admin'));
    expect(notArchived.body.error.code).toBe('NOT_ARCHIVED');
  });

  it('unarchiving into a name clash is refused (DATA_MODEL P2)', async () => {
    const auth = await bearer('admin');
    await api().post(P).set('Authorization', auth).send({ name: 'Legacy CRM' });
    const crm = await db.query.projects.findFirst({ where: and(eq(projects.name, 'Legacy CRM'), eq(projects.status, 'ARCHIVED')) });
    const res = await api().post(`${P}/${crm!.id}/unarchive`).set('Authorization', auth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROJECT_NAME_TAKEN');
  });
});

describe('DELETE /projects/:id', () => {
  it('only admins delete', async () => {
    const website = await projectByName('Website Revamp');
    const res = await api().delete(`${P}/${website.id}`).set('Authorization', await bearer('pm'));
    expect(res.status).toBe(403);
  });

  it('cascades the project data, keeps a permanent system record, and notifies former members', async () => {
    const website = await projectByName('Website Revamp');
    const res = await api().delete(`${P}/${website.id}`).set('Authorization', await bearer('admin'));
    expect(res.status).toBe(204);

    expect((await api().get(`${P}/${website.id}`).set('Authorization', await bearer('admin'))).status).toBe(404);
    expect(await db.$count(tasks, eq(tasks.projectId, website.id))).toBe(0);

    const [record] = await db
      .select()
      .from(activityLogs)
      .where(and(eq(activityLogs.action, 'PROJECT_DELETED'), isNull(activityLogs.projectId)));
    expect(record!.metadata).toMatchObject({ projectName: 'Website Revamp', taskCount: 8, commentCount: 3, memberCount: 5 });

    const deleted = events.find((e) => e.type === 'project.deleted');
    expect(deleted?.userIds).toHaveLength(5);
  });
});
