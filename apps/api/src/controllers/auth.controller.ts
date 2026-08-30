import type { Request, Response, NextFunction } from 'express';
import { AdminUserModel } from '../models';
import { adminRepository, auditRepository } from '../repositories/system.repository';
import { burnTime, hashPassword, verifyPassword } from '../auth/password';
import {
  SESSION_COOKIE,
  createSession,
  destroyAllSessionsFor,
  destroySession,
  sessionCookieOptions,
} from '../auth/session';
import { unauthorized, forbidden, badRequest } from '../utils/errors';
import { ok } from '../utils/respond';
import { logger } from '../utils/logger';

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

const LOCK_AFTER_ATTEMPTS = 8;
const LOCK_DURATION_MS = 15 * 60 * 1000;

/** One message for every failure mode, so responses cannot be used to enumerate accounts. */
const GENERIC_FAILURE = 'Email or password is incorrect';

export const authController = {
  login: asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const ip = req.ip ?? null;

    const admin = await adminRepository.findByEmailWithSecrets(email);

    if (!admin) {
      // Spend comparable time so a missing account is not detectable by response latency.
      await burnTime();
      await auditRepository.record({
        action: 'LOGIN_FAILED',
        entity: 'AdminUser',
        adminEmail: email,
        result: 'FAILURE',
        ip,
      });
      throw unauthorized(GENERIC_FAILURE);
    }

    if (admin.lockedUntil && new Date(admin.lockedUntil).getTime() > Date.now()) {
      await auditRepository.record({
        adminId: String(admin._id),
        adminEmail: email,
        action: 'LOGIN_BLOCKED_LOCKED',
        entity: 'AdminUser',
        result: 'FAILURE',
        ip,
      });
      throw forbidden('This account is temporarily locked after repeated failed sign-ins. Try again in a few minutes.');
    }

    if (!admin.active) {
      await burnTime();
      throw unauthorized(GENERIC_FAILURE);
    }

    const valid = await verifyPassword(admin.passwordHash, password);
    if (!valid) {
      await adminRepository.registerFailedAttempt(String(admin._id), LOCK_AFTER_ATTEMPTS, LOCK_DURATION_MS);
      await auditRepository.record({
        adminId: String(admin._id),
        adminEmail: email,
        action: 'LOGIN_FAILED',
        entity: 'AdminUser',
        result: 'FAILURE',
        ip,
      });
      throw unauthorized(GENERIC_FAILURE);
    }

    await adminRepository.clearFailedAttempts(String(admin._id));

    const { token, csrfToken, expiresAt } = await createSession(String(admin._id), {
      ip,
      userAgent: req.header('user-agent') ?? null,
    });

    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

    await auditRepository.record({
      adminId: String(admin._id),
      adminEmail: email,
      action: 'LOGIN_SUCCESS',
      entity: 'AdminUser',
      ip,
    });
    logger.info({ adminId: String(admin._id) }, 'Admin signed in');

    return ok(res, {
      user: {
        id: String(admin._id),
        email: admin.email,
        name: admin.name,
        role: admin.role,
        mustChangePassword: Boolean(admin.mustChangePassword),
      },
      // The CSRF token is returned in the body, not a cookie, so a cross-site page
      // cannot read it — that asymmetry is what makes double-submit work.
      csrfToken,
    });
  }),

  logout: asyncHandler(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    await destroySession(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });

    if (req.session) {
      await auditRepository.record({
        adminId: req.session.adminId,
        adminEmail: req.session.email,
        action: 'LOGOUT',
        entity: 'AdminUser',
        ip: req.ip ?? null,
      });
    }
    return ok(res, { signedOut: true });
  }),

  me: asyncHandler(async (req, res) => {
    const s = req.session!;
    return ok(res, {
      user: {
        id: s.adminId,
        email: s.email,
        name: s.name,
        role: s.role,
        mustChangePassword: s.mustChangePassword,
      },
      csrfToken: s.csrfToken,
    });
  }),

  changePassword: asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const session = req.session!;

    const admin = await adminRepository.findByIdWithSecrets(session.adminId);
    if (!admin) throw unauthorized();

    const valid = await verifyPassword(admin.passwordHash, currentPassword);
    if (!valid) {
      await auditRepository.record({
        adminId: session.adminId,
        adminEmail: session.email,
        action: 'PASSWORD_CHANGE_FAILED',
        entity: 'AdminUser',
        result: 'FAILURE',
        ip: req.ip ?? null,
      });
      throw badRequest('Your current password is incorrect', { currentPassword: ['Incorrect password'] });
    }

    if (await verifyPassword(admin.passwordHash, newPassword)) {
      throw badRequest('Choose a password you have not used here before', {
        newPassword: ['This is your current password'],
      });
    }

    await AdminUserModel.updateOne(
      { _id: session.adminId },
      { $set: { passwordHash: await hashPassword(newPassword), mustChangePassword: false } },
    );

    // Every other device is signed out, so a stolen session cannot outlive the change.
    await destroyAllSessionsFor(session.adminId, session.sessionId);

    await auditRepository.record({
      adminId: session.adminId,
      adminEmail: session.email,
      action: 'PASSWORD_CHANGED',
      entity: 'AdminUser',
      ip: req.ip ?? null,
    });

    return ok(res, { changed: true });
  }),
};
