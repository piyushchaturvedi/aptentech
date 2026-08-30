import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { badRequest } from '../utils/errors';

type Source = 'body' | 'query' | 'params';

function flatten(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Parses one part of the request through a zod schema and *replaces* it with the parsed
 * result.
 *
 * The replacement is the important part. Downstream code then works with values that are
 * known to be the right primitive type, which is what stops `?status[$ne]=NEW` — parsed by
 * Express into an object — from ever reaching a Mongo filter as an operator.
 */
export function validate(schema: ZodTypeAny, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(badRequest('Please check the highlighted fields', flatten(result.error)));
      return;
    }
    if (source === 'query') {
      // req.query has only a getter on Express 5; assign per-key to stay compatible.
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}
