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
