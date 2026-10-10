import { Router } from 'express';
import { listUsersQuerySchema } from '@pm/shared';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { parse } from '../../lib/validation';
import { listUsers } from './users.service';

export const usersRouter = Router();
usersRouter.use(authenticate);

/** Directory for the pickers (Admin + Project managers). Full user management arrives in Phase 8. */
usersRouter.get('/', async (req, res) => {
  res.json(await listUsers(currentUser(req), parse(listUsersQuerySchema, req.query)));
});
