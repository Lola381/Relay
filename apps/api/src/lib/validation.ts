import type { z } from 'zod';
import { badRequest } from './errors';

export interface FieldError {
  path: string;
  message: string;
}

/**
 * Validates untrusted input (body / query / params) with a shared Zod schema and returns the
 * typed, transformed result. Failure → 400 VALIDATION_ERROR with one entry per invalid field,
 * which the web forms map back onto their inputs.
 */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const details: FieldError[] = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  throw badRequest('Some fields are invalid.', details);
}
