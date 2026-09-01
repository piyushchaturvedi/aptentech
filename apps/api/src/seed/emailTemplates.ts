/**
 * The four templates the application sends from.
 *
 * These fill system slots, so they are marked `builtIn`: an administrator may rewrite every
 * word, but cannot delete the message the code expects to find. Seeding is idempotent and
 * never overwrites — once a template exists, its wording belongs to the administrator, and a
 * re-seed that reset it would silently discard their edits.
 *
 * The markup is deliberately plain: tables and inline styles, no external stylesheet and no
 * web fonts, because mail clients support almost nothing else. It does not attempt to
 * reproduce the site's design, and it invents no company detail — everything specific comes
 * from a variable or from settings the administrator controls.
 */
import type { TemplateKind } from '@aptentech/shared';
import { EmailTemplateModel } from '../models';
import { logger } from '../utils/logger';

const WRAP_OPEN = `<div style="margin:0;padding:24px 0;background-color:#f4f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:12px;">
<tr><td style="padding:28px 32px;">`;

const WRAP_CLOSE = `</td></tr></table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
<tr><td style="padding:16px 32px;color:#6b7280;font-size:12px;line-height:1.6;">{{siteName}} · <a href="{{siteUrl}}" style="color:#6b7280;">{{siteUrl}}</a></td></tr>
</table>
</td></tr></table></div>`;

const H1 = 'margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827;';
const P = 'margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;';
const LABEL = 'padding:6px 0;font-size:13px;color:#6b7280;width:130px;vertical-align:top;';
const VALUE = 'padding:6px 0;font-size:14px;color:#111827;';
const BUTTON =
  'display:inline-block;padding:11px 20px;background-color:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold;';

interface SeedTemplate {
  kind: TemplateKind;
  name: string;
  description: string;
  subject: string;
  html: string;
  text: string;
}

const TEMPLATES: SeedTemplate[] = [
  {
    kind: 'ADMIN_NEW_LEAD',
    name: 'New lead — admin notification',
    description: 'Sent to the notification recipients whenever a new enquiry arrives.',
    // The service is deliberately not in the subject: templates have no conditionals, and an
    // enquiry that names no service would leave a dangling separator in every inbox.
    subject: 'New enquiry from {{clientName}}',
    html: `${WRAP_OPEN}
<h1 style="${H1}">New enquiry</h1>
<p style="${P}">A new enquiry arrived through {{sourcePage}}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="${LABEL}">Name</td><td style="${VALUE}">{{clientName}}</td></tr>
<tr><td style="${LABEL}">Email</td><td style="${VALUE}"><a href="mailto:{{clientEmail}}" style="color:#4f46e5;">{{clientEmail}}</a></td></tr>
<tr><td style="${LABEL}">Phone</td><td style="${VALUE}">{{clientPhone}}</td></tr>
<tr><td style="${LABEL}">Company</td><td style="${VALUE}">{{clientCompany}}</td></tr>
<tr><td style="${LABEL}">Service</td><td style="${VALUE}">{{serviceName}}</td></tr>
<tr><td style="${LABEL}">Budget</td><td style="${VALUE}">{{budget}}</td></tr>
<tr><td style="${LABEL}">Submitted</td><td style="${VALUE}">{{submittedAt}}</td></tr>
</table>
<p style="${P}margin-top:20px;"><strong>Message</strong></p>
<p style="${P}white-space:pre-wrap;">{{message}}</p>
<p style="margin:24px 0 0;"><a href="{{leadUrl}}" style="${BUTTON}">Open this lead</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#6b7280;">Replying to this email reaches the client directly.</p>
${WRAP_CLOSE}`,
    text: `New enquiry

Name:      {{clientName}}
Email:     {{clientEmail}}
Phone:     {{clientPhone}}
Company:   {{clientCompany}}
Service:   {{serviceName}}
Budget:    {{budget}}
Page:      {{sourcePage}}
Submitted: {{submittedAt}}

Message:
{{message}}

Open this lead: {{leadUrl}}
Replying to this email reaches the client directly.`,
  },
  {
    kind: 'CLIENT_CONFIRMATION',
    name: 'Enquiry received — client confirmation',
    description: 'Sent automatically to the client after they submit a form.',
    subject: 'We received your enquiry — {{siteName}}',
    html: `${WRAP_OPEN}
<h1 style="${H1}">Thank you, {{clientName}}</h1>
<p style="${P}">We have received your enquiry and a senior engineer will read it personally. You can expect a reply within one business day.</p>
<p style="${P}"><strong>What you sent us</strong></p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="${LABEL}">Service</td><td style="${VALUE}">{{serviceName}}</td></tr>
<tr><td style="${LABEL}">Reference</td><td style="${VALUE}">{{leadId}}</td></tr>
</table>
<p style="${P}margin-top:16px;white-space:pre-wrap;">{{message}}</p>
<p style="${P}">If you need to add anything, simply reply to this email — it reaches the same conversation.</p>
${WRAP_CLOSE}`,
    text: `Thank you, {{clientName}}

We have received your enquiry and a senior engineer will read it personally.
You can expect a reply within one business day.

Service:   {{serviceName}}
Reference: {{leadId}}

What you sent us:
{{message}}

If you need to add anything, simply reply to this email — it reaches the same conversation.

{{siteName}} · {{siteUrl}}`,
  },
  {
    kind: 'ADMIN_REPLY',
    name: 'Admin reply',
    description: 'The starting point when replying to a client from the lead screen.',
    subject: 'Re: your enquiry — {{siteName}}',
    html: `${WRAP_OPEN}
<p style="${P}">Hello {{clientName}},</p>
<div style="${P}">{{replyBody}}</div>
<p style="${P}">Best regards,<br>{{adminName}}<br>{{siteName}}</p>
${WRAP_CLOSE}`,
    text: `Hello {{clientName}},

{{replyBody}}

Best regards,
{{adminName}}
{{siteName}}`,
  },
  {
    kind: 'CLIENT_FOLLOW_UP',
    name: 'Client follow-up',
    description: 'For following up on an enquiry that has gone quiet.',
    subject: 'Following up on your enquiry — {{siteName}}',
    html: `${WRAP_OPEN}
<p style="${P}">Hello {{clientName}},</p>
<p style="${P}">I wanted to follow up on your enquiry about {{serviceName}}. If it is still something you are considering, I am happy to answer any questions.</p>
<div style="${P}">{{replyBody}}</div>
<p style="${P}">Best regards,<br>{{adminName}}<br>{{siteName}}</p>
${WRAP_CLOSE}`,
    text: `Hello {{clientName}},

I wanted to follow up on your enquiry about {{serviceName}}. If it is still
something you are considering, I am happy to answer any questions.

{{replyBody}}

Best regards,
{{adminName}}
{{siteName}}`,
  },
];

export async function seedEmailTemplates(): Promise<{ created: number; kept: number }> {
  let created = 0;
  let kept = 0;

  for (const template of TEMPLATES) {
    const existing = await EmailTemplateModel.findOne({ kind: template.kind, builtIn: true }).select('_id').lean();
    if (existing) {
      kept += 1;
      continue;
    }
    await EmailTemplateModel.create({ ...template, builtIn: true, active: true });
    created += 1;
  }

  logger.info({ created, kept }, 'Email templates seeded');
  return { created, kept };
}
