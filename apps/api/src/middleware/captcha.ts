import type { NextFunction, Request, Response } from 'express';
import { captchaService } from '../services/captcha.service';
import { badRequest } from '../utils/errors';

/**
 * Refuses an enquiry that does not carry a correctly answered challenge.
 *
 * Mounted on the public lead route, after validation — a body that is not a lead should be
 * rejected as malformed rather than as a failed captcha, and there is no point spending a
 * challenge on one.
 *
 * It applies to every form type rather than only the one the change was asked for. The form
 * a submission claims to come from is a field in the request body, so a rule that exempted
 * one of them would be a rule a script could opt into by changing a string.
 *
 * The error is shaped exactly like a validation error, keyed on `captcha`, because that is
 * what the forms already know how to display: the message appears under the question and
 * the rest of what the visitor typed stays on screen. A challenge is spent whether or not
 * the answer was right, so the form asks for a new one as soon as this comes back.
 */
export function requireCaptcha(req: Request, _res: Response, next: NextFunction): void {
  const body = req.body as { captchaId?: unknown; captchaAnswer?: unknown } | undefined;

  if (captchaService.verify(body?.captchaId, body?.captchaAnswer)) {
    next();
    return;
  }

  next(
    badRequest('Please answer the verification question', {
      captcha: ['That answer was not right. Please try the new question.'],
    }),
  );
}
