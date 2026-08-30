import { z } from 'zod';
import { LEAD_FORM_TYPES } from '../types/lead';
import { leadStatusSchema, objectIdSchema, paginationSchema, queryString } from './common';

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
   * Honeypot. The field is present in the markup but hidden and `tabindex="-1"`, so a
   * human never fills it. Anything non-empty is a bot. We accept the request and return
   * success rather than an error, so the bot cannot tell it was detected.
   */
  website: z.string().max(200).optional().default(''),

  /** Milliseconds between form render and submit. Sub-second submissions are automated. */
  elapsedMs: z.coerce.number().int().min(0).max(86_400_000).optional().default(0),
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
