import { z } from 'zod';

/** POST /auth/login. Also drives the login form's inline validation. */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email address.' })),
  password: z
    .string()
    .min(1, { error: 'Password is required.' })
    .max(200, { error: 'Password is too long.' }),
});

export type LoginInput = z.input<typeof loginSchema>;

/** Roles anyone can sign up for. ADMIN is never self-service: the seeded admin is the only one. */
export const SIGNUP_ROLES = ['PROJECT_MANAGER', 'TEAM_MEMBER', 'VIEWER'] as const;

/** POST /auth/register */
export const registerSchema = z.strictObject({
  name: z.string().trim().min(1, { error: 'Name is required.' }).max(100, { error: 'Name can be at most 100 characters.' }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email address.' }).max(255)),
  password: z
    .string()
    .min(8, { error: 'Password must be at least 8 characters.' })
    .max(128, { error: 'Password is too long.' }),
  role: z.enum(SIGNUP_ROLES, { error: 'Choose a role.' }),
});

export type RegisterInput = z.input<typeof registerSchema>;
