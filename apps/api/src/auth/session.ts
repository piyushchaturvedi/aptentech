import crypto from 'node:crypto';
import { trusted } from 'mongoose';
import { env } from '../config/env';
import { SessionModel, AdminUserModel } from '../models';
import type { AdminRole } from '@aptentech/shared';

/**
 * Server-side sessions.
 *
 * A stateless JWT cannot be revoked before it expires. For a CMS where an account can
 * delete content, being able to kill a session immediately — on logout, on a role change,
 * on suspicion of compromise — matters more than avoiding a session lookup, so sessions
 * are records in Mongo and the cookie carries only an opaque token.
 *
 * Only the SHA-256 of that token is stored, so a database dump yields no usable sessions.
 */

export const SESSION_COOKIE = 'aptentech_admin_session';
export const CSRF_HEADER = 'x-csrf-token';

export interface SessionContext {
  sessionId: string;
  adminId: string;
  email: string;
  name: string;
  role: AdminRole;
  mustChangePassword: boolean;
  csrfToken: string;
}

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createSession(
  adminId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
  const token = newToken();
  const csrfToken = newToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

  await SessionModel.create({
    tokenHash: sha256(token),
    adminId,
    csrfToken,
    expiresAt,
    lastSeenAt: new Date(),
    ip: meta.ip ?? null,
    userAgent: (meta.userAgent ?? '').slice(0, 400) || null,
  });

  return { token, csrfToken, expiresAt };
}

/**
 * Resolves a cookie token to a live session, enforcing both the absolute lifetime and the
 * idle timeout. Returns null for anything expired, revoked, or belonging to a deactivated
 * account — the role is re-read from the database on every request rather than trusted
 * from the cookie, so deactivating a user takes effect on their next call.
 */
export async function resolveSession(token: string | undefined): Promise<SessionContext | null> {
  if (!token) return null;

  const session = await SessionModel.findOne({ tokenHash: sha256(token) });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  const idleMs = env.SESSION_IDLE_MINUTES * 60 * 1000;
  if (now - new Date(session.lastSeenAt).getTime() > idleMs) {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  const admin = await AdminUserModel.findById(session.adminId).lean();
  if (!admin || !admin.active) {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  // Sliding idle window.
  await SessionModel.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } });

  return {
    sessionId: String(session._id),
    adminId: String(admin._id),
    email: admin.email,
    name: admin.name,
    role: admin.role as AdminRole,
    mustChangePassword: Boolean(admin.mustChangePassword),
    csrfToken: session.csrfToken,
  };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await SessionModel.deleteOne({ tokenHash: sha256(token) });
}

/** Used after a password change so other devices are signed out. */
export async function destroyAllSessionsFor(adminId: string, keepSessionId?: string): Promise<void> {
  const filter: Record<string, unknown> = { adminId };
  if (keepSessionId) filter._id = trusted({ $ne: keepSessionId });
  await SessionModel.deleteMany(filter);
}

/**
 * Whether the site is actually reached over TLS.
 *
 * Derived from the public URL rather than from `NODE_ENV`, which only says the build is a
 * production build — not that anything terminates TLS in front of it. A production build
 * served over plain HTTP (an IP address before the domain and certificate exist) would
 * otherwise set `secure` on the session cookie, the browser would refuse to send it back, and
 * signing in would fail with no error anywhere: the request simply arrives unauthenticated.
 */
export const servedOverHttps = env.PUBLIC_SITE_URL.startsWith('https://');

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    // Lax still sends the cookie on top-level navigation to /admin, while blocking it on
    // cross-site POSTs — which, combined with the CSRF token, closes CSRF properly.
    sameSite: 'lax' as const,
    secure: servedOverHttps,
    path: '/',
    domain: env.COOKIE_DOMAIN || undefined,
    expires: expiresAt,
  };
}

/** Timing-safe comparison for CSRF tokens. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
