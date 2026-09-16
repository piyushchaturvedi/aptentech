#!/usr/bin/env node
/**
 * Installs the designed HTML for the two lead emails.
 *
 * Written for email clients rather than for browsers, which is a different and narrower target:
 * tables for layout because Outlook's rendering engine is Word and ignores flex and grid,
 * every style inline because Gmail strips <style> blocks, a 600px shell because that is what
 * fits a desktop reading pane, and a web-safe font stack because a webfont will not load.
 *
 * Both are editable afterwards at /admin/email-templates. This is deliberately **not** part of
 * the deploy: running it on every release would overwrite whatever an editor had changed.
 *
 *   node scripts/apply-email-templates.js
 *   node scripts/apply-email-templates.js --apply
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

function envValue(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

/* ------------------------------------------------------------------ design tokens */

const INK = '#141338';
const BODY = '#3F4468';
const MUTED = '#8E97C8';
const LINE = '#E7E9F5';
const PANEL = '#F6F7FC';
const INDIGO = '#3A31DB';
const MINT = '#00C9A7';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The outer shell both messages share.
 *
 * `role="presentation"` on every layout table stops screen readers announcing the scaffolding
 * as a data table, which is the single most common accessibility fault in HTML email.
 */
const shell = (accent, eyebrow, heading, inner) => `
<div style="margin:0;padding:28px 12px;background-color:${PANEL};font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${LINE};">

        <tr><td style="height:4px;background-color:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:30px 34px 6px;">
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${MUTED};">${eyebrow}</p>
          <h1 style="margin:0;font-size:21px;line-height:1.32;color:${INK};font-weight:700;">${heading}</h1>
        </td></tr>

        ${inner}

        <tr><td style="padding:22px 34px 30px;border-top:1px solid ${LINE};">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
            {{siteName}} · <a href="{{siteUrl}}" style="color:${MUTED};text-decoration:underline;">{{siteUrl}}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</div>`.trim();

/** One label/value row. Rendered as a table so the label column cannot collapse in Outlook. */
const field = (label, value) => `
<tr>
  <td style="padding:9px 0;border-bottom:1px solid ${LINE};width:132px;vertical-align:top;">
    <span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};">${label}</span>
  </td>
  <td style="padding:9px 0;border-bottom:1px solid ${LINE};vertical-align:top;">
    <span style="font-size:14px;line-height:1.55;color:${INK};">${value}</span>
  </td>
</tr>`.trim();

/* ------------------------------------------------------------------ the two messages */

const CLIENT_CONFIRMATION = shell(
  MINT,
  'Enquiry received',
  'Thank you, {{clientName}}',
  `
<tr><td style="padding:14px 34px 0;">
  <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BODY};">
    Your enquiry has reached us and a senior engineer will read it personally — not a form filter.
    You can expect a reply within one business day, usually the same day.
  </p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:${PANEL};border-radius:10px;padding:0;margin:0 0 18px;">
    <tr><td style="padding:16px 18px;">
      <p style="margin:0 0 12px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};">What you sent us</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${field('Service', '{{serviceName}}')}
        ${field('Budget', '{{budget}}')}
        ${field('Your message', '{{message}}')}
      </table>
    </td></tr>
  </table>

  <p style="margin:0 0 6px;font-size:13px;line-height:1.65;color:${BODY};">
    Nothing you shared leaves our team. If you would like an NDA in place before the call, just reply and ask —
    we will send one over.
  </p>
</td></tr>

<tr><td style="padding:18px 34px 26px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background-color:${INDIGO};border-radius:9px;">
      <a href="{{siteUrl}}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
        Visit {{siteName}}
      </a>
    </td></tr>
  </table>
</td></tr>`.trim(),
);

