// Server-side enforcement: current membership from the DB, 404 vs 403, archived projects, locks.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import type { AuthUser } from '@pm/shared';
import { assertProjectCan } from '../src/access/assert';
import { loadProjectAccess } from '../src/access/projectAccess';
import { db } from '../src/db/client';
import { projectMembers } from '../src/db/schema';
import { AppError } from '../src/lib/errors';
import { authenticate } from '../src/middleware/authenticate';
import { errorHandler } from '../src/middleware/errorHandler';
import { requirePermission } from '../src/middleware/requirePermission';
import { toAuthUser } from '../src/modules/users/users.mapper';
import { DEMO, loginAs, projectByName, resetDatabase, userByEmail, type DemoUser } from './helpers';

const authUser = async (who: DemoUser): Promise<AuthUser> => toAuthUser(await userByEmail(DEMO[who]));

/** Runs fn and returns the AppError it throws (fails the test if it doesn't throw one). */
async function errorOf(fn: () => unknown): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error('expected an AppError');
}

let website: Awaited<ReturnType<typeof projectByName>>;
let crm: Awaited<ReturnType<typeof projectByName>>;

beforeAll(async () => {
  await resetDatabase();
  website = await projectByName('Website Revamp');
  crm = await projectByName('Legacy CRM'); // archived
});

describe('loadProjectAccess', () => {
  it.each([
    ['pm', 'MANAGER'],
    ['alice', 'MEMBER'],
    ['viewer', 'VIEWER'],
  ] as const)('%s gets their real project role (%s)', async (who, role) => {
    const access = await loadProjectAccess(db, website.id, await authUser(who));
    expect(access.actor.projectRole).toBe(role);
    expect(access.project.id).toBe(website.id);
  });

  it('an admin has access without being a member', async () => {
    const access = await loadProjectAccess(db, website.id, await authUser('admin'));
    expect(access.actor).toMatchObject({ systemRole: 'ADMIN', projectRole: null });
  });

  it("a non-member gets 404, exactly like a project that doesn't exist", async () => {
    const notMember = await errorOf(async () => loadProjectAccess(db, crm.id, await authUser('bob')));
    const missing = await errorOf(async () => loadProjectAccess(db, randomUUID(), await authUser('bob')));
    for (const err of [notMember, missing]) {
      expect(err.status).toBe(404);
      expect(err.message).toBe('Project not found.');
    }
  });

  it('a membership removed a moment ago is no longer honoured (read fresh, not cached in the token)', async () => {
    const { token } = await loginAs('alice'); // token issued while alice IS a member
    expect(token).toBeTruthy();
    const alice = await authUser('alice');
    await db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, website.id), eq(projectMembers.userId, alice.id)));
    const err = await errorOf(() => loadProjectAccess(db, website.id, alice));
    expect(err.status).toBe(404);
    await resetDatabase(); // restore the seed for the other tests
    website = await projectByName('Website Revamp');
    crm = await projectByName('Legacy CRM');
  });
});

describe('assertProjectCan', () => {
  it('lets a manager create tasks', async () => {
    const access = await loadProjectAccess(db, website.id, await authUser('pm'));
    expect(() => assertProjectCan(access, 'task.create')).not.toThrow();
  });

  it('403 FORBIDDEN with a specific message for a viewer', async () => {
    const access = await loadProjectAccess(db, website.id, await authUser('viewer'));
    const err = await errorOf(() => assertProjectCan(access, 'task.create'));
    expect(err).toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'Only project managers can create tasks.' });
  });

  it("403 when a member changes the status of someone else's task", async () => {
    const access = await loadProjectAccess(db, website.id, await authUser('alice'));
    const bob = await authUser('bob');
    const err = await errorOf(() => assertProjectCan(access, 'task.changeStatus', { assigneeId: bob.id }));
    expect(err).toMatchObject({ status: 403, message: 'You can only update tasks assigned to you.' });
  });

  it('403 PROJECT_ARCHIVED for writes to an archived project, using the status from the DB', async () => {
    const access = await loadProjectAccess(db, crm.id, await authUser('pm'));
    const err = await errorOf(() => assertProjectCan(access, 'task.create'));
    expect(err).toMatchObject({ status: 403, code: 'PROJECT_ARCHIVED' });
    expect(() => assertProjectCan(access, 'project.view')).not.toThrow();
  });
});

describe('project row locks (archive vs. concurrent writes, DATA_MODEL P3)', () => {
  it('a write that needs the project (FOR SHARE) waits while the project is being archived (FOR UPDATE)', async () => {
    const pm = await authUser('pm');
    const admin = await authUser('admin');
    const timeline: string[] = [];

    const archiver = db.transaction(async (tx) => {
      await loadProjectAccess(tx, website.id, admin, 'update');
      timeline.push('archiver locked');
      await new Promise((resolve) => setTimeout(resolve, 400));
      timeline.push('archiver commits');
    });

    await new Promise((resolve) => setTimeout(resolve, 100)); // let the archiver take the lock first

    const writer = db.transaction(async (tx) => {
      timeline.push('writer asks for lock');
      await loadProjectAccess(tx, website.id, pm, 'share');
      timeline.push('writer got lock');
    });

    await Promise.all([archiver, writer]);
    expect(timeline).toEqual(['archiver locked', 'writer asks for lock', 'archiver commits', 'writer got lock']);
  });
});

describe('requirePermission middleware (system-level routes)', () => {
  const mini = express();
  mini.get('/admin-only', authenticate, requirePermission('user.manage'), (_req, res) => {
    res.json({ ok: true });
  });
  mini.use(errorHandler);

  it.each([
    ['admin', 200],
    ['pm', 403],
    ['alice', 403],
    ['viewer', 403],
  ] as const)('%s → %i', async (who, status) => {
    const { token } = await loginAs(who);
    const res = await request(mini).get('/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(status);
    if (status === 403) expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
