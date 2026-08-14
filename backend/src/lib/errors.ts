/**
 * Error taxonomy matching the fixed table in 05_API_Spec "Common error codes".
 *
 * Route handlers throw these; a single wrapper converts them into the documented
 * `{ error: { code, message, fields? } }` envelope. Nothing else in the codebase
 * builds an error response by hand, which is what keeps the contract stable.
 */

import { API_ERROR_STATUS, type ApiErrorCode } from '@ims/shared-types';
import { ZodError } from 'zod';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  /** Extra context for the server log only — never serialised to the client. */
  readonly detail?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { fields?: Record<string, string>; detail?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = API_ERROR_STATUS[code];
    this.fields = options?.fields;
    this.detail = options?.detail;
  }
}

export const unauthorized = (message = 'Authentication is required.') =>
  new ApiError('UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have permission to do that.') =>
  new ApiError('FORBIDDEN', message);

export const notFound = (message = 'Not found.') => new ApiError('NOT_FOUND', message);

export const conflict = (message: string, fields?: Record<string, string>) =>
  new ApiError('CONFLICT', message, { fields });

export const validationError = (message: string, fields?: Record<string, string>) =>
  new ApiError('VALIDATION_ERROR', message, { fields });

export const rateLimited = (message = 'Too many requests. Try again shortly.') =>
  new ApiError('RATE_LIMITED', message);

export const serverError = (message = 'Something went wrong.', detail?: Record<string, unknown>) =>
  new ApiError('SERVER_ERROR', message, { detail });

/**
 * Flattens a Zod error into the documented `fields` map.
 *
 * Only the first issue per path is kept: the mobile client renders one message
 * under each input, and showing three complaints about the same field is noise.
 * Array and nested paths are joined with dots (`attendance.0.clientId`).
 */
export function zodErrorToFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_';
    if (!(path in fields)) {
      fields[path] = issue.message;
    }
  }
  return fields;
}

export function fromZodError(error: ZodError, message = 'Invalid request'): ApiError {
  return validationError(message, zodErrorToFields(error));
}

/**
 * Normalises anything thrown inside a handler into an ApiError.
 *
 * Unknown errors deliberately collapse to a generic SERVER_ERROR message: leaking
 * a Prisma stack trace or constraint name to the client would expose schema
 * internals. The original error is preserved in `detail` for the server log.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) return fromZodError(error);

  if (error instanceof Error) {
    return serverError('Something went wrong.', {
      originalMessage: error.message,
      stack: error.stack,
    });
  }

  return serverError('Something went wrong.', { original: String(error) });
}
