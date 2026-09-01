import type { Request, Response, NextFunction } from 'express';
import type { LeadSubmissionInput, LeadStatus } from '@aptentech/shared';
import { leadService, type LeadRequestContext } from '../services/lead.service';
import { leadRepository } from '../repositories/lead.repository';
import { auditRepository } from '../repositories/system.repository';
import { conversationService } from '../services/email/conversation.service';
import { notFound } from '../utils/errors';
import { ok, paginated } from '../utils/respond';
import { logger } from '../utils/logger';

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

/**
 * Attribution is read from headers the Next.js server forwards, not from the request body.
 * A client that posts its own `referrer` or `utm_source` cannot poison the record.
 */
function requestContext(req: Request): LeadRequestContext {
  const header = (name: string): string | undefined => {
    const v = req.header(name);
    return v && v.length < 2048 ? v : undefined;
  };

  return {
    ip: req.ip ?? null,
    userAgent: header('x-forwarded-user-agent') ?? req.header('user-agent') ?? null,
    referrer: header('x-lead-referrer') ?? null,
    utm: {
      source: header('x-lead-utm-source'),
      medium: header('x-lead-utm-medium'),
      campaign: header('x-lead-utm-campaign'),
      term: header('x-lead-utm-term'),
      content: header('x-lead-utm-content'),
    },
  };
}

export const leadController = {
  /**
   * Public lead submission.
   *
   * Always answers with the same success shape — for a genuine lead, a duplicate, or a
   * submission caught by the spam filter. A bot that can tell it was filtered simply
   * adjusts until it gets through, and a visitor whose message tripped a heuristic should
   * still see the confirmation the design promises rather than an error.
   */
  submit: asyncHandler(async (req, res) => {
    const input = req.body as LeadSubmissionInput;
    const result = await leadService.submit(input, requestContext(req));

    /*
      The thread is opened after the lead is stored, and its failure is swallowed.

      Order is the guarantee: by the time this runs the enquiry is already committed, so a
      mail provider that is down, misconfigured or slow costs a delayed notification and
      nothing else. Spam is excluded — it is kept for review, but auto-replying to it would
      mail whoever the spammer forged as the sender.
    */
    if (result.lead && !result.duplicate && !result.assessment.isSpam) {
      await conversationService.openThread(result.lead as never).catch((err: unknown) => {
        logger.error(
          { leadId: result.lead?.id, err: err instanceof Error ? err.message : String(err) },
          'Lead stored but its conversation could not be opened',
        );
      });
    }

    return ok(
      res,
      {
        received: true,
        message: 'Thank you. A senior engineer will read this and reply within one business day.',
        reference: result.lead && !result.assessment.isSpam ? result.lead.id : null,
      },
      201,
    );
  }),

  list: asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      pageSize: number;
      status: LeadStatus | 'ALL';
      search?: string;
      sourceForm?: string;
      from?: string;
      to?: string;
      sort: 'createdAt' | '-createdAt' | 'name' | '-name';
    };
    const { items, total } = await leadRepository.list(q);
    return paginated(res, items, total, q.page, q.pageSize);
  }),

  detail: asyncHandler(async (req, res) => {
    const lead = await leadRepository.findById(String(req.params.id));
    if (!lead) throw notFound('Lead not found');
    return ok(res, lead);
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { status } = req.body as { status: LeadStatus };

    const lead = await leadRepository.updateStatus(id, status);
    if (!lead) throw notFound('Lead not found');

    await auditRepository.record({
      adminId: req.session?.adminId,
      adminEmail: req.session?.email,
      action: 'LEAD_STATUS_CHANGE',
      entity: 'Lead',
      entityId: id,
      ip: req.ip ?? null,
    });

    return ok(res, lead);
  }),

  addNote: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { body } = req.body as { body: string };

    const lead = await leadRepository.addNote(id, {
      body,
      authorId: req.session!.adminId,
      authorName: req.session!.name,
    });
    if (!lead) throw notFound('Lead not found');

    await auditRepository.record({
      adminId: req.session?.adminId,
      adminEmail: req.session?.email,
      action: 'LEAD_NOTE_ADDED',
      entity: 'Lead',
      entityId: id,
      ip: req.ip ?? null,
    });

    return ok(res, lead);
  }),

  stats: asyncHandler(async (_req, res) => {
    return ok(res, await leadRepository.stats());
  }),

  exportCsv: asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      status: LeadStatus | 'ALL';
      search?: string;
      sourceForm?: string;
      from?: string;
      to?: string;
      sort: 'createdAt' | '-createdAt' | 'name' | '-name';
    };

    const leads = await leadRepository.listForExport(q);
    const csv = leadService.toCsv(leads as unknown as Array<Record<string, unknown>>);

    await auditRepository.record({
      adminId: req.session?.adminId,
      adminEmail: req.session?.email,
      action: 'LEAD_EXPORT',
      entity: 'Lead',
      entityId: null,
      ip: req.ip ?? null,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="aptentech-leads-${stamp}.csv"`);
    // BOM so Excel opens UTF-8 correctly rather than mangling accented names.
    return res.status(200).send(`﻿${csv}`);
  }),
};
