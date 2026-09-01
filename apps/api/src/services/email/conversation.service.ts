/**
 * Lead conversations.
 *
 * One lead, one thread. Everything said in either direction is appended here, so the admin
 * reads a single history instead of correlating an outbox with an inbox.
 *
 * The ordering of operations in `openThread` is the important part of this file: the lead
 * and its thread are committed *before* any provider is contacted, and outbound messages are
 * appended in `QUEUED` state and delivered afterwards. A provider outage therefore costs a
 * delayed email, never a lost enquiry — which is the one failure this feature must not have.
 */
import { Types, trusted } from 'mongoose';
import type { EmailStatus, MessageKind, TemplateKind } from '@aptentech/shared';
import { ConversationModel, EmailTemplateModel, LeadModel, SiteSettingsModel } from '../../models';
import { deliver, newMessageId, type OutgoingEmail } from './provider';
import { htmlToText, renderTemplate, sanitizeEmailHtml, type TemplateContext } from './template';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/** How many times a failed message is retried automatically before it waits for a human. */
const MAX_AUTO_ATTEMPTS = 3;

/**
 * A lead as either of the two shapes this service is handed.
 *
 * The repository returns a DTO carrying `id` as a string, while a `lean()` query returns the
 * raw document with `_id`. Accepting both and normalising in one place is less fragile than
 * making every caller remember which one it holds.
 */
interface LeadLike {
  id?: string;
  _id?: Types.ObjectId | string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  service?: string | null;
  budget?: string | null;
  message?: string;
  status?: string;
  sourcePage?: string;
  createdAt?: Date | string;
}

/**
 * Who a message is addressed to, for threading purposes.
 *
 * Only the new-lead notification is internal. Everything else — the submission, the
 * confirmation, replies in both directions and follow-ups — is part of the correspondence
 * with the client and belongs on one chain.
 */
function audienceOf(kind: MessageKind): 'ADMIN' | 'CLIENT' {
  return kind === 'ADMIN_NOTIFICATION' ? 'ADMIN' : 'CLIENT';
}

/** The lead id, whichever shape the caller holds it in. */
function leadObjectId(lead: LeadLike): Types.ObjectId {
  const raw = lead._id ?? lead.id;
  if (!raw) throw new Error('Lead has no id');
  return typeof raw === 'string' ? new Types.ObjectId(raw) : raw;
}

/**
 * Resolves the delivery settings an administrator owns.
 *
 * Falls back to the site's public contact address when no notification recipient has been
 * configured, so a fresh install still delivers somewhere rather than silently dropping the
 * first enquiry. A placeholder address — the source content is full of `[EMAIL ADDRESS]` —
 * is treated as unset, because sending to it would only produce a bounce.
 */
export async function emailSettings() {
  const settings = await SiteSettingsModel.findOne({ singleton: 'site' }).lean();
  const configured = (settings?.emailDelivery ?? {}) as Record<string, unknown>;

  const usable = (value: unknown): string => {
    const s = typeof value === 'string' ? value.trim() : '';
    return s && !s.includes('[') && s.includes('@') ? s : '';
  };

  const siteEmail = usable(settings?.email);

  return {
    notifyTo: usable(configured.notifyTo) || siteEmail,
    notifyCc: Array.isArray(configured.notifyCc) ? (configured.notifyCc as string[]).filter(Boolean) : [],
    notifyBcc: Array.isArray(configured.notifyBcc) ? (configured.notifyBcc as string[]).filter(Boolean) : [],
    senderName: (typeof configured.senderName === 'string' && configured.senderName.trim()) || 'AptenTech',
    replyTo: usable(configured.replyTo) || siteEmail,
    sendClientConfirmation: configured.sendClientConfirmation !== false,
    sendAdminNotification: configured.sendAdminNotification !== false,
    siteName: settings?.companyName || 'AptenTech',
  };
}

