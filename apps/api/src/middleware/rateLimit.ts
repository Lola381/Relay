import type { Request } from 'express';
import { rateLimit, type RateLimitInfo } from 'express-rate-limit';
import { ERROR_CODES, type ApiErrorBody } from '@pm/shared';
import { env } from '../config/env';

/**
 * Brute-force protection for POST /auth/login: 10 failed attempts per IP per 15 minutes.
 * Successful logins don't count, so switching between demo accounts is never blocked.
 */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: (req, res) => {
    const info = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit;
    const resetTime = info?.resetTime?.getTime() ?? Date.now() + 60_000;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
    const minutes = Math.ceil(retryAfterSeconds / 60);
    const body: ApiErrorBody = {
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        details: { retryAfterSeconds },
      },
    };
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json(body);
  },
});
