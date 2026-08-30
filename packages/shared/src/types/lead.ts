/**
 * Lead types.
 *
 * The model is derived from the 40 form instances the audit found, which reduce to three
 * variants sharing most of their fields. Rather than a column per form, common fields are
 * first-class and genuinely form-specific answers go in `extra`, so a new form variant
 * needs no migration.
 *
 * Field provenance:
 *   leadForm    (21 pages) — name, email, phone, service, budget, details
 *   heroForm    (19 pages) — hName, hEmail, hPhone, hDetails, NDA checkbox
 *   contactForm  (1 page)  — the above plus dialCode, attachment, consent, honeypot
 *
 * `company` is included because it was specified, but note no existing form collects it;
 * it stays null until a form is given the field. Nothing else is collected that the
 * approved forms do not already ask for.
 */

import type { LeadStatus } from './primitives';

export const LEAD_FORM_TYPES = ['leadForm', 'heroForm', 'contactForm'] as const;
export type LeadFormType = (typeof LEAD_FORM_TYPES)[number];

export interface LeadUtm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
}

export interface LeadNote {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface LeadAttachment {
  mediaId: string;
  filename: string;
  mimeType: string;
  bytes: number;
}

export interface Lead {
  id: string;

  // Identity — collected by every form.
  name: string;
  email: string;
  phone: string | null;
  dialCode: string | null;
  company: string | null;

  // Enquiry.
  service: string | null;
  budget: string | null;
  message: string;
  ndaRequested: boolean;
  attachment: LeadAttachment | null;

  // Attribution. Captured server-side — never trusted from the client payload,
  // because a referrer or source page supplied by the browser can be forged.
  sourcePage: string;
  sourceForm: LeadFormType;
  referrer: string | null;
  utm: LeadUtm;

  // Triage.
  status: LeadStatus;
  notes: LeadNote[];
  spamScore: number;
  spamReasons: string[];

  createdAt: string;
  updatedAt: string;
}

export interface LeadListQuery {
  page?: number;
  pageSize?: number;
  status?: LeadStatus | 'ALL';
  search?: string;
  sourceForm?: LeadFormType;
  from?: string;
  to?: string;
  sort?: 'createdAt' | '-createdAt' | 'name' | '-name';
}

export interface LeadStats {
  total: number;
  byStatus: Record<LeadStatus, number>;
  last7Days: number;
  last30Days: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR';
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  entity: string;
  entityId: string | null;
  result: 'SUCCESS' | 'FAILURE';
  ip: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  leads: LeadStats;
  recentLeads: Lead[];
  counts: {
    services: number;
    solutions: number;
    caseStudies: number;
    blogPosts: number;
    testimonials: number;
    faqs: number;
    media: number;
  };
  drafts: {
    services: number;
    caseStudies: number;
    blogPosts: number;
    pages: number;
  };
}