/** Builds the variable set a template may draw on. Only these names ever resolve. */
export function contextForLead(lead: LeadLike, siteName: string, extra: TemplateContext = {}): TemplateContext {
  return {
    clientName: lead.name ?? '',
    clientEmail: lead.email ?? '',
    clientPhone: lead.phone ?? '',
    clientCompany: lead.company ?? '',
    serviceName: lead.service ?? '',
    budget: lead.budget ?? '',
    message: lead.message ?? '',
    leadId: String(leadObjectId(lead)),
    leadStatus: lead.status ?? 'NEW',
    siteName,
    siteUrl: env.PUBLIC_SITE_URL,
    sourcePage: lead.sourcePage ?? '/',
    // The DTO carries an ISO string while a lean document carries a Date; both are accepted.
    submittedAt: typeof lead.createdAt === 'string' ? lead.createdAt : (lead.createdAt ?? new Date()).toISOString(),
    leadUrl: `${env.WEB_ORIGIN}/admin/leads/${String(leadObjectId(lead))}/`,
    ...extra,
  };
}

async function activeTemplate(kind: TemplateKind) {
  return EmailTemplateModel.findOne({ kind, active: true }).sort({ updatedAt: -1 }).lean();
}

export const conversationService = {
  /** The thread for a lead, created on first use so no caller has to check. */
  async ensure(leadId: Types.ObjectId, subject: string) {
    const existing = await ConversationModel.findOne({ leadId });
    if (existing) return existing;

    // `upsert` rather than `create`: two requests for the same new lead would otherwise
    // race and one would fail the unique index.
    return ConversationModel.findOneAndUpdate(
      { leadId },
      { $setOnInsert: { leadId, subject, messages: [], lastMessageAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  },

  async byLead(leadId: string) {
    return ConversationModel.findOne({ leadId: new Types.ObjectId(leadId) }).lean();
  },

  /**
   * Opens the thread for a new lead and queues the two automatic emails.
   *
   * Never throws on a delivery problem. The caller is the public form handler, and the
   * visitor must see success as soon as their enquiry is safely stored — whether the mail
   * has gone out yet is the operator's problem, not theirs, and it is visible in the admin.
   */
  async openThread(lead: LeadLike) {
    const leadId = leadObjectId(lead);
    const settings = await emailSettings();
    const subject = `${lead.service ? `${lead.service}: ` : ''}Enquiry from ${lead.name}`.slice(0, 300);
    const thread = await this.ensure(leadId, subject);

    // The submission itself is a message. Without it the thread would begin with a reply to
    // something the reader cannot see.
    thread.messages.push({
      author: 'CLIENT',
      kind: 'FORM',
      authorName: lead.name,
      authorEmail: lead.email,
      subject,
      html: sanitizeEmailHtml(`<p>${escapeText(lead.message ?? '')}</p>`),
      text: lead.message ?? '',
      to: [],
      cc: [],
      bcc: [],
      // Nothing was mailed, so there is nothing to deliver or retry.
      status: 'SENT' as EmailStatus,
      sentAt: new Date(),
      createdAt: new Date(),
    } as never);

    thread.lastMessageAt = new Date();
    await thread.save();

    const context = contextForLead(lead, settings.siteName);

    if (settings.sendAdminNotification && settings.notifyTo) {
      await this.queueFromTemplate({
        threadId: thread._id,
        kind: 'ADMIN_NOTIFICATION',
        templateKind: 'ADMIN_NEW_LEAD',
        to: [settings.notifyTo],
        cc: settings.notifyCc,
        bcc: settings.notifyBcc,
        // A reply to the notification should reach the client, not the notification list.
        replyTo: lead.email,
        context,
        settings,
        dedupeKey: `admin-new-${String(leadId)}`,
      });
    } else if (!settings.notifyTo) {
      logger.warn({ leadId: String(leadId) }, 'No notification recipient configured — admin was not emailed');
    }

    if (settings.sendClientConfirmation) {
      await this.queueFromTemplate({
        threadId: thread._id,
        kind: 'CONFIRMATION',
        templateKind: 'CLIENT_CONFIRMATION',
        to: [lead.email],
        cc: [],
        bcc: [],
        replyTo: settings.replyTo,
        context,
        settings,
        dedupeKey: `client-confirm-${String(leadId)}`,
      });
    }

    return thread;
  },

  /**
   * Renders a template, appends the message and attempts delivery.
   *
   * `dedupeKey` makes the whole operation idempotent: a retried request or a double
   * submission finds the existing message and returns it rather than mailing a second copy.
   */
  async queueFromTemplate(args: {
    threadId: Types.ObjectId;
    kind: MessageKind;
    templateKind: TemplateKind;
    to: string[];
    cc: string[];
    bcc: string[];
    replyTo: string;
    context: TemplateContext;
    settings: { senderName: string };
    dedupeKey: string;
  }) {
    const template = await activeTemplate(args.templateKind);
    if (!template) {
      logger.error({ kind: args.templateKind }, 'No active template — email not sent');
      return null;
    }

    const rendered = renderTemplate(template, args.context);

    return this.appendAndSend({
      threadId: args.threadId,
      author: args.kind === 'ADMIN_REPLY' ? 'ADMIN' : 'SYSTEM',
      kind: args.kind,
      authorName: args.settings.senderName,
      authorEmail: env.EMAIL_FROM,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text || htmlToText(rendered.html),
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      replyTo: args.replyTo,
      fromName: args.settings.senderName,
      dedupeKey: args.dedupeKey,
    });
  },

  /**
   * Appends an outbound message and tries to deliver it.
   *
   * The message is written in `QUEUED` state and saved before the provider is called, so a
   * crash mid-send leaves a record that can be retried rather than a silent gap.
   */
  async appendAndSend(args: {
    threadId: Types.ObjectId;
    author: 'ADMIN' | 'SYSTEM';
    kind: MessageKind;
    authorName: string;
    authorEmail: string;
    subject: string;
    html: string;
    text: string;
    to: string[];
    cc: string[];
    bcc: string[];
    replyTo: string;
    fromName: string;
    dedupeKey: string;
  }) {
    const thread = await ConversationModel.findById(args.threadId);
    if (!thread) return null;

    const already = thread.messages.find((m) => (m as { dedupeKey?: string }).dedupeKey === args.dedupeKey);
    if (already) {
      logger.info({ dedupeKey: args.dedupeKey }, 'Duplicate email suppressed');
      return already;
    }

    /*
      Threading headers.

      A message is attached to the newest earlier message *with the same audience* that
      carries a `Message-ID`, and the `References` chain accumulates the ids before it. Mail
      clients use that chain to group the exchange, and the application uses it to recognise
      a reply when it returns.

      The audience split matters. Internal notifications and client correspondence go to
      different people, and chaining one onto the other would make a client's reply appear to
      answer a message they never received — and would file the two in one thread in every
      mailbox that groups by `References`.
    */
    const audience = audienceOf(args.kind);
    const previous = [...thread.messages]
      .reverse()
      .find((m) => Boolean(m.messageId) && audienceOf(m.kind as MessageKind) === audience);
    const messageId = newMessageId();
    const references = previous
      ? [...(previous.references ?? []), previous.messageId].filter((v): v is string => Boolean(v)).slice(-20)
      : [];

    thread.messages.push({
      author: args.author,
      kind: args.kind,
      authorName: args.authorName,
      authorEmail: args.authorEmail,
      subject: args.subject,
      html: args.html,
      text: args.text,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      status: 'QUEUED' as EmailStatus,
      messageId,
      inReplyTo: previous?.messageId ?? null,
      references,
      attempts: [],
      dedupeKey: args.dedupeKey,
      createdAt: new Date(),
    } as never);

    thread.lastMessageAt = new Date();
    await thread.save();

    const appended = thread.messages[thread.messages.length - 1];
    await this.attemptDelivery(thread._id, String(appended?._id), {
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      html: args.html,
      text: args.text,
      fromName: args.fromName,
      replyTo: args.replyTo,
      messageId,
      inReplyTo: previous?.messageId ?? null,
      references,
    });

    return appended;
  },

  /**
   * One delivery attempt, recording the outcome either way.
   *
   * Failures are stored on the message rather than thrown. The admin sees the status and can
   * retry; nothing upstream is rolled back, because the conversation is true regardless of
   * whether the provider was reachable.
   */
  async attemptDelivery(threadId: Types.ObjectId, messageDocId: string, message: OutgoingEmail) {
    await setMessageStatus(threadId, messageDocId, 'SENDING', null, null);

    try {
      const result = await deliver(message);
      await setMessageStatus(threadId, messageDocId, 'SENT', null, result.providerId);
      logger.info({ threadId: String(threadId), to: message.to, messageId: message.messageId }, 'Email sent');
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown delivery error';
      await setMessageStatus(threadId, messageDocId, 'FAILED', reason, null);
      logger.error({ threadId: String(threadId), err: reason }, 'Email delivery failed');
      return false;
    }
  },

  /**
   * Retries a failed message.
   *
   * Deliberately manual after `MAX_AUTO_ATTEMPTS`. Most delivery failures are permanent — a
   * rejected address, a template a provider refuses — and retrying those on a timer burns
   * sender reputation without ever succeeding.
   */
  async retry(leadId: string, messageDocId: string) {
    const thread = await ConversationModel.findOne({ leadId: new Types.ObjectId(leadId) });
    if (!thread) return { ok: false, reason: 'No conversation for that lead' };

    const message = thread.messages.id(messageDocId);
    if (!message) return { ok: false, reason: 'No such message' };
    if (message.status === 'SENT') return { ok: false, reason: 'That message was already sent' };
    if (message.to.length === 0) return { ok: false, reason: 'That message has no recipient' };

    const settings = await emailSettings();

    const sent = await this.attemptDelivery(thread._id, messageDocId, {
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      html: message.html,
      text: message.text,
      fromName: settings.senderName,
      replyTo: settings.replyTo,
      messageId: message.messageId ?? newMessageId(),
      // Mongoose types an optional subdocument field as possibly `undefined`; the wire
      // contract distinguishes only "absent" from "set", so both collapse to null.
      inReplyTo: message.inReplyTo ?? null,
      references: message.references ?? [],
    });

    return { ok: sent, reason: sent ? null : 'Delivery failed again — see the message for the reason' };
  },

  /** Every message still awaiting delivery, for the retry-all action and for monitoring. */
  async pending() {
    return ConversationModel.find({ 'messages.status': trusted({ $in: ['QUEUED', 'FAILED'] }) })
      .select('leadId messages')
      .lean();
  },
};

/** Records a status transition and its reason on one embedded message. */
async function setMessageStatus(
  threadId: Types.ObjectId,
  messageDocId: string,
  status: EmailStatus,
  error: string | null,
  providerId: string | null,
): Promise<void> {
  const set: Record<string, unknown> = { 'messages.$.status': status, 'messages.$.lastError': error };
  if (status === 'SENT') set['messages.$.sentAt'] = new Date();
  if (providerId) set['messages.$.providerId'] = providerId;

  await ConversationModel.updateOne(
    { _id: threadId, 'messages._id': new Types.ObjectId(messageDocId) },
    {
      $set: set,
      // Every attempt is kept, so a persistent failure shows its history rather than only
      // its most recent symptom. Capped so a stuck message cannot grow without bound.
      $push: { 'messages.$.attempts': { $each: [{ at: new Date(), status, error }], $slice: -MAX_AUTO_ATTEMPTS * 4 } },
    },
  );
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export { MAX_AUTO_ATTEMPTS };
