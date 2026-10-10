import type { AuthUser } from '@pm/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware; always freshly loaded from the DB. */
      user?: AuthUser;
    }
  }
}

export {};
