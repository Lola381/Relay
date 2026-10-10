import { Router } from 'express';
import {
  addMemberSchema,
  changeMemberRoleSchema,
  createProjectSchema,
  listMembersQuerySchema,
  listProjectsQuerySchema,
  memberParamsSchema,
  updateProjectSchema,
  uuidParamSchema,
  type ApiResponse,
  type Project,
  type ProjectMember,
} from '@pm/shared';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { parse } from '../../lib/validation';
import * as members from './members.service';
import * as projects from './projects.service';

export const projectsRouter = Router();
projectsRouter.use(authenticate);

// ── Projects ──

projectsRouter.get('/', async (req, res) => {
  res.json(await projects.listProjects(currentUser(req), parse(listProjectsQuerySchema, req.query)));
});

projectsRouter.post('/', async (req, res) => {
  const project = await projects.createProject(currentUser(req), parse(createProjectSchema, req.body));
  res.status(201).json({ data: project } satisfies ApiResponse<Project>);
});

projectsRouter.get('/:id', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json({ data: await projects.getProject(currentUser(req), id) } satisfies ApiResponse<Project>);
});

projectsRouter.patch('/:id', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  const project = await projects.updateProject(currentUser(req), id, parse(updateProjectSchema, req.body));
  res.json({ data: project } satisfies ApiResponse<Project>);
});

projectsRouter.post('/:id/archive', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json({ data: await projects.setArchived(currentUser(req), id, true) } satisfies ApiResponse<Project>);
});

projectsRouter.post('/:id/unarchive', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json({ data: await projects.setArchived(currentUser(req), id, false) } satisfies ApiResponse<Project>);
});

projectsRouter.delete('/:id', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  await projects.deleteProject(currentUser(req), id);
  res.status(204).end();
});

// ── Members ──

projectsRouter.get('/:id/members', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  res.json(await members.listMembers(currentUser(req), id, parse(listMembersQuerySchema, req.query)));
});

projectsRouter.post('/:id/members', async (req, res) => {
  const { id } = parse(uuidParamSchema, req.params);
  const member = await members.addMember(currentUser(req), id, parse(addMemberSchema, req.body));
  res.status(201).json({ data: member } satisfies ApiResponse<ProjectMember>);
});

projectsRouter.patch('/:id/members/:userId', async (req, res) => {
  const { id, userId } = parse(memberParamsSchema, req.params);
  const { role } = parse(changeMemberRoleSchema, req.body);
  const member = await members.changeMemberRole(currentUser(req), id, userId, role);
  res.json({ data: member } satisfies ApiResponse<ProjectMember>);
});

projectsRouter.delete('/:id/members/:userId', async (req, res) => {
  const { id, userId } = parse(memberParamsSchema, req.params);
  await members.removeMember(currentUser(req), id, userId);
  res.status(204).end();
});