const CLIENT_CONFIRMATION_TEXT = `
Thank you, {{clientName}}

Your enquiry has reached us and a senior engineer will read it personally.
You can expect a reply within one business day, usually the same day.

What you sent us
  Service : {{serviceName}}
  Budget  : {{budget}}
  Message : {{message}}

Nothing you shared leaves our team. If you would like an NDA in place before
the call, just reply and ask.

{{siteName}} — {{siteUrl}}
`.trim();

const ADMIN_NEW_LEAD = shell(
  INDIGO,
  'New enquiry',
  '{{clientName}} — {{serviceName}}',
  `
<tr><td style="padding:14px 34px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${field('Name', '{{clientName}}')}
    ${field('Email', '<a href="mailto:{{clientEmail}}" style="color:' + INDIGO + ';text-decoration:none;">{{clientEmail}}</a>')}
    ${field('Phone', '<a href="tel:{{clientPhone}}" style="color:' + INDIGO + ';text-decoration:none;">{{clientPhone}}</a>')}
    ${field('Company', '{{clientCompany}}')}
    ${field('Service', '{{serviceName}}')}
    ${field('Budget', '{{budget}}')}
    ${field('Came from', '{{sourcePage}}')}
    ${field('Submitted', '{{submittedAt}}')}
  </table>
</td></tr>

<tr><td style="padding:20px 34px 0;">
  <p style="margin:0 0 8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};">Their message</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:${PANEL};border-radius:10px;">
    <tr><td style="padding:16px 18px;">
      <p style="margin:0;font-size:15px;line-height:1.65;color:${INK};white-space:pre-wrap;">{{message}}</p>
    </td></tr>
  </table>
</td></tr>

<tr><td style="padding:20px 34px 26px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background-color:${INDIGO};border-radius:9px;">
      <a href="{{leadUrl}}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
        Open this lead
      </a>
    </td></tr>
  </table>
  <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">
    Replying to this email reaches {{clientName}} directly, and the reply is kept on the lead.
  </p>
</td></tr>`.trim(),
);

const ADMIN_NEW_LEAD_TEXT = `
New enquiry — {{clientName}} ({{serviceName}})

Name      : {{clientName}}
Email     : {{clientEmail}}
Phone     : {{clientPhone}}
Company   : {{clientCompany}}
Service   : {{serviceName}}
Budget    : {{budget}}
Came from : {{sourcePage}}
Submitted : {{submittedAt}}

Their message
{{message}}

Open this lead: {{leadUrl}}
`.trim();

/* ------------------------------------------------------------------ apply */

const TEMPLATES = [
  { kind: 'CLIENT_CONFIRMATION', html: CLIENT_CONFIRMATION, text: CLIENT_CONFIRMATION_TEXT },
  { kind: 'ADMIN_NEW_LEAD', html: ADMIN_NEW_LEAD, text: ADMIN_NEW_LEAD_TEXT },
];

(async () => {
  const uri = envValue('MONGODB_URI');
  if (!uri) {
    console.error('MONGODB_URI is not set in apps/api/.env');
    process.exit(1);
  }

  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(envValue('MONGODB_DB_NAME') || 'aptentech');
  const col = db.collection('emailtemplates');

  let changed = 0;

  for (const { kind, html, text } of TEMPLATES) {
    const current = await col.findOne({ kind });
    if (!current) {
      console.log(`${kind.padEnd(22)} not found — skipped`);
      continue;
    }

    const same = current.html === html && current.text === text;
    console.log(`${kind.padEnd(22)} ${same ? 'already current' : `${current.html?.length ?? 0} → ${html.length} chars`}`);
    if (same) continue;

    changed += 1;
    if (APPLY) await col.updateOne({ _id: current._id }, { $set: { html, text, updatedAt: new Date() } });
  }

  console.log('');
  if (!changed) console.log('Nothing to change.');
  else if (APPLY) console.log(`Updated ${changed} template(s). Edit them at /admin/email-templates.`);
  else console.log(`${changed} template(s) would change. To apply:\n  node scripts/apply-email-templates.js --apply\n`);

  await client.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
