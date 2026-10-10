// Every expected failure is thrown as an AppError and turned into the standard
// `{ error: { code, message, details } }` body by middleware/errorHandler.ts.
import { ERROR_CODES, type ErrorCode } from '@pm/shared';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);

export const unauthenticated = (message = 'Authentication required.') =>
  new AppError(401, ERROR_CODES.UNAUTHENTICATED, message);

export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppError(403, ERROR_CODES.FORBIDDEN, message);

export const notFound = (message = 'Resource not found.') =>
  new AppError(404, ERROR_CODES.NOT_FOUND, message);

export const conflict = (message: string, code: ErrorCode = ERROR_CODES.CONFLICT, details?: unknown) =>
  new AppError(409, code, message, details);
