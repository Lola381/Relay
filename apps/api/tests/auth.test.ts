import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { db } from '../src/db/client';
import { refreshTokens, users } from '../src/db/schema';
import { DEMO_PASSWORD } from '../src/db/seed/fixtures';
import { hashToken } from '../src/lib/tokens';
import { api, DEMO, loginAs, refreshCookieFrom, resetDatabase, userByEmail } from './helpers';

const LOGIN = '/api/v1/auth/login';
const REFRESH = '/api/v1/auth/refresh';
const LOGOUT = '/api/v1/auth/logout';
const ME = '/api/v1/auth/me';

beforeAll(resetDatabase);

describe('POST /auth/login', () => {
  it('signs in, returns the user without secrets, and sets a locked-down refresh cookie', async () => {
    const res = await api().post(LOGIN).send({ email: '  Alice@Demo.COM ', password: DEMO_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: DEMO.alice, role: 'TEAM_MEMBER' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/);
    expect(res.body.data.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('pm_refresh='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const wrongPassword = await api().post(LOGIN).send({ email: DEMO.alice, password: 'nope-nope' });
    const unknownEmail = await api().post(LOGIN).send({ email: 'ghost@demo.com', password: 'nope-nope' });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
    }
  });

  it('reveals deactivation only after a correct password', async () => {
    const right = await api().post(LOGIN).send({ email: DEMO.inactive, password: DEMO_PASSWORD });
    expect(right.status).toBe(401);
    expect(right.body.error.code).toBe('ACCOUNT_DEACTIVATED');

    const wrong = await api().post(LOGIN).send({ email: DEMO.inactive, password: 'nope-nope' });
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('validates input and reports each invalid field', async () => {
    const res = await api().post(LOGIN).send({ email: 'alex@', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { path: 'email', message: 'Enter a valid email address.' },
        { path: 'password', message: 'Password is required.' },
      ]),
    );
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await api().post(LOGIN).set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('GET /auth/me (authenticate middleware)', () => {
  it('returns the signed-in user', async () => {
    const { token } = await loginAs('pm');
    const res = await api().get(ME).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: DEMO.pm, role: 'PROJECT_MANAGER' });
  });

  it.each([
    ['no header', undefined],
    ['not a Bearer header', 'Basic abc'],
    ['garbage token', 'Bearer abc.def.ghi'],
  ])('401 with %s', async (_label, header) => {
    const req = api().get(ME);
    if (header) req.set('Authorization', header);
    const res = await req;
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a token signed with a different secret (forged admin token)', async () => {
    const admin = await userByEmail(DEMO.admin);
    const forged = await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .setIssuer('pm-api')
      .setAudience('pm-web')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('an-attacker-guessed-secret-that-is-long-enough'));
    const res = await api().get(ME).set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned ("alg: none") token', async () => {
    const admin = await userByEmail(DEMO.admin);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'none' })}.${b64({ sub: admin.id, iss: 'pm-api', aud: 'pm-web' })}.`;
    const res = await api().get(ME).set('Authorization', `Bearer ${unsigned}`);
    expect(res.status).toBe(401);
  });

  it('locks out a user deactivated mid-session, even with an unexpired token', async () => {
    const { token } = await loginAs('bob');
    await db.update(users).set({ isActive: false, deactivatedAt: new Date() }).where(eq(users.email, DEMO.bob));
    try {
      const res = await api().get(ME).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    } finally {
      await db.update(users).set({ isActive: true, deactivatedAt: null }).where(eq(users.email, DEMO.bob));
    }
  });
});

describe('POST /auth/refresh (rotation + reuse detection)', () => {
  beforeEach(async () => {
    await db.delete(refreshTokens);
  });

  it('204 when there is no cookie (normal signed-out page load)', async () => {
    const res = await api().post(REFRESH);
    expect(res.status).toBe(204);
  });

  it('rotates: new access token and a different refresh cookie', async () => {
    const { cookie } = await loginAs('alice');
    const res = await api().post(REFRESH).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(DEMO.alice);
    expect(refreshCookieFrom(res.headers)).not.toBe(cookie);
  });

  it('tolerates the old cookie inside the 10 s grace window (two tabs refreshing at once)', async () => {
    const { cookie } = await loginAs('alice');
    const first = await api().post(REFRESH).set('Cookie', cookie);
    const second = await api().post(REFRESH).set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('detects reuse of a rotated token after the grace window and ends the whole login', async () => {
    const { cookie } = await loginAs('alice');
    const rotated = await api().post(REFRESH).set('Cookie', cookie);
    const newest = refreshCookieFrom(rotated.headers);

    // Pretend the rotation happened a minute ago (instead of sleeping in the test)
    const oldHash = hashToken(cookie.split('=')[1]!);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(Date.now() - 60_000) })
      .where(eq(refreshTokens.tokenHash, oldHash));

    const replay = await api().post(REFRESH).set('Cookie', cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.message).toBe('Session ended. Please sign in again.');

    // The legitimate newest token is revoked too: the stolen copy can't be used to keep a session
    const afterTheft = await api().post(REFRESH).set('Cookie', newest);
    expect(afterTheft.status).toBe(401);
  });

  it('401 for an expired refresh token', async () => {
    const { cookie } = await loginAs('alice');
    await db.update(refreshTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await api().post(REFRESH).set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('401 ACCOUNT_DEACTIVATED when the user was deactivated', async () => {
    const { cookie } = await loginAs('viewer');
    await db.update(users).set({ isActive: false, deactivatedAt: new Date() }).where(eq(users.email, DEMO.viewer));
    try {
      const res = await api().post(REFRESH).set('Cookie', cookie);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    } finally {
      await db.update(users).set({ isActive: true, deactivatedAt: null }).where(eq(users.email, DEMO.viewer));
    }
  });

  it('stores only a hash of the refresh token', async () => {
    const { cookie } = await loginAs('alice');
    const raw = cookie.split('=')[1]!;
    const rows = await db.select({ tokenHash: refreshTokens.tokenHash }).from(refreshTokens);
    expect(rows.map((r) => r.tokenHash)).toContain(hashToken(raw));
    expect(rows.map((r) => r.tokenHash)).not.toContain(raw);
  });
});

describe('POST /auth/logout', () => {
  it('ends the session: the cookie no longer refreshes', async () => {
    const { cookie } = await loginAs('alice');
    const out = await api().post(LOGOUT).set('Cookie', cookie);
    expect(out.status).toBe(204);

    const res = await api().post(REFRESH).set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('always succeeds, even without a session', async () => {
    const res = await api().post(LOGOUT);
    expect(res.status).toBe(204);
  });
});
