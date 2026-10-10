import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ERROR_CODES, type ApiErrorBody } from '@pm/shared';
import { AppError } from '../lib/errors';

/** Unknown routes → 404 in the standard error shape. */
export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: { code: ERROR_CODES.NOT_FOUND, message: `Route ${req.method} ${req.path} not found.` },
  };
  res.status(404).json(body);
};

/** Body-parser errors carry a `type` and an HTTP `status`. */
function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

/**
 * Last middleware in the chain. Express 5 forwards rejected promises from async handlers here,
 * so route code can simply `throw`.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = {
    error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Something went wrong. Please try again.' },
  };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (isBodyParserError(err) && err.type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: ERROR_CODES.INVALID_JSON, message: 'Request body is not valid JSON.' } };
  } else if (isBodyParserError(err) && err.type === 'entity.too.large') {
    status = 413;
    body = { error: { code: ERROR_CODES.PAYLOAD_TOO_LARGE, message: 'Request body is too large.' } };
  }

  // Unexpected errors are logged with the request id; internals never reach the client.
  if (status >= 500) req.log.error({ err }, 'Unhandled error');

  res.status(status).json(body);
};
