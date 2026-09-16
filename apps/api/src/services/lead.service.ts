import crypto from 'node:crypto';
import type { LeadSubmissionInput } from '@aptentech/shared';
import { leadRepository } from '../repositories/lead.repository';
import { attachmentRepository } from '../repositories/attachment.repository';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Lead intake.
 *
 * The original site validated in the browser, showed a success message and threw the
 * enquiry away. Everything here exists to make sure that never happens again while keeping
 * the visible behaviour of the form identical.
 *
 * Spam handling is scored rather than binary. A hard block on any single signal produces
 * false positives that cost real enquiries, so signals accumulate: a submission that
 * trips the honeypot is certainly a bot and is stored as SPAM, whereas a merely fast
 * submission is only suspicious and still reaches the inbox flagged.
 */

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/** Sub-second completion is not a human filling in four fields. */
const MIN_HUMAN_MS = 1500;

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'trashmail.com',
  'yopmail.com',
  'throwawaymail.com',
]);

const LINK_PATTERN = /(https?:\/\/|www\.)/gi;

export interface LeadRequestContext {
  ip: string | null;
  userAgent: string | null;
  referrer: string | null;
  utm: { source?: string; medium?: string; campaign?: string; term?: string; content?: string };
}

export interface SpamAssessment {
  score: number;
  reasons: string[];
  isSpam: boolean;
}

/**
 * Salted so the stored value cannot be reversed to an IP by rainbow table.
 *
 * Exported so attachment uploads hash addresses the same way leads do. Two salts would make
 * the same visitor look like two, which is exactly what this value exists to rule out.
 */
export function hashValue(value: string): string {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(value).digest('hex');
}

export function assessSpam(input: LeadSubmissionInput, ctx: LeadRequestContext): SpamAssessment {
  const reasons: string[] = [];
  let score = 0;

  // Honeypot: the field is visually hidden and tabindex="-1", so a human never fills it.
  if (input.website.trim().length > 0) {
    score += 100;
    reasons.push('honeypot_filled');
  }

  if (input.elapsedMs > 0 && input.elapsedMs < MIN_HUMAN_MS) {
    score += 40;
    reasons.push('submitted_too_fast');
  }

  const domain = input.email.split('@')[1]?.toLowerCase() ?? '';
  if (DISPOSABLE_DOMAINS.has(domain)) {
    score += 35;
    reasons.push('disposable_email');
  }

  const links = input.message.match(LINK_PATTERN)?.length ?? 0;
  if (links >= 3) {
    score += 35;
    reasons.push('excessive_links');
  } else if (links > 0 && input.message.trim().length < 60) {
    // A short message that is mostly a URL is the classic link-drop.
    score += 25;
    reasons.push('link_heavy_short_message');
  }

  if (!ctx.userAgent || ctx.userAgent.length < 10) {
    score += 20;
    reasons.push('missing_user_agent');
  }

  // Cyrillic or CJK in a name field on an English-language enquiry form is a strong
  // signal in this specific context; it only contributes, it never decides alone.
  if (/[Ѐ-ӿ一-鿿]/.test(input.name)) {
    score += 15;
    reasons.push('unexpected_script_in_name');
  }

  if (input.name.trim().split(/\s+/).length === 1 && input.name.length > 25) {
    score += 10;
    reasons.push('implausible_name');
  }

  return { score, reasons, isSpam: score >= 60 };
}

