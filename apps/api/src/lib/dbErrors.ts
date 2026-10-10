// Turns PostgreSQL constraint violations into API errors (docs/IMPLEMENTATION_PLAN.md §3.5).
// Services check these cases up front for friendly messages; this mapping is the safety net for
// races between those checks and the write (e.g. two admins adding the same member at once).
import { ERROR_CODES } from '@pm/shared';
import { AppError } from './errors';

interface PgError {
  code: string;
  constraint?: string;
}

/** Drizzle wraps the driver error in `.cause`; walk the chain to find the PostgreSQL error. */
function findPgError(err: unknown): PgError | null {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === 'object' && 'code' in current && typeof current.code === 'string' && /^[0-9A-Z]{5}$/.test(current.code)) {
      return current as PgError;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** Unique / foreign-key constraints with a specific meaning for the API. */
const CONSTRAINT_ERRORS: Record<string, () => AppError> = {
  users_email_lower_uq: () =>
    new AppError(409, ERROR_CODES.EMAIL_TAKEN, 'This email is already in use.'),
  projects_active_name_uq: () =>
    new AppError(409, ERROR_CODES.PROJECT_NAME_TAKEN, 'A project with this name already exists.'),
  project_members_pkey: () =>
    new AppError(409, ERROR_CODES.ALREADY_MEMBER, 'This user is already a member of the project.'),
  tasks_assignee_member_fk: () =>
    new AppError(400, ERROR_CODES.INVALID_ASSIGNEE, 'The assignee must be a member of this project.'),
  comments_task_id_tasks_id_fk: () =>
    new AppError(404, ERROR_CODES.TASK_DELETED, 'This task has been deleted.'),
};

/** Returns an AppError for a known database error, or null if it should stay a 500. */
export function mapDatabaseError(err: unknown): AppError | null {
  const pg = findPgError(err);
  if (!pg) return null;

  const specific = pg.constraint ? CONSTRAINT_ERRORS[pg.constraint] : undefined;
  if (specific) return specific();

  switch (pg.code) {
    case '23505': // unique_violation
      return new AppError(409, ERROR_CODES.CONFLICT, 'This conflicts with an existing record.');
    case '23503': // foreign_key_violation
      return new AppError(404, ERROR_CODES.NOT_FOUND, 'A related record no longer exists.');
    case '23514': // check_violation
    case '23502': // not_null_violation
    case '22001': // string too long
      return new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Some values are invalid.');
    case '22P02': // invalid text representation (e.g. a malformed uuid that slipped past validation)
      return new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Invalid identifier.');
    case '40P01': // deadlock_detected
    case '40001': // serialization_failure
      return new AppError(409, ERROR_CODES.CONFLICT, 'Another change happened at the same time. Please try again.');
    default:
      return null;
  }
}
