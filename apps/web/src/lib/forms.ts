import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api/client';

/**
 * Maps a server error onto the form: per-field details (400 validation, 409 name taken…) go to
 * their inputs; anything else is returned as a message for the form-level band.
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  let mapped = false;
  if (Array.isArray(err.details)) {
    for (const detail of err.details as { path?: string; message?: string }[]) {
      if (detail.path && fields.includes(detail.path as Path<T>)) {
        setError(detail.path as Path<T>, { message: detail.message ?? err.message });
        mapped = true;
      }
    }
  }
  return mapped ? null : err.message;
}
