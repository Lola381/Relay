import type { Request, RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { ERROR_CODES, type AuthUser } from '@pm/shared';
import { db } from '../db/client';
import { users } from '../db/schema';
import { AppError, unauthenticated } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';
import { toAuthUser } from '../modules/users/users.mapper';

/**
 * Requires `Authorization: Bearer <access token>`. The token only proves *who* the caller is;
 * the user row is re-read on every request so a deactivated user is rejected immediately, even
 * with an unexpired token (DATA_MODEL U4).
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthenticated();

  let userId: string;
  try {
    ({ userId } = await verifyAccessToken(header.slice('Bearer '.length).trim()));
  } catch {
    throw unauthenticated('Your session has expired. Please sign in again.');
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw unauthenticated();
  if (!user.isActive) {
    throw new AppError(401, ERROR_CODES.ACCOUNT_DEACTIVATED, 'This account is deactivated.');
  }

  req.user = toAuthUser(user);
  next();
};

/** For handlers behind `authenticate`: the signed-in user (throws if the middleware is missing). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthenticated();
  return req.user;
}
