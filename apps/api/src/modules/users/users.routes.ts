import { Router } from 'express';
import { createUserSchema, listUsersQuerySchema, updateUserSchema, uuidParamSchema } from '@pm/shared';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { parse } from '../../lib/validation';
import { createUser, listUsers, updateUser } from './users.service';

export const usersRouter = Router();
usersRouter.use(authenticate);

/** Directory for the pickers (Admin + Project managers) and the Admin users page. */
usersRouter.get('/', async (req, res) => {
  res.json(await listUsers(currentUser(req), parse(listUsersQuerySchema, req.query)));
});

usersRouter.post('/', async (req, res) => {
  res.status(201).json({ data: await createUser(currentUser(req), parse(createUserSchema, req.body)) });
});

usersRouter.patch('/:id', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json({ data: await updateUser(currentUser(req), id, parse(updateUserSchema, req.body)) });
});
