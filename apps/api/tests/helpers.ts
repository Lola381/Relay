import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import type { AuthSession } from '@pm/shared';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { projects, users } from '../src/db/schema';
import { seed } from '../src/db/seed/seed';
import { DEMO_PASSWORD } from '../src/db/seed/fixtures';

export const app = createApp();
export const api = () => request(app);

/** Fresh, known data: the same idempotent seed as `npm run db:seed`. */
export async function resetDatabase() {
  await seed(db);
}

export const DEMO = {
  admin: 'admin@demo.com',
  pm: 'pm@demo.com',
  alice: 'alice@demo.com',
  bob: 'bob@demo.com',
  viewer: 'viewer@demo.com',
  inactive: 'inactive@demo.com',
} as const;
export type DemoUser = keyof typeof DEMO;

export interface LoggedIn {
  token: string;
  /** Raw Set-Cookie value for the refresh cookie, ready for `.set('Cookie', …)`. */
  cookie: string;
  user: AuthSession['user'];
}

export async function loginAs(who: DemoUser): Promise<LoggedIn> {
  const res = await api().post('/api/v1/auth/login').send({ email: DEMO[who], password: DEMO_PASSWORD });
  if (res.status !== 200) throw new Error(`login as ${who} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.data.accessToken, cookie: refreshCookieFrom(res.headers), user: res.body.data.user };
}

export function refreshCookieFrom(headers: Record<string, unknown>): string {
  const setCookie = ([] as string[]).concat((headers['set-cookie'] as string[] | string | undefined) ?? []);
  const cookie = setCookie.find((c) => c.startsWith('pm_refresh='));
  if (!cookie) throw new Error('No pm_refresh cookie was set');
  return cookie.split(';')[0]!;
}

export async function userByEmail(email: string) {
  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  if (!user) throw new Error(`No user ${email}`);
  return user;
}

export async function projectByName(name: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.name, name) });
  if (!project) throw new Error(`No project ${name}`);
  return project;
}