export const leadService = {
  /**
   * Creates a lead.
   *
   * Returns `{ duplicate: true }` when an identical enquiry arrived moments ago. The
   * caller still reports success to the browser: the visitor did submit, and telling them
   * "duplicate" for a double-click would be confusing and would leak how the guard works.
   */
  async submit(input: LeadSubmissionInput, ctx: LeadRequestContext) {
    const assessment = assessSpam(input, ctx);

    const fingerprint = hashValue(
      [input.email.toLowerCase(), input.name.trim().toLowerCase(), input.message.trim().slice(0, 200)].join('|'),
    );

    const existing = await leadRepository.findRecentDuplicate(fingerprint, DUPLICATE_WINDOW_MS);
    if (existing) {
      logger.info({ fingerprint: fingerprint.slice(0, 8) }, 'Duplicate lead suppressed');
      return { duplicate: true, lead: null, assessment };
    }

    const lead = await leadRepository.create({
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      dialCode: input.dialCode || null,
      company: input.company || null,
      service: input.service || null,
      budget: input.budget || null,
      message: input.message,
      ndaRequested: input.ndaRequested,
      attachments: [],

      sourcePage: input.sourcePath,
      sourceForm: input.sourceForm,
      referrer: ctx.referrer,
      utm: {
        source: ctx.utm.source ?? null,
        medium: ctx.utm.medium ?? null,
        campaign: ctx.utm.campaign ?? null,
        term: ctx.utm.term ?? null,
        content: ctx.utm.content ?? null,
      },

      // Spam is stored rather than discarded so a false positive can be recovered from
      // the SPAM filter in the admin rather than being lost forever.
      status: assessment.isSpam ? 'SPAM' : 'NEW',
      spamScore: assessment.score,
      spamReasons: assessment.reasons,

      ipHash: ctx.ip ? hashValue(ctx.ip) : null,
      fingerprint,
    });

    /*
      Attachments are bound after the lead exists, and failing to bind them does not fail it.

      The order is forced: a claim writes the lead's id onto each file, so there has to be a
      lead first. The `try` is the deliberate part — an enquiry that arrives with an expired
      token, or while the database is refusing writes, is still an enquiry, and the standing
      rule on this project is that nothing in the notification path may cost us the lead.
      The same reasoning as email, for the same reason.
    */
    let attachments: Awaited<ReturnType<typeof attachmentRepository.claim>> = [];
    if (input.attachmentTokens.length) {
      try {
        attachments = await attachmentRepository.claim(input.attachmentTokens, lead.id);
        if (attachments.length) {
          await leadRepository.setAttachments(lead.id, attachments);
        }
        if (attachments.length < input.attachmentTokens.length) {
          // Not an error the sender should see, but the admin needs to know a file is absent
          // from an enquiry that says it has one.
          logger.warn(
            { leadId: lead.id, presented: input.attachmentTokens.length, claimed: attachments.length },
            'Some enquiry attachments could not be claimed — expired, unknown, or already used',
          );
        }
      } catch (error) {
        logger.error({ leadId: lead.id, err: error }, 'Could not attach files to a lead; the lead itself is saved');
      }
    }

    logger.info(
      {
        leadId: lead.id,
        form: input.sourceForm,
        spam: assessment.isSpam,
        score: assessment.score,
        attachments: attachments.length,
      },
      'Lead captured',
    );

    return { duplicate: false, lead: { ...lead, attachments }, assessment };
  },

  /** CSV for the admin export. Quotes every field so commas and newlines cannot break rows. */
  toCsv(leads: Array<Record<string, unknown>>): string {
    const columns = [
      'createdAt',
      'name',
      'email',
      'phone',
      'company',
      'service',
      'budget',
      'message',
      'status',
      'sourceForm',
      'sourcePage',
      'utmSource',
      'utmMedium',
      'utmCampaign',
      'referrer',
      'spamScore',
    ];

    const escape = (value: unknown): string => {
      if (value === null || value === undefined) return '""';
      const s = String(value).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = leads.map((l) => {
      const utm = (l.utm ?? {}) as Record<string, unknown>;
      return [
        l.createdAt,
        l.name,
        l.email,
        l.phone,
        l.company,
        l.service,
        l.budget,
        l.message,
        l.status,
        l.sourceForm,
        l.sourcePage,
        utm.source,
        utm.medium,
        utm.campaign,
        l.referrer,
        l.spamScore,
      ]
        .map(escape)
        .join(',');
    });

    return [columns.join(','), ...rows].join('\r\n');
  },
};
