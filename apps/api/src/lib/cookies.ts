import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../config/env';

export const REFRESH_COOKIE = 'pm_refresh';

// httpOnly: JavaScript can't read it (XSS can't steal the session).
// SameSite=Lax: other sites can't make the browser send it with a POST (CSRF). localhost:3000
// and localhost:4000 count as the same site, so the web app's requests still carry it.
// Path: only sent to /api/v1/auth/*, never with ordinary API calls.
const baseOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/api/v1/auth',
};

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, baseOptions);
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
