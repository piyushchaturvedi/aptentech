/**
 * Application errors.
 *
 * Every error that reaches a client is one of these, carrying a stable machine-readable
 * `code` and a message written for a person. Anything else is treated as unexpected and
 * reported as a generic INTERNAL_ERROR, so stack traces, driver messages and query
 * internals never cross the API boundary.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message = 'Invalid request', details?: Record<string, string[]>) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (message = 'That already exists') => new AppError(409, 'CONFLICT', message);

export const tooManyRequests = (message = 'Too many requests. Please try again shortly.') =>
  new AppError(429, 'RATE_LIMITED', message);

export const payloadTooLarge = (message = 'That file is too large') =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', message);
