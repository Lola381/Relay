import { Router } from 'express';
import { createCommentSchema, listCommentsQuerySchema, uuidParamSchema } from '@pm/shared';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { parse } from '../../lib/validation';
import * as comments from './comments.service';

/** Mounted at /api/v1: task comments and comment deletion. */
export const commentsRouter = Router();
commentsRouter.use(authenticate);

commentsRouter.get('/tasks/:id/comments', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json(await comments.listComments(currentUser(req), id, parse(listCommentsQuerySchema, req.query)));
});

commentsRouter.post('/tasks/:id/comments', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  const comment = await comments.createComment(currentUser(req), id, parse(createCommentSchema, req.body));
  res.status(201).json({ data: comment });
});

commentsRouter.delete('/comments/:id', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  await comments.deleteComment(currentUser(req), id);
  res.status(204).end();
});
