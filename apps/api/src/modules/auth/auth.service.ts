import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { ERROR_CODES, type AuthSession } from '@pm/shared';
import { db, type Tx } from '../../db/client';
import { refreshTokens, users } from '../../db/schema';
import { AppError, unauthenticated } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { hashPassword, verifyPassword } from '../../lib/password';
import {
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
} from '../../lib/tokens';
import { toAuthUser } from '../users/users.mapper';

/**
 * A token rotated less than this long ago may be presented again without being treated as theft.
 * Covers two tabs (or a double-fired request) refreshing with the same cookie at the same moment.
 */
const ROTATION_GRACE_MS = 10_000;

/** Result of a login/refresh: the JSON body plus the new refresh token for the cookie. */
export interface SessionResult {
  session: AuthSession;
  refreshToken: string;
}

const invalidCredentials = () =>
  new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Email or password is incorrect.');

const accountDeactivated = () =>
  new AppError(
    401,
    ERROR_CODES.ACCOUNT_DEACTIVATED,
    'This account is deactivated. Contact your administrator.',
  );

// Compared against when the email doesn't exist, so "unknown email" and "wrong password" take
// the same time and can't be told apart (DATA_MODEL U2).
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('timing-equalizer-not-a-real-password'));

export async function login(
  input: { email: string; password: string },
  userAgent?: string,
): Promise<SessionResult> {
  const user = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${input.email}`,
  });

  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !passwordOk) throw invalidCredentials();
  // Checked only after the password, so deactivation status isn't revealed to someone guessing
  if (!user.isActive) throw accountDeactivated();

  const refreshToken = await db.transaction(async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return issueRefreshToken(tx, user.id, randomUUID(), userAgent);
  });

  return {
    session: { accessToken: await signAccessToken(user), user: toAuthUser(user) },
    refreshToken: refreshToken.token,
  };
}

type RotationOutcome =
  | { kind: 'ok'; result: SessionResult }
  | { kind: 'rejected'; error: AppError };

/**
 * Exchanges a refresh token for a new access token and a new refresh token (rotation).
 * Presenting a token that was already rotated (outside the grace window) means it was copied:
 * the whole login family is revoked and every session from that login must sign in again.
 */
export async function refresh(rawToken: string, userAgent?: string): Promise<SessionResult> {
  const outcome = await db.transaction(async (tx): Promise<RotationOutcome> => {
    // Row lock: two concurrent refreshes with the same token are serialized here
    const [token] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(rawToken)))
      .for('update');

    if (!token) return { kind: 'rejected', error: unauthenticated('Session not found. Please sign in.') };

    if (token.revokedAt) {
      const justRotated =
        token.replacedBy !== null && Date.now() - token.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (!justRotated) {
        await revokeFamily(tx, token.familyId);
        logger.warn({ userId: token.userId, familyId: token.familyId }, 'Refresh token reuse detected');
        return { kind: 'rejected', error: unauthenticated('Session ended. Please sign in again.') };
      }
    }

    if (token.expiresAt.getTime() <= Date.now()) {
      return { kind: 'rejected', error: unauthenticated('Your session expired. Please sign in again.') };
    }

    const user = await tx.query.users.findFirst({ where: eq(users.id, token.userId) });
    if (!user?.isActive) {
      await revokeFamily(tx, token.familyId);
      return { kind: 'rejected', error: accountDeactivated() };
    }

    const next = await issueRefreshToken(tx, user.id, token.familyId, userAgent);
    if (!token.revokedAt) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedBy: next.id })
        .where(eq(refreshTokens.id, token.id));
    }

    return {
      kind: 'ok',
      result: {
        session: { accessToken: await signAccessToken(user), user: toAuthUser(user) },
        refreshToken: next.token,
      },
    };
  });

  // Rejections are thrown *after* commit, so a family revocation isn't rolled back with them
  if (outcome.kind === 'rejected') throw outcome.error;
  return outcome.result;
}

/** Ends this login (all rotations of it). Unknown/expired tokens are ignored: logout always succeeds. */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const token = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, hashToken(rawToken)),
    columns: { familyId: true },
  });
  if (token) await revokeFamily(db, token.familyId);
}

async function issueRefreshToken(tx: Tx, userId: string, familyId: string, userAgent?: string) {
  const { token, hash } = generateRefreshToken();
  const [row] = await tx
    .insert(refreshTokens)
    .values({
      userId,
      tokenHash: hash,
      familyId,
      expiresAt: refreshTokenExpiry(),
      userAgent: userAgent?.slice(0, 500) ?? null,
    })
    .returning({ id: refreshTokens.id });
  return { id: row!.id, token };
}

async function revokeFamily(executor: Tx | typeof db, familyId: string) {
  await executor
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}
