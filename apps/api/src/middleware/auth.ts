import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../utils/errors';
import { CSRF_HEADER, SESSION_COOKIE, resolveSession, safeEqual, type SessionContext } from '../auth/session';
import type { AdminRole } from '@aptentech/shared';

declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionContext;
  }
}

/**
 * Service-token gate for read endpoints called by the Next.js server.
 *
 * The public site is server-rendered, so a browser never calls this API directly — only
 * the Next.js server does, presenting a token that is never shipped to the client. This
 * keeps the CMS read API off the public internet even though the content it returns is
 * ultimately public.
 */
export function requireServiceToken(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.header('x-api-key') ?? '';
  const expected = env.API_SERVICE_TOKEN;

  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();

  if (!crypto.timingSafeEqual(a, b)) {
    next(unauthorized('Invalid service credentials'));
    return;
  }
  next();
}

/**
 * Admin authentication.
 *
 * This runs independently of anything Next.js middleware does. Next.js redirects
 * unauthenticated users for UX; this is what actually enforces access, and it re-reads
 * the account from the database on every request rather than trusting the cookie's claims.
 */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const session = await resolveSession(token);
    if (!session) {
      next(unauthorized('Please sign in again'));
      return;
    }
    req.session = session;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Double-submit CSRF check on every state-changing admin request.
 *
 * The session cookie is SameSite=Lax, which already blocks cross-site form POSTs, but a
 * token the attacker's page cannot read is what makes this robust rather than reliant on
 * one browser behaviour.
 */
export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const supplied = req.header(CSRF_HEADER) ?? '';
  const expected = req.session?.csrfToken ?? '';
  if (!supplied || !expected || !safeEqual(supplied, expected)) {
    next(forbidden('Your session has expired. Please refresh and try again.'));
    return;
  }
  next();
}

const RANK: Record<AdminRole, number> = { EDITOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

/** Role gate. Roles come from the database record, never from client input. */
export function requireRole(minimum: AdminRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.session?.role;
    if (!role) {
      next(unauthorized());
      return;
    }
    if (RANK[role] < RANK[minimum]) {
      next(forbidden());
      return;
    }
    next();
  };
}

/**
 * Blocks normal work while a forced password change is outstanding, so a seeded or
 * reset account cannot be used until its temporary password has been replaced.
 */
export function blockIfPasswordChangeRequired(req: Request, _res: Response, next: NextFunction): void {
  if (req.session?.mustChangePassword) {
    next(forbidden('Please set a new password before continuing'));
    return;
  }
  next();
}
