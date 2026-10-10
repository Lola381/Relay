import { z } from 'zod';
import { SYSTEM_ROLES } from '../enums';
import { paginationQuerySchema } from './common';

const name = z.string().trim().min(1, { error: 'Name is required.' }).max(100, { error: 'Name can be at most 100 characters.' });

/** POST /users (Admin) */
export const createUserSchema = z.strictObject({
  name,
  email: z.email({ error: 'Enter a valid email address.' }).trim().toLowerCase().max(255),
  password: z.string().min(8, { error: 'Password must be at least 8 characters.' }).max(128),
  role: z.enum(SYSTEM_ROLES),
});

/** PATCH /users/:id (Admin) */
export const updateUserSchema = z
  .strictObject({
    name: name.optional(),
    role: z.enum(SYSTEM_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: 'Nothing to update.' });

/** GET /notifications */
export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

/** GET /projects/:id/activity, GET /activity */
export const listActivityQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

/** PATCH /me: your own name and avatar (never your role or email). */
export const updateProfileSchema = z
  .strictObject({
    name: name.optional(),
    avatarUrl: z
      .union([z.url({ error: 'Enter a valid image URL.' }).max(2000), z.literal('')])
      .nullable()
      .optional()
      .transform((v) => (v === '' ? null : v)),
  })
  .refine((v) => v.name !== undefined || v.avatarUrl !== undefined, { error: 'Nothing to update.' });

/** PUT /me/password */
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1, { error: 'Enter your current password.' }).max(200),
  newPassword: z
    .string()
    .min(8, { error: 'Password must be at least 8 characters.' })
    .max(128, { error: 'Password is too long.' }),
});
