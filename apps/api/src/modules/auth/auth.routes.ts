import { Router } from 'express';
import { loginSchema, registerSchema, type ApiResponse, type AuthSession, type AuthUser } from '@pm/shared';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { loginRateLimit } from '../../middleware/rateLimit';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../../lib/cookies';
import { parse } from '../../lib/validation';
import * as authService from './auth.service';
import { registerUser } from '../users/users.service';

export const authRouter = Router();

/** Email + password → access token in the body, refresh token in an httpOnly cookie. */
authRouter.post('/login', loginRateLimit, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const { session, refreshToken } = await authService.login(input, req.get('user-agent'));
  setRefreshCookie(res, refreshToken);
  res.json({ data: session } satisfies ApiResponse<AuthSession>);
});

/**
 * Self-service sign-up as Project Manager, Team Member or Viewer (never Admin), then signs the
 * new user straight in. New users belong to no project until a manager or admin adds them.
 */
authRouter.post('/register', loginRateLimit, async (req, res) => {
  const input = parse(registerSchema, req.body);
  await registerUser(input);
  const { session, refreshToken } = await authService.login(
    { email: input.email, password: input.password },
    req.get('user-agent'),
  );
  setRefreshCookie(res, refreshToken);
  res.status(201).json({ data: session } satisfies ApiResponse<AuthSession>);
});

/**
 * Refresh cookie → new access token + rotated refresh cookie.
 * No cookie at all → 204: "nothing to restore" is the normal signed-out state on page load, not
 * an error. A cookie that is invalid, expired or reused → 401.
 */
authRouter.post('/refresh', async (req, res) => {
  const rawToken = readRefreshCookie(req);
  if (!rawToken) {
    res.status(204).end();
    return;
  }
  try {
    const { session, refreshToken } = await authService.refresh(rawToken, req.get('user-agent'));
    setRefreshCookie(res, refreshToken);
    res.json({ data: session } satisfies ApiResponse<AuthSession>);
  } catch (err) {
    clearRefreshCookie(res); // a dead cookie is never worth keeping
    throw err;
  }
});

/** Revokes this login's refresh tokens. Needs no access token, so it works after expiry. */
authRouter.post('/logout', async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ data: currentUser(req) } satisfies ApiResponse<AuthUser>);
});
