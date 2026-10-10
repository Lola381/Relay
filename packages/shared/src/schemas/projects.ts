import { z } from 'zod';
import { PROJECT_ROLES, SYSTEM_ROLES } from '../enums';
import { paginationQuerySchema } from './common';

const projectName = z
  .string()
  .trim()
  .min(1, { error: 'Name is required.' })
  .max(120, { error: 'Name can be at most 120 characters.' });

const description = z
  .string()
  .trim()
  .max(5000, { error: 'Description can be at most 5000 characters.' })
  .transform((value) => (value === '' ? null : value));

/** POST /projects (Admin) */
export const createProjectSchema = z.strictObject({
  name: projectName,
  description: description.nullish().transform((value) => value ?? null),
  managerIds: z
    .array(z.uuid())
    .max(20)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Managers must be unique.' }),
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;

/** PATCH /projects/:id: `version` is the one the client's edit was based on. */
export const updateProjectSchema = z
  .strictObject({
    version: z.number().int().min(1),
    name: projectName.optional(),
    description: description.nullable().optional(),
  })
  .refine((input) => input.name !== undefined || input.description !== undefined, {
    error: 'Nothing to update.',
  });
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const PROJECT_SORTS = ['name', '-name', 'createdAt', '-createdAt', 'updatedAt', '-updatedAt'] as const;

/** GET /projects */
export const listProjectsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(PROJECT_SORTS).default('-updatedAt'),
});
export type ListProjectsQuery = z.input<typeof listProjectsQuerySchema>;

// ── Members ──

/** POST /projects/:id/members */
export const addMemberSchema = z.strictObject({
  userId: z.uuid({ error: 'Choose a user.' }),
  role: z.enum(PROJECT_ROLES),
});
export type AddMemberInput = z.input<typeof addMemberSchema>;

/** PATCH /projects/:id/members/:userId */
export const changeMemberRoleSchema = z.strictObject({ role: z.enum(PROJECT_ROLES) });

/** GET /projects/:id/members */
export const listMembersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(PROJECT_ROLES).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
});

export const memberParamsSchema = z.object({ id: z.uuid(), userId: z.uuid() });

// ── User directory (Admin + PM: the member / manager pickers) ──

/** GET /users */
export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  role: z.enum(SYSTEM_ROLES).optional(),
  /** Comma list, e.g. `ADMIN,PROJECT_MANAGER` (the manager picker) */
  roles: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',') : undefined))
    .pipe(z.array(z.enum(SYSTEM_ROLES)).optional()),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  /** Only users who are NOT members of this project (the "add member" picker) */
  notInProject: z.uuid().optional(),
  sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('name'),
});
export type ListUsersQuery = z.input<typeof listUsersQuerySchema>;
