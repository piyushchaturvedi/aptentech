#!/usr/bin/env node
/**
 * Answers "a form was submitted and no email arrived — why?"
 *
 * Mail can fail at four separate points and the symptom is identical at all four, so guessing
 * costs more than checking. In order: the driver is not SMTP, the credentials are missing, no
 * recipient is configured, or the send itself was refused by the provider. This reports each,
 * then shows what actually happened to the most recent enquiries.
 *
 * No secret is printed. The password is reported only as set or missing.
 *
 *   npm run diagnose-mail
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function env(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const problems = [];
const row = (label, value) => console.log(`  ${label.padEnd(26)} ${value}`);

(async () => {
  console.log('\n1. Mail configuration (apps/api/.env)\n');

  const driver = env('EMAIL_DRIVER');
  row('EMAIL_DRIVER', driver ?? '(not set)');
  if (driver !== 'smtp') {
    problems.push(
      `EMAIL_DRIVER is "${driver ?? 'not set'}", not "smtp". Nothing is delivered — messages are only recorded.`,
    );
  }

  row('SMTP_HOST', env('SMTP_HOST') ?? '(not set)');
  row('SMTP_PORT', env('SMTP_PORT') ?? '(not set)');
  row('SMTP_SECURE', env('SMTP_SECURE') ?? '(not set)');
  row('SMTP_USER', env('SMTP_USER') ?? '(not set)');
  row('SMTP_PASSWORD', env('SMTP_PASSWORD') ? 'set' : 'NOT SET');
  row('EMAIL_FROM', env('EMAIL_FROM') ?? '(not set)');

  if (!env('SMTP_PASSWORD')) {
    problems.push('SMTP_PASSWORD is empty, so the provider will refuse the connection.');
  }

  /*
    The mailbox is GoDaddy Professional Email, which is Titan running white-labelled. Its SMTP
    host is not Titan's public one — using that fails with "535 authentication failed", which
    reads like a wrong password and is not one.
  */
  if ((env('SMTP_HOST') ?? '').includes('titan.email')) {
    problems.push(
      'SMTP_HOST is a Titan host. This mailbox sends through smtpout.secureserver.net — ' +
        'Titan will reject the login with 535 even though the password is correct.',
    );
  }

  if (env('ALLOW_NO_EMAIL') === 'true') {
    console.log('\n  note: ALLOW_NO_EMAIL=true — the site is allowed to run with mail switched off.');
  }

  const uri = env('MONGODB_URI');
  if (!uri) {
    console.error('\nMONGODB_URI is not set — cannot check recipients or recent enquiries.');
    process.exit(1);
  }

  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(env('MONGODB_DB_NAME') || 'aptentech');

  console.log('\n2. Recipients (Admin → Settings → Lead email)\n');

  const settings = await db.collection('sitesettings').findOne({});
  const delivery = settings?.emailDelivery ?? {};
  row('notify admin', delivery.sendAdminNotification === false ? 'OFF' : 'on');
  row('confirm to client', delivery.sendClientConfirmation === false ? 'OFF' : 'on');
  row('notification recipient', delivery.notifyTo || '(none)');
  row('sender name', delivery.senderName || '(none)');

  if (!delivery.notifyTo) problems.push('No notification recipient is set, so nobody is emailed when an enquiry arrives.');
  if (delivery.sendAdminNotification === false) problems.push('Admin notifications are switched off in Settings.');
  if (delivery.sendClientConfirmation === false) problems.push('Client confirmations are switched off in Settings.');

  console.log('\n3. Templates\n');

  for (const t of await db.collection('emailtemplates').find({}).toArray()) {
    const html = (t.html ?? '').length;
    row(t.kind ?? t.name ?? 'template', `${t.active === false ? 'INACTIVE' : 'active'} · ${html} chars of HTML`);
    if (t.active === false) problems.push(`Template "${t.kind ?? t.name}" is inactive.`);
    if (!html) problems.push(`Template "${t.kind ?? t.name}" has no HTML body.`);
  }

  console.log('\n4. The last few enquiries\n');

  const leads = await db.collection('leads').find({}).sort({ createdAt: -1 }).limit(5).toArray();
  if (!leads.length) {
    console.log('  No leads stored at all — the form is not reaching the API.');
    problems.push('No leads are stored, so the failure is before mail: the form submission itself.');
  }

  for (const lead of leads) {
    const when = lead.createdAt ? new Date(lead.createdAt).toISOString().slice(0, 16).replace('T', ' ') : '?';
    console.log(`  ${when}  ${lead.name ?? '(no name)'} <${lead.email ?? '?'}>`);

    const conv = await db.collection('conversations').findOne({ leadId: lead._id });
    if (!conv) {
      console.log('      no conversation thread — no email was even attempted');
      continue;
    }
    for (const m of conv.messages ?? []) {
      const recipients = (m.to ?? []).join(', ') || '—';
      const tries = (m.attempts ?? []).length;
      console.log(
        `      ${String(m.kind ?? '?').padEnd(20)} ${String(m.status ?? '?').padEnd(8)}` +
          ` ${recipients}${tries > 1 ? `  (${tries} attempts)` : ''}`,
      );
      // The provider's own words, which is the one line that actually identifies the cause.
      if (m.lastError) console.log(`         ${String(m.lastError).slice(0, 130)}`);
      if (m.status === 'FAILED') {
        problems.push(`${m.kind} to ${recipients} failed — ${String(m.lastError ?? 'no error recorded').slice(0, 100)}`);
      }
    }
  }

  console.log('\n' + '-'.repeat(68) + '\n');

  if (!problems.length) {
    console.log('Configuration looks complete. If mail still does not arrive, run:');
    console.log('  cd apps/api && npm run test-email');
    console.log('which sends one real message and prints the provider\'s own error.\n');
  } else {
    console.log('Problems found:\n');
    for (const p of problems) console.log('  • ' + p);
    console.log('');
    process.exitCode = 1;
  }

  await client.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
