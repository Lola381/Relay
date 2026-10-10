import type { RequestHandler } from 'express';
import type { SystemAction } from '@pm/shared';
import { assertSystemCan } from '../access/assert';
import { currentUser } from './authenticate';

/** Route guard for system-level actions, e.g. `requirePermission('user.manage')`. Use after authenticate. */
export const requirePermission =
  (action: SystemAction): RequestHandler =>
  (req, _res, next) => {
    const user = currentUser(req);
    assertSystemCan({ userId: user.id, systemRole: user.role }, action);
    next();
  };
