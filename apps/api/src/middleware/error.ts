import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { isProd } from '../config/env';
import { MAX_ATTACHMENT_MB } from '@aptentech/shared';

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

  /*
    Upload limits, refused by multer before any handler runs.

    These were falling through to the generic 500, so someone attaching a file one megabyte
    over the limit was told "Something went wrong. Please try again." — advice that cannot
    work, for a problem they could have fixed in seconds had anyone said what it was. The
    service's own size check never got the chance to produce its message, because multer
    rejects the stream while it is still arriving.

    Every code here maps to something the sender can act on, which is the point.
  */
  if (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'MulterError') {
    const code = (err as { code?: string }).code;

    const [status, message] =
      code === 'LIMIT_FILE_SIZE'
        ? ([413, `Files must be under ${MAX_ATTACHMENT_MB} MB.`] as const)
        : code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE'
          ? ([400, 'Please attach one file per upload.'] as const)
          : ([400, 'That upload could not be read.'] as const);

    logger.warn({ code, path: req.path }, 'Upload refused by the size or shape limits');
    res.status(status).json({ success: false, error: { code: code ?? 'UPLOAD_REJECTED', message } });
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
