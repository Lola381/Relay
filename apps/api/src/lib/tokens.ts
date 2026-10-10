// Access tokens: short-lived HS256 JWTs (stateless). Refresh tokens: random opaque strings whose
// SHA-256 hash is stored in refresh_tokens, so a DB leak doesn't leak usable sessions.
import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { SystemRole } from '@pm/shared';
import { env } from '../config/env';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = 'pm-api';
const AUDIENCE = 'pm-web';

/**
 * Only the user id is trusted from the token. Role and active status are re-read from the DB on
 * every request, so role changes and deactivation take effect immediately.
 */
export function signAccessToken(user: { id: string; role: SystemRole }): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_MINUTES}m`)
    .sign(secret);
}

/** Throws if the token is malformed, expired, or signed with another key. */
export async function verifyAccessToken(token: string): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  if (!payload.sub) throw new Error('Token has no subject');
  return { userId: payload.sub };
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function generateRefreshToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const refreshTokenExpiry = () =>
  new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
