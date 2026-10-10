import { Router } from 'express';
import {
  changeAssigneeSchema,
  changeStatusSchema,
  createTaskSchema,
  listTasksQuerySchema,
  myTasksQuerySchema,
  updateTaskSchema,
  uuidParamSchema,
} from '@pm/shared';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { parse } from '../../lib/validation';
import * as tasks from './tasks.service';

/** Mounted at /api/v1: project-scoped list/create, task-scoped reads and writes. */
export const tasksRouter = Router();
tasksRouter.use(authenticate);

tasksRouter.get('/projects/:id/tasks', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json(await tasks.listTasks(currentUser(req), id, parse(listTasksQuerySchema, req.query)));
});

tasksRouter.post('/projects/:id/tasks', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.status(201).json({ data: await tasks.createTask(currentUser(req), id, parse(createTaskSchema, req.body)) });
});

tasksRouter.get('/me/tasks', async (req, res) => {
  res.json(await tasks.myTasks(currentUser(req), parse(myTasksQuerySchema, req.query)));
});

tasksRouter.get('/tasks/:id', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json({ data: await tasks.getTask(currentUser(req), id) });
});

tasksRouter.patch('/tasks/:id', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json({ data: await tasks.updateTask(currentUser(req), id, parse(updateTaskSchema, req.body)) });
});

tasksRouter.patch('/tasks/:id/status', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json({ data: await tasks.changeStatus(currentUser(req), id, parse(changeStatusSchema, req.body)) });
});

tasksRouter.patch('/tasks/:id/assignee', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json({ data: await tasks.changeAssignee(currentUser(req), id, parse(changeAssigneeSchema, req.body)) });
});

tasksRouter.delete('/tasks/:id', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  await tasks.deleteTask(currentUser(req), id);
  res.status(204).end();
});
