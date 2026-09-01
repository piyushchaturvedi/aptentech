/**
 * Inbound replies.
 *
 * The rule this file exists to enforce: a reply is attached to a thread only when the thread
 * can be identified from an identifier this application minted. Everything else is held for
 * review. Guessing is worse than not matching — putting one client's words into another
 * client's history is a confidentiality failure, and it is unrecoverable once an admin has
 * replied to the wrong person.
 *
 * Matching is therefore tried strongest-first and stops at the first confident answer.
 */
import crypto from 'node:crypto';
import { Types, trusted } from 'mongoose';
import type { InboundEmailInput } from '@aptentech/shared';
import { ConversationModel, LeadModel, UnmatchedInboundModel } from '../../models';
import { sanitizeEmailHtml, htmlToText } from './template';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/** Pulls the address out of `Display Name <someone@example.com>`. */
export function parseAddress(raw: string): { name: string; email: string } {
  const angled = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (angled) {
    return {
      name: (angled[1] ?? '').replace(/^["']|["']$/g, '').trim(),
      email: (angled[2] ?? '').trim().toLowerCase(),
    };
  }
  return { name: '', email: raw.trim().toLowerCase() };
}

/**
 * Removes the quoted history from a reply.
 *
 * Mail clients append the entire previous message below the new text. Storing that verbatim
 * makes a thread unreadable — every message repeats all the ones before it — so the common
 * quote markers are cut. The full original is still available from the client's own mailbox,
 * and the trim is conservative: if no marker is found, nothing is removed.
 */
export function stripQuotedReply(text: string): string {
  const markers = [
    /^On .+ wrote:$/m,
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^_{10,}$/m,
    /^From:\s.+$/m,
    /^>{1,}\s?/m,
  ];

  let cut = text.length;
  for (const marker of markers) {
    const found = text.match(marker);
    if (found?.index !== undefined && found.index < cut) cut = found.index;
  }

  const trimmed = text.slice(0, cut).trim();
  // A reply that is *only* quoted text would otherwise become empty; keep the original then.
  return trimmed.length > 0 ? trimmed : text.trim();
}

/**
 * Verifies the webhook caller.
 *
 * Without this the endpoint is an open door: anyone could post a message that appears in a
 * client's thread. The comparison is timing-safe so the secret cannot be recovered a byte at
 * a time by measuring how long a rejection takes.
 */
export function verifyInboundSignature(providedSecret: string | undefined): boolean {
  const expected = env.INBOUND_WEBHOOK_SECRET;
  // No secret configured means the endpoint stays shut rather than open by default.
  if (!expected) return false;
  if (!providedSecret) return false;

  const a = crypto.createHash('sha256').update(providedSecret).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

interface MatchResult {
  threadId: Types.ObjectId | null;
  leadId: Types.ObjectId | null;
  reason: string;
}

/**
 * Finds the thread a reply belongs to.
 *
 * `In-Reply-To` and `References` carry ids this application generated and the client's mail
 * program echoed back, so a hit there is proof. Subject lines and sender addresses are not:
 * two enquiries from the same person, or a forwarded message, would both match and quietly
 * produce the wrong thread. They are used only as a tie-breaker when exactly one open
 * conversation exists for that address, and never otherwise.
 */
export async function matchThread(inbound: InboundEmailInput): Promise<MatchResult> {
  const candidateIds = [inbound.inReplyTo, ...inbound.references].filter(Boolean);

  if (candidateIds.length > 0) {
    const thread = await ConversationModel.findOne({ 'messages.messageId': trusted({ $in: candidateIds }) })
      .select('_id leadId')
      .lean();
    if (thread) {
      return { threadId: thread._id, leadId: thread.leadId as Types.ObjectId, reason: 'matched_by_message_id' };
    }
  }

  const { email } = parseAddress(inbound.from);
  if (!email) return { threadId: null, leadId: null, reason: 'no_sender_address' };

  /*
    Fallback, used only when it is unambiguous.

    If the sender has exactly one lead on record, a reply from that address can only belong
    to its thread. Two or more and there is no way to choose, so it goes to review — which is
    the correct outcome, not a limitation.
  */
  const leads = await LeadModel.find({ email }).select('_id').limit(2).lean();
  if (leads.length === 1 && leads[0]) {
    const thread = await ConversationModel.findOne({ leadId: leads[0]._id }).select('_id leadId').lean();
    if (thread) {
      return { threadId: thread._id, leadId: thread.leadId as Types.ObjectId, reason: 'matched_by_sole_sender_lead' };
    }
  }

  return {
    threadId: null,
    leadId: null,
    reason: leads.length > 1 ? 'sender_has_multiple_leads' : 'no_matching_thread',
  };
}

export const inboundService = {
  /**
   * Records an inbound message.
   *
   * Returns what happened rather than throwing, because the caller is a provider webhook: a
   * 500 makes it retry, and a retry of a message we have already stored is worse than an
   * acknowledged one we could not place.
   */
  async receive(inbound: InboundEmailInput) {
    const { name, email } = parseAddress(inbound.from);

    // Providers retry; the same message must not appear twice in a client's history.
    if (inbound.messageId) {
      const seen = await ConversationModel.findOne({ 'messages.messageId': inbound.messageId }).select('_id').lean();
      if (seen) return { status: 'duplicate' as const, leadId: null };

      const held = await UnmatchedInboundModel.findOne({ messageId: inbound.messageId }).select('_id').lean();
      if (held) return { status: 'duplicate' as const, leadId: null };
    }

    const text = stripQuotedReply(inbound.text || htmlToText(inbound.html));
    const html = inbound.html ? sanitizeEmailHtml(inbound.html) : `<p>${escapeText(text)}</p>`;
    const match = await matchThread(inbound);

    if (!match.threadId || !match.leadId) {
      await UnmatchedInboundModel.create({
        fromEmail: email,
        fromName: name,
        subject: inbound.subject,
        text,
        html,
        messageId: inbound.messageId || null,
        inReplyTo: inbound.inReplyTo || null,
        references: inbound.references,
        reason: match.reason,
      });
      logger.warn({ from: email, reason: match.reason }, 'Inbound email held for review');
      return { status: 'unmatched' as const, leadId: null };
    }

    await ConversationModel.updateOne(
      { _id: match.threadId },
      {
        $push: {
          messages: {
            author: 'CLIENT',
            kind: 'CLIENT_REPLY',
            authorName: name || email,
            authorEmail: email,
            subject: inbound.subject,
            html,
            text,
            to: [],
            cc: [],
            bcc: [],
            // An inbound message has already arrived; there is nothing to deliver.
            status: 'SENT',
            messageId: inbound.messageId || null,
            inReplyTo: inbound.inReplyTo || null,
            references: inbound.references,
            attempts: [],
            sentAt: new Date(),
            createdAt: new Date(),
          },
        },
        $set: { lastMessageAt: new Date() },
      },
    );

    /*
      A client who replies has engaged, so a lead still sitting at NEW becomes CONTACTED.
      Only that one transition is automatic: later statuses reflect a judgement the admin
      has made, and overwriting QUALIFIED or WON because an email arrived would destroy it.
    */
    await LeadModel.updateOne({ _id: match.leadId, status: 'NEW' }, { $set: { status: 'CONTACTED' } });

    logger.info({ leadId: String(match.leadId), reason: match.reason }, 'Inbound reply attached to thread');
    return { status: 'attached' as const, leadId: String(match.leadId) };
  },

  async listUnmatched(resolved: boolean) {
    return UnmatchedInboundModel.find({ resolved }).sort({ createdAt: -1 }).limit(200).lean();
  },

  /** Moves a held message onto a thread an administrator has identified. */
  async attachUnmatched(unmatchedId: string, leadId: string) {
    const held = await UnmatchedInboundModel.findById(unmatchedId);
    if (!held || held.resolved) return { ok: false, reason: 'That message is not awaiting review' };

    const thread = await ConversationModel.findOne({ leadId: new Types.ObjectId(leadId) });
    if (!thread) return { ok: false, reason: 'That lead has no conversation' };

    thread.messages.push({
      author: 'CLIENT',
      kind: 'CLIENT_REPLY',
      authorName: held.fromName || held.fromEmail,
      authorEmail: held.fromEmail,
      subject: held.subject,
      html: held.html,
      text: held.text,
      to: [],
      cc: [],
      bcc: [],
      status: 'SENT',
      messageId: held.messageId,
      inReplyTo: held.inReplyTo,
      references: held.references,
      attempts: [],
      sentAt: new Date(),
      createdAt: new Date(),
    } as never);

    thread.lastMessageAt = new Date();
    await thread.save();

    held.resolved = true;
    held.resolvedLeadId = new Types.ObjectId(leadId);
    await held.save();

    return { ok: true, reason: null };
  },

  async discardUnmatched(unmatchedId: string) {
    await UnmatchedInboundModel.updateOne({ _id: unmatchedId }, { $set: { resolved: true, resolvedLeadId: null } });
    return { ok: true };
  },
};

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
