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
const BODY = '#43496E';
const MUTED = '#8A93C4';
const LINE = '#E9EBF6';
const PANEL = '#F7F8FD';
const INDIGO = '#3A31DB';
const DEEP = '#1B1A4A';
const MINT = '#00C9A7';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * A button that survives Outlook.
 *
 * Outlook lays out with Word and ignores padding on an anchor, so the usual styled link
 * collapses to blue underlined text. The fix normally reached for is a VML rectangle inside an
 * `<!--[if mso]>` conditional — but the template sanitiser strips HTML comments, and it should:
 * anything inside a comment is never sanitised, and a client that honours conditional comments
 * would render it. Allowing them back would defeat the reason the sanitiser exists.
 *
 * So the padding goes on the table cell instead, which Outlook does honour. Same result, no
 * comment, nothing hidden from the sanitiser.
 */
const button = (label, href, colour = INDIGO) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="background-color:${colour};border-radius:10px;padding:15px 30px;text-align:center;">
    <a href="${href}" style="font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;display:inline-block;">${label}</a>
  </td>
</tr></table>`.trim();

/** One label/value row, as a table so the label column cannot collapse in Outlook. */
const field = (label, value) => `
<tr>
  <td style="padding:11px 0;border-bottom:1px solid ${LINE};width:130px;vertical-align:top;">
    <span style="font-family:${FONT};font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:${MUTED};font-weight:600;">${label}</span>
  </td>
  <td style="padding:11px 0;border-bottom:1px solid ${LINE};vertical-align:top;">
    <span style="font-family:${FONT};font-size:15px;line-height:1.55;color:${INK};">${value}</span>
  </td>
</tr>`.trim();

/**
 * The shell both messages share: a dark branded header, a white card, a quiet footer.
 *
 * The header is a solid colour rather than a gradient — Outlook drops CSS gradients entirely and
 * would render the wordmark on white, invisible. A flat band looks the same everywhere.
 */
const shell = (accent, eyebrow, heading, intro, inner) => `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>{{siteName}}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${PANEL};">
<!-- Shown in the inbox list beside the subject, then hidden in the message itself. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${intro}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:600px;max-width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;
                border:1px solid ${LINE};box-shadow:0 1px 2px rgba(20,19,56,.04);">

    <tr><td style="background-color:${DEEP};padding:26px 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;">
          <span style="font-family:${FONT};font-size:19px;font-weight:700;color:#ffffff;letter-spacing:-.01em;">{{siteName}}</span>
        </td>
        <td align="right" style="vertical-align:middle;">
          <span style="font-family:${FONT};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${accent};font-weight:600;">${eyebrow}</span>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="height:3px;background-color:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>

    <tr><td style="padding:36px 36px 0;">
      <h1 style="margin:0 0 14px;font-family:${FONT};font-size:25px;line-height:1.28;color:${INK};font-weight:700;letter-spacing:-.015em;">${heading}</h1>
      <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.7;color:${BODY};">${intro}</p>
    </td></tr>

    ${inner}

    <tr><td style="padding:24px 36px 32px;background-color:${PANEL};border-top:1px solid ${LINE};">
      <p style="margin:0 0 4px;font-family:${FONT};font-size:13px;line-height:1.6;color:${INK};font-weight:600;">{{siteName}}</p>
      <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.7;color:${MUTED};">
        <a href="{{siteUrl}}" style="color:${MUTED};text-decoration:none;">{{siteUrl}}</a>
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`.trim();

/* ------------------------------------------------------------------ client confirmation */

const CLIENT_CONFIRMATION = shell(
  MINT,
  'Enquiry received',
  'Thank you, {{clientName}}',
  'A senior engineer will read your enquiry personally and reply within one business day — usually the same day.',
  `
<tr><td style="padding:28px 36px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:${PANEL};border-radius:12px;border:1px solid ${LINE};">
    <tr><td style="padding:20px 22px;">
      <p style="margin:0 0 6px;font-family:${FONT};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};font-weight:600;">What you sent us</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${field('Service', '{{serviceName}}')}
        ${field('Budget', '{{budget}}')}
      </table>
      <p style="margin:14px 0 0;font-family:${FONT};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};font-weight:600;">Your message</p>
      <p style="margin:6px 0 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${INK};white-space:pre-wrap;">{{message}}</p>
    </td></tr>
  </table>
</td></tr>

<tr><td style="padding:24px 36px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="border-left:3px solid ${MINT};">
    <tr><td style="padding:2px 0 2px 16px;">
      <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.7;color:${BODY};">
        Nothing you shared leaves our team. If you would like an NDA in place before we talk, reply and ask —
        we will send one over.
      </p>
    </td></tr>
  </table>
</td></tr>

<tr><td style="padding:28px 36px 34px;">
  ${button('Visit {{siteName}}', '{{siteUrl}}', INDIGO)}
</td></tr>`.trim(),
);

const CLIENT_CONFIRMATION_TEXT = `
Thank you, {{clientName}}

A senior engineer will read your enquiry personally and reply within one
business day — usually the same day.

WHAT YOU SENT US
  Service : {{serviceName}}
  Budget  : {{budget}}

  {{message}}

Nothing you shared leaves our team. If you would like an NDA in place before we
talk, reply and ask — we will send one over.

{{siteName}}
{{siteUrl}}
`.trim();

/* ------------------------------------------------------------------ admin notification */

const ADMIN_NEW_LEAD = shell(
  MINT,
  'New enquiry',
  '{{clientName}}',
  'Wants to talk about {{serviceName}}. Full details below.',
  `
<tr><td style="padding:26px 36px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${field('Email', '<a href="mailto:{{clientEmail}}" style="color:' + INDIGO + ';text-decoration:none;font-weight:600;">{{clientEmail}}</a>')}
    ${field('Phone', '<a href="tel:{{clientPhone}}" style="color:' + INDIGO + ';text-decoration:none;font-weight:600;">{{clientPhone}}</a>')}
    ${field('Company', '{{clientCompany}}')}
    ${field('Service', '{{serviceName}}')}
    ${field('Budget', '{{budget}}')}
    ${field('Came from', '{{sourcePage}}')}
    ${field('Submitted', '{{submittedAt}}')}
  </table>
</td></tr>

<tr><td style="padding:26px 36px 0;">
  <p style="margin:0 0 8px;font-family:${FONT};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};font-weight:600;">Their message</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:${PANEL};border-radius:12px;border:1px solid ${LINE};">
    <tr><td style="padding:20px 22px;">
      <p style="margin:0;font-family:${FONT};font-size:16px;line-height:1.7;color:${INK};white-space:pre-wrap;">{{message}}</p>
    </td></tr>
  </table>
</td></tr>

<tr><td style="padding:28px 36px 34px;">
  ${button('Open this lead', '{{leadUrl}}', INDIGO)}
  <p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:1.7;color:${MUTED};">
    Replying to this email reaches {{clientName}} directly, and the reply is kept on the lead.
  </p>
</td></tr>`.trim(),
);

const ADMIN_NEW_LEAD_TEXT = `
NEW ENQUIRY — {{clientName}}

Wants to talk about {{serviceName}}.

  Email     : {{clientEmail}}
  Phone     : {{clientPhone}}
  Company   : {{clientCompany}}
  Service   : {{serviceName}}
  Budget    : {{budget}}
  Came from : {{sourcePage}}
  Submitted : {{submittedAt}}

THEIR MESSAGE
{{message}}

Open this lead: {{leadUrl}}

Replying to this email reaches {{clientName}} directly, and the reply is kept on
the lead.
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
