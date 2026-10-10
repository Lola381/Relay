import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from '../enums';
import { paginationQuerySchema } from './common';

const title = z
  .string()
  .trim()
  .min(1, { error: 'Title is required.' })
  .max(200, { error: 'Title can be at most 200 characters.' });

const description = z
  .string()
  .trim()
  .max(10000, { error: 'Description can be at most 10,000 characters.' })
  .transform((value) => (value === '' ? null : value));

/** Calendar day "YYYY-MM-DD" (a due date is a day, not an instant). */
const isoDate = z.iso.date({ error: 'Use a valid date (YYYY-MM-DD).' });

const version = z.number().int().min(1);

/** POST /projects/:id/tasks */
export const createTaskSchema = z.strictObject({
  title,
  description: description.nullish().transform((v) => v ?? null),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  status: z.enum(TASK_STATUSES).default('TODO'),
  assigneeId: z.uuid().nullish().transform((v) => v ?? null),
  dueDate: isoDate.nullish().transform((v) => v ?? null),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

/** PATCH /tasks/:id (details). Members may only send `description` for their own task. */
export const updateTaskSchema = z
  .strictObject({
    version,
    title: title.optional(),
    description: description.nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueDate: isoDate.nullable().optional(),
  })
  .refine((t) => Object.keys(t).some((k) => k !== 'version'), { error: 'Nothing to update.' });
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

/** PATCH /tasks/:id/status */
export const changeStatusSchema = z.strictObject({ version, status: z.enum(TASK_STATUSES) });

/** PATCH /tasks/:id/assignee */
export const changeAssigneeSchema = z.strictObject({ version, assigneeId: z.uuid().nullable() });

const commaList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.enum(values)).optional());

export const TASK_SORTS = [
  'updatedAt',
  '-updatedAt',
  'createdAt',
  '-createdAt',
  'dueDate',
  '-dueDate',
  'priority',
  '-priority',
] as const;

/** GET /projects/:id/tasks */
export const listTasksQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  status: commaList(TASK_STATUSES),
  priority: commaList(TASK_PRIORITIES),
  /** a user id, `me`, or `none` (unassigned) */
  assigneeId: z.union([z.uuid(), z.literal('me'), z.literal('none')]).optional(),
  search: z.string().trim().max(200).optional(),
  dueBefore: isoDate.optional(),
  dueAfter: isoDate.optional(),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sort: z.enum(TASK_SORTS).default('-updatedAt'),
});
export type ListTasksQuery = z.input<typeof listTasksQuerySchema>;

/** GET /me/tasks */
export const myTasksQuerySchema = paginationQuerySchema.extend({
  status: commaList(TASK_STATUSES),
  projectId: z.uuid().optional(),
});

// ── Comments ──

/** POST /tasks/:id/comments. Mentions are `@[Name](userId)` tokens inside the body. */
export const createCommentSchema = z.strictObject({
  body: z
    .string()
    .trim()
    .min(1, { error: 'Write a comment first.' })
    .max(5000, { error: 'Comments can be at most 5000 characters.' }),
});

export const listCommentsQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
