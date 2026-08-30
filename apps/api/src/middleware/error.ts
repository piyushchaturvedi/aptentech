import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { isProd } from '../config/env';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
}

/**
 * The single exit point for every error.
 *
 * Known `AppError`s carry a safe message written for a person. Everything else is logged
 * in full server-side and reported to the client as a generic INTERNAL_ERROR — stack
 * traces, Mongo driver messages, duplicate-key details and file paths never cross the API
 * boundary, because each of them tells an attacker something about the system.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err, path: req.path }, 'Application error');
    }
    res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  // Mongo duplicate key — surface as a conflict without echoing the index or value.
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    logger.warn({ err, path: req.path }, 'Duplicate key');
    res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'That value is already in use' },
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ success: false, error: { code: 'MALFORMED_JSON', message: 'Malformed request body' } });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
      ...(isProd ? {} : { details: { dev: [String((err as Error)?.message ?? err)] } }),
    },
  });
}
