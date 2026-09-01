/**
 * Admin email: templates, replies, delivery status and the inbound review queue.
 */
import type { Request, Response, NextFunction } from 'express';
import { Types, trusted } from 'mongoose';
import type { AdminReplyInput, EmailTemplateInput, InboundEmailInput, TemplateKind } from '@aptentech/shared';
import { TEMPLATE_VARIABLES } from '@aptentech/shared';
import { ConversationModel, EmailTemplateModel, LeadModel } from '../models';
import {
  conversationService,
  contextForLead,
  emailSettings,
} from '../services/email/conversation.service';
import { htmlToText, renderTemplate, sanitizeEmailHtml } from '../services/email/template';
import { inboundService, verifyInboundSignature } from '../services/email/inbound.service';
import { auditRepository } from '../repositories/system.repository';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { ok } from '../utils/respond';
import { env } from '../config/env';

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

/** The admin identity express-auth attached, used for attribution on writes. */
function actor(req: Request): { id: string; email: string; name: string } {
  const admin = (req as unknown as { admin?: { id: string; email: string; name: string } }).admin;
  return admin ?? { id: '', email: '', name: 'Administrator' };
}

export const emailController = {
  /* ---------------------------------------------------------------- templates */

  listTemplates: asyncHandler(async (_req, res) => {
    const templates = await EmailTemplateModel.find().sort({ kind: 1, updatedAt: -1 }).lean();
    return ok(res, { templates, variables: TEMPLATE_VARIABLES });
  }),

  getTemplate: asyncHandler(async (req, res) => {
    const template = await EmailTemplateModel.findById(String(req.params.id)).lean();
    if (!template) throw notFound('Template not found');
    return ok(res, template);
  }),

  createTemplate: asyncHandler(async (req, res) => {
    const input = req.body as EmailTemplateInput;
    const who = actor(req);

    const template = await EmailTemplateModel.create({
      ...input,
      // Only the seed marks a template built-in; one created here never fills a system slot
      // implicitly, so it can always be deleted again.
      builtIn: false,
      text: input.text || htmlToText(input.html),
      updatedBy: who.id ? new Types.ObjectId(who.id) : null,
    });

    await auditRepository.record({
      adminId: who.id,
      adminEmail: who.email,
      action: 'email_template.create',
      entity: 'EmailTemplate',
      entityId: String(template._id),
      result: 'SUCCESS',
      ip: req.ip ?? null,
    });

    return ok(res, template, 201);
  }),

  updateTemplate: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = req.body as EmailTemplateInput;
    const who = actor(req);

    const existing = await EmailTemplateModel.findById(id);
    if (!existing) throw notFound('Template not found');

    /*
      A built-in template's slot is fixed.

      The application sends by kind, so letting an editor retype `kind` on the confirmation
      template would leave that slot empty and silently stop client confirmations. The
      wording is theirs to change; which message it is, is not.
    */
    if (existing.builtIn && input.kind !== existing.kind) {
      throw badRequest('A built-in template cannot change its type');
    }

    existing.set({
      ...input,
      text: input.text || htmlToText(input.html),
      updatedBy: who.id ? new Types.ObjectId(who.id) : null,
    });
    await existing.save();

    await auditRepository.record({
      adminId: who.id,
      adminEmail: who.email,
      action: 'email_template.update',
      entity: 'EmailTemplate',
      entityId: id,
      result: 'SUCCESS',
      ip: req.ip ?? null,
    });

    return ok(res, existing.toJSON());
  }),

  deleteTemplate: asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const template = await EmailTemplateModel.findById(id);
    if (!template) throw notFound('Template not found');
    if (template.builtIn) throw forbidden('A built-in template cannot be deleted. Deactivate it instead.');

    await template.deleteOne();

    const who = actor(req);
    await auditRepository.record({
      adminId: who.id,
      adminEmail: who.email,
      action: 'email_template.delete',
      entity: 'EmailTemplate',
      entityId: id,
      result: 'SUCCESS',
      ip: req.ip ?? null,
    });

    return ok(res, { deleted: true });
  }),

  /**
   * Renders a template without sending it.
   *
   * Uses a real lead when one is named so the editor sees the actual substitution rather
   * than placeholder words, and falls back to sample values so a preview still works before
   * any lead exists.
   */
  previewTemplate: asyncHandler(async (req, res) => {
    const input = req.body as { subject: string; html: string; text?: string; leadId?: string };
    const settings = await emailSettings();

    const lead = input.leadId ? await LeadModel.findById(input.leadId).lean() : null;

    const context = lead
      ? contextForLead(lead as never, settings.siteName, { adminName: actor(req).name, replyBody: '' })
      : {
          clientName: 'Sample Client',
          clientEmail: 'client@example.com',
          clientPhone: '',
          clientCompany: 'Example Ltd',
          serviceName: 'AI Development',
          budget: '',
          message: 'This is how a submitted enquiry appears in the template.',
          leadId: '000000000000000000000000',
          leadStatus: 'NEW',
          siteName: settings.siteName,
          siteUrl: env.PUBLIC_SITE_URL,
          sourcePage: '/contact/',
          submittedAt: new Date().toISOString(),
          adminName: actor(req).name,
          replyBody: '',
          leadUrl: `${env.WEB_ORIGIN}/admin/leads/000000000000000000000000/`,
        };

    const rendered = renderTemplate(
      { subject: input.subject, html: input.html, text: input.text ?? '' },
      context,
    );

    return ok(res, { ...rendered, text: rendered.text || htmlToText(rendered.html), usedLead: Boolean(lead) });
  }),

  /* ---------------------------------------------------------------- conversation */

  conversation: asyncHandler(async (req, res) => {
    const leadId = String(req.params.id);
    const lead = await LeadModel.findById(leadId).lean();
    if (!lead) throw notFound('Lead not found');

    const thread = await conversationService.byLead(leadId);
    // `trusted` is required by the global sanitiser: an operator this code wrote is safe,
    // one that arrived in a request body is not, and the plugin cannot tell them apart.
    const templates = await EmailTemplateModel.find({ kind: trusted({ $in: ['ADMIN_REPLY', 'CLIENT_FOLLOW_UP'] }), active: true })
      .select('_id kind name subject html text')
      .lean();

    const settings = await emailSettings();

    return ok(res, {
      conversation: thread ? serialiseThread(thread) : null,
      templates,
      settings: { senderName: settings.senderName, replyTo: settings.replyTo },
    });
  }),

  /**
   * Sends an admin reply onto the lead's thread.
   *
   * The body is sanitised here as well as at the edge, because this is the last point before
   * it becomes an email that leaves the building.
   */
  reply: asyncHandler(async (req, res) => {
    const leadId = String(req.params.id);
    const input = req.body as AdminReplyInput;
    const who = actor(req);

    const lead = await LeadModel.findById(leadId).lean();
    if (!lead) throw notFound('Lead not found');

    const settings = await emailSettings();
    const thread = await conversationService.ensure(
      lead._id as Types.ObjectId,
      `Enquiry from ${lead.name}`.slice(0, 300),
    );

    const html = sanitizeEmailHtml(input.html);
    if (!html.trim()) throw badRequest('The reply is empty once formatting is removed');

    const message = await conversationService.appendAndSend({
      threadId: thread._id,
      author: 'ADMIN',
      kind: 'ADMIN_REPLY',
      authorName: who.name,
      authorEmail: env.EMAIL_FROM,
      subject: input.subject,
      html,
      text: input.text || htmlToText(html),
      to: [lead.email],
      cc: input.cc,
      bcc: input.bcc,
      replyTo: settings.replyTo,
      fromName: settings.senderName,
      dedupeKey: input.dedupeKey,
    });

    // Replying is the moment a lead stops being untouched. Later statuses are the admin's
    // own judgement and are left alone.
    await LeadModel.updateOne({ _id: leadId, status: 'NEW' }, { $set: { status: 'CONTACTED' } });

    await auditRepository.record({
      adminId: who.id,
      adminEmail: who.email,
      action: 'lead.reply',
      entity: 'Lead',
      entityId: leadId,
      result: 'SUCCESS',
      ip: req.ip ?? null,
    });

    return ok(res, { message }, 201);
  }),

  retryMessage: asyncHandler(async (req, res) => {
    const leadId = String(req.params.id);
    const messageId = String(req.params.messageId);

    const result = await conversationService.retry(leadId, messageId);
    if (!result.ok) throw badRequest(result.reason ?? 'That message could not be retried');

    const who = actor(req);
    await auditRepository.record({
      adminId: who.id,
      adminEmail: who.email,
      action: 'lead.email_retry',
      entity: 'Lead',
      entityId: leadId,
      result: 'SUCCESS',
      ip: req.ip ?? null,
    });

    return ok(res, { retried: true });
  }),

  /* ---------------------------------------------------------------- inbound review */

  listUnmatched: asyncHandler(async (req, res) => {
    const resolved = req.query.resolved === 'true';
    const items = await inboundService.listUnmatched(resolved);
    return ok(res, { items });
  }),

  attachUnmatched: asyncHandler(async (req, res) => {
    const { leadId } = req.body as { leadId: string };
    const result = await inboundService.attachUnmatched(String(req.params.id), leadId);
    if (!result.ok) throw badRequest(result.reason ?? 'Could not attach that message');
    return ok(res, { attached: true });
  }),

  discardUnmatched: asyncHandler(async (req, res) => {
    await inboundService.discardUnmatched(String(req.params.id));
    return ok(res, { discarded: true });
  }),

  /* ---------------------------------------------------------------- inbound webhook */

  /**
   * Receives a reply from the mail provider.
   *
   * Unauthenticated by session — the caller is a machine — so the shared secret is the only
   * thing standing between this endpoint and anyone who can post JSON. It answers 200 for
   * every outcome it has handled, including one it could not place, because a non-2xx makes
   * the provider redeliver a message that is already recorded.
   */
  inbound: asyncHandler(async (req, res) => {
    const provided = req.header('x-inbound-secret') ?? String(req.query.secret ?? '');
    if (!verifyInboundSignature(provided)) {
      // Deliberately terse: a detailed error would confirm the endpoint exists and hint at
      // what it wants.
      return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Rejected' } });
    }

    const result = await inboundService.receive(req.body as InboundEmailInput);
    return ok(res, result);
  }),
};

/**
 * Renames `_id` to `id` throughout a thread.
 *
 * `lean()` returns raw documents, so ids arrive under `_id` while the shared
 * `Conversation` type — which the admin is written against — declares `id`. Without this the
 * admin has no stable key per message: React warns about duplicate keys, and the retry
 * button has no id to send. Normalising here keeps the wire format matching the type that
 * describes it, rather than making every consumer know about the difference.
 */
function serialiseThread(thread: Record<string, unknown>): Record<string, unknown> {
  const messages = Array.isArray(thread.messages) ? thread.messages : [];

  return {
    ...thread,
    id: String(thread._id),
    leadId: String(thread.leadId),
    messages: messages.map((raw) => {
      const m = raw as Record<string, unknown>;
      const { _id, ...rest } = m;
      return { ...rest, id: String(_id) };
    }),
  };
}
