// Real constraint violations from PostgreSQL → the API errors clients see.
import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { projectMembers, projects, tasks, users } from '../src/db/schema';
import { mapDatabaseError } from '../src/lib/dbErrors';
import { errorHandler } from '../src/middleware/errorHandler';
import { DEMO, projectByName, resetDatabase, userByEmail } from './helpers';

/** Runs a DB write that must fail and returns the raw error. */
async function violation(write: () => Promise<unknown>): Promise<unknown> {
  try {
    await write();
  } catch (err) {
    return err;
  }
  throw new Error('expected the write to fail');
}

beforeAll(resetDatabase);

describe('mapDatabaseError', () => {
  it('duplicate email (any case) → 409 EMAIL_TAKEN', async () => {
    const err = await violation(() =>
      db.insert(users).values({ name: 'Dup', email: 'ALICE@demo.com', passwordHash: 'x', role: 'VIEWER' }),
    );
    expect(mapDatabaseError(err)).toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
  });

  it('second active project with the same name → 409 PROJECT_NAME_TAKEN', async () => {
    const admin = await userByEmail(DEMO.admin);
    const err = await violation(() => db.insert(projects).values({ name: 'website revamp', createdBy: admin.id }));
    expect(mapDatabaseError(err)).toMatchObject({ status: 409, code: 'PROJECT_NAME_TAKEN' });
  });

  it('adding an existing member again → 409 ALREADY_MEMBER', async () => {
    const website = await projectByName('Website Revamp');
    const alice = await userByEmail(DEMO.alice);
    const err = await violation(() =>
      db.insert(projectMembers).values({ projectId: website.id, userId: alice.id, role: 'MEMBER', addedBy: alice.id }),
    );
    expect(mapDatabaseError(err)).toMatchObject({ status: 409, code: 'ALREADY_MEMBER' });
  });

  it('assigning a task to someone outside the project → 400 INVALID_ASSIGNEE', async () => {
    const mobile = await projectByName('Mobile App');
    const alice = await userByEmail(DEMO.alice); // not in Mobile App
    const [task] = await db.select().from(tasks).where(eq(tasks.projectId, mobile.id)).limit(1);
    const err = await violation(() => db.update(tasks).set({ assigneeId: alice.id }).where(eq(tasks.id, task!.id)));
    expect(mapDatabaseError(err)).toMatchObject({ status: 400, code: 'INVALID_ASSIGNEE' });
  });

  it('a CHECK violation (blank title) → 400 VALIDATION_ERROR', async () => {
    const [task] = await db.select().from(tasks).limit(1);
    const err = await violation(() => db.update(tasks).set({ title: '   ' }).where(eq(tasks.id, task!.id)));
    expect(mapDatabaseError(err)).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('leaves unrelated errors alone (they become a generic 500)', () => {
    expect(mapDatabaseError(new Error('boom'))).toBeNull();
    expect(mapDatabaseError(undefined)).toBeNull();
  });
});

describe('through the error handler', () => {
  const mini = express();
  mini.post('/dup-email', async () => {
    await db.insert(users).values({ name: 'Dup', email: DEMO.bob, passwordHash: 'x', role: 'VIEWER' });
  });
  mini.get('/crash', () => {
    throw new Error('secret internal detail: connection string postgres://...');
  });
  mini.use(errorHandler);

  it('returns the standard error body and never leaks SQL', async () => {
    const res = await request(mini).post('/dup-email');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'EMAIL_TAKEN', message: 'This email is already in use.' } });
    expect(JSON.stringify(res.body)).not.toMatch(/insert|users|password/i);
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const res = await request(mini).get('/crash');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/secret|postgres/);
  });
});
