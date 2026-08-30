import pino from 'pino';
import { env, isProd } from '../config/env';

/**
 * Structured logging. `redact` is a safety net rather than the primary control — we never
 * deliberately log credentials — but a stray `req.headers` or `req.body` in a debug log
 * must not leak a session cookie or password.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'password',
      'newPassword',
      'currentPassword',
      'passwordHash',
      'token',
      'sessionToken',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[redacted]',
  },
  transport: isProd ? undefined : { target: 'pino/file', options: { destination: 1 } },
});
