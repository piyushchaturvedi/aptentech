import { z } from 'zod';
import { LEAD_FORM_TYPES } from '../types/lead';
import { leadStatusSchema, objectIdSchema, paginationSchema, queryString } from './common';

/**
 * How many files one enquiry may carry, and how large each may be.
 *
 * Shared rather than duplicated because three places enforce them and they must agree: the
 * browser (so the visitor is told before a pointless upload), the Next.js route (so an
 * oversized body is refused before it is buffered) and the API (which is the authority).
 * A browser-side limit is a courtesy; the API's copy is the one that counts.
 */
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** The limit as the form and the error messages say it, so the two cannot disagree. */
export const MAX_ATTACHMENT_MB = Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024);

/** 32 random bytes as hex. Long enough that a token cannot be found by guessing. */
export const ATTACHMENT_TOKEN_LENGTH = 64;

/**
 * File types an enquiry may attach.
 *
 * A specification, a contract, a wireframe or a screenshot — the things a client actually
 * sends with a first enquiry. Archives and anything executable are absent deliberately: a
 * `.zip` is a container whose contents cannot be checked by looking at the first few bytes,
 * and this endpoint is open to the public internet.
 */
export const ATTACHMENT_TYPES = [
  { ext: 'pdf', mime: 'application/pdf', label: 'PDF' },
  { ext: 'doc', mime: 'application/msword', label: 'DOC' },
  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'DOCX' },
  { ext: 'xls', mime: 'application/vnd.ms-excel', label: 'XLS' },
  { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'XLSX' },
  { ext: 'png', mime: 'image/png', label: 'PNG' },
  { ext: 'jpg', mime: 'image/jpeg', label: 'JPG' },
  { ext: 'webp', mime: 'image/webp', label: 'WebP' },
] as const;

/** For the file picker's `accept` attribute — a filter, never a check. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_TYPES.map((t) => `.${t.ext}`).join(',');

export const attachmentUploadResultSchema = z.object({
  token: z.string().length(ATTACHMENT_TOKEN_LENGTH),
  filename: z.string(),
  mimeType: z.string(),
  bytes: z.number().int().nonnegative(),
});

export type AttachmentUploadResult = z.infer<typeof attachmentUploadResultSchema>;

/**
 * What a browser is allowed to send when submitting a lead.
 *
 * Deliberately narrow. Attribution (source page, referrer, UTM, IP) is attached by the
 * server, and `status`, `spamScore` and timestamps are never accepted from input — a
 * client that posts `{"status":"WON"}` must not be able to write it.
 */
export const leadSubmissionSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address').max(200),
  phone: z.string().trim().max(40).optional().default(''),
  dialCode: z.string().trim().max(8).optional().default(''),
  company: z.string().trim().max(160).optional().default(''),
  service: z.string().trim().max(160).optional().default(''),
  budget: z.string().trim().max(80).optional().default(''),
  message: z.string().trim().max(5000).optional().default(''),
  ndaRequested: z.boolean().optional().default(false),
  sourceForm: z.enum(LEAD_FORM_TYPES),
  sourcePath: z.string().trim().max(512).default('/'),

  /**
   * Tokens for files already uploaded by this visitor.
   *
   * The files travel ahead of the enquiry, one request each, so the form can report each one
   * as it lands rather than making the visitor wait on a single large submit. What arrives
   * here is only the receipts.
   *
   * A token is unguessable and single-use: it is minted by the upload, and claiming it binds
   * the file to this lead and spends it. So a token cannot be replayed onto a second enquiry,
   * and a lead cannot claim a file it was not given the receipt for. The server ignores any
   * token it does not recognise rather than rejecting the enquiry — losing an attachment is
   * recoverable, losing the lead is not.
   */
  attachmentTokens: z.array(z.string().trim().length(ATTACHMENT_TOKEN_LENGTH)).max(MAX_ATTACHMENTS).optional().default([]),

  /**
   * Honeypot. The field is present in the markup but hidden and `tabindex="-1"`, so a
   * human never fills it. Anything non-empty is a bot. We accept the request and return
   * success rather than an error, so the bot cannot tell it was detected.
   */
  website: z.string().max(200).optional().default(''),

  /** Milliseconds between form render and submit. Sub-second submissions are automated. */
  elapsedMs: z.coerce.number().int().min(0).max(86_400_000).optional().default(0),

  /**
   * The verification question the visitor was asked, and what they answered.
   *
   * Only the handle travels: the answer the server is expecting never leaves it, so nothing
   * in this payload can be worked backwards into a correct response. Both are optional here
   * and neither is checked by this schema, because a missing or wrong answer is not a
   * malformed lead — it is a lead that has not been verified yet, and the two deserve
   * different errors. The API refuses an unanswered challenge in its own middleware, which
   * is the only place the decision is made.
   */
  captchaId: z.string().trim().max(64).optional().default(''),
  captchaAnswer: z.string().trim().max(8).optional().default(''),
});

export type LeadSubmissionInput = z.infer<typeof leadSubmissionSchema>;

/** The hero form requires a message; the standard lead form requires a service. */
export const leadSubmissionRefined = leadSubmissionSchema.superRefine((v, ctx) => {
  if (v.sourceForm === 'heroForm' && v.message.trim().length < 6) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['message'], message: 'Please tell us a little about the project' });
  }
  if (v.sourceForm !== 'heroForm' && !v.service.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['service'], message: 'Please choose a service' });
  }
  if (v.sourceForm === 'contactForm' && v.phone.trim().length < 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Please enter a phone number' });
  }
});

export const leadListQuerySchema = paginationSchema.extend({
  status: z.union([leadStatusSchema, z.literal('ALL')]).optional().default('ALL'),
  search: queryString,
  sourceForm: z.enum(LEAD_FORM_TYPES).optional(),
  from: queryString,
  to: queryString,
  sort: z.enum(['createdAt', '-createdAt', 'name', '-name']).default('-createdAt'),
});

export const leadStatusUpdateSchema = z.object({ status: leadStatusSchema });

export const leadNoteSchema = z.object({ body: z.string().trim().min(1).max(4000) });

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const adminPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .max(200)
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const adminUserCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(2).max(120),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EDITOR']),
  password: z.string().min(12).max(200),
});

export const mediaUpdateSchema = z.object({
  alt: z.string().trim().max(300),
});

export const mediaPresignSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  bytes: z.coerce.number().int().positive().max(10 * 1024 * 1024),
});

export const idParamSchema = z.object({ id: objectIdSchema });

/**
 * Route parameters for a resource nested under a lead.
 *
 * These exist because `validate` does not merely check a request part, it *replaces* it with
 * the parsed object — which is what stops a crafted query object reaching a Mongo filter,
 * and is deliberate. The consequence is that a schema naming only `id` silently deletes
 * every other parameter in the route: a handler reading `req.params.messageId` after
 * `validate(idParamSchema, 'params')` gets `undefined`, with no error anywhere to say so.
 *
 * So a two-parameter route needs a two-parameter schema. Both are validated as object ids
 * rather than passed through, since both are used in a database lookup.
 */
export const leadAttachmentParamSchema = z.object({ id: objectIdSchema, attachmentId: objectIdSchema });
export const leadMessageParamSchema = z.object({ id: objectIdSchema, messageId: objectIdSchema });
