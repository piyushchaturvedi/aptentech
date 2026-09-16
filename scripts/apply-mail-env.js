#!/usr/bin/env node
/**
 * Writes the mail settings into `apps/api/.env` so nobody has to edit it by hand.
 *
 * The non-secret half — host, port, TLS mode, the mailbox address and the envelope sender — is
 * committed just below, because none of it is a credential and keeping it in the repository is
 * what makes a deploy able to configure mail on its own.
 *
 * The password is **not** here and never will be. It is read from the environment, which on a
 * deploy comes from a GitHub Actions secret. Git history is permanent: a password committed and
 * then deleted is still in every clone and every fork forever, so the one value that must not
 * leak is the one value that does not travel with the code.
 *
 *   SMTP_PASSWORD=... node scripts/apply-mail-env.js
 *
 * Without SMTP_PASSWORD in the environment it leaves any password already in the file alone and
 * reports what is missing, rather than wiping a working configuration.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const API_ENV = path.join(ROOT, 'apps/api/.env');
const WEB_ENV = path.join(ROOT, 'apps/web/.env.local');

/**
 * The mailbox this site sends from. Not secrets — an SMTP host and a published address.
 *
 * The host is `smtpout.secureserver.net`, not `smtp.titan.email`, and the difference matters.
 * The mailbox is GoDaddy Professional Email, which is Titan running white-labelled — so webmail
 * lives at secureserver.titan.email and looks like Titan, while the mail itself is routed by
 * GoDaddy. The domain's own DNS says so: MX points at secureserver.net and SPF includes it.
 * Sending through Titan's public host with these credentials fails with
 * "535 authentication failed", which reads like a wrong password and is not one — the account
 * simply does not exist on that server.
 *
 * `SMTP_SECURE=false` with port 587 is STARTTLS. Port 465 with `true` also works here; 587 is
 * kept because it is the more commonly open port outbound.
 */
const SETTINGS = {
  EMAIL_DRIVER: 'smtp',
  EMAIL_FROM: 'sales@aptentech.com',
  EMAIL_MESSAGE_ID_DOMAIN: 'aptentech.com',
  SMTP_HOST: 'smtpout.secureserver.net',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'sales@aptentech.com',
};

/** Reads the file into ordered lines so comments and hand-added keys survive a rewrite. */
function readEnv(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/);
}

function setKey(lines, key, value) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) {
    const unchanged = lines[index] === `${key}=${value}`;
    lines[index] = `${key}=${value}`;
    return unchanged ? 'unchanged' : 'updated';
  }
  lines.push(`${key}=${value}`);
  return 'added';
}

function currentValue(lines, key) {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1) : '';
}

function write(file, lines) {
  // 600 so the file is readable only by the account that runs the app.
  fs.writeFileSync(file, lines.join('\n'), { mode: 0o600 });
}

const lines = readEnv(API_ENV);
if (!lines.length) {
  console.error(`${API_ENV} does not exist. Run the deploy first — it creates the file.`);
  process.exit(1);
}

const report = [];
for (const [key, value] of Object.entries(SETTINGS)) {
  report.push([key, setKey(lines, key, value)]);
}

/*
  `ALLOW_NO_EMAIL` exists to let the site launch with mail switched off. Leaving it set once SMTP
  is configured is harmless but misleading — it reads as "mail is not expected to work" in a file
  that now says it should.
*/
const allowIndex = lines.findIndex((line) => line.startsWith('ALLOW_NO_EMAIL='));
if (allowIndex >= 0) {
  lines.splice(allowIndex, 1);
  report.push(['ALLOW_NO_EMAIL', 'removed — mail is configured now']);
}

const password = process.env.SMTP_PASSWORD ?? '';
if (password) {
  report.push(['SMTP_PASSWORD', setKey(lines, 'SMTP_PASSWORD', password)]);
} else if (currentValue(lines, 'SMTP_PASSWORD')) {
  report.push(['SMTP_PASSWORD', 'kept — already set, and none was supplied']);
} else {
  report.push(['SMTP_PASSWORD', 'MISSING']);
}

write(API_ENV, lines);

/*
  The web app reads the same file. It is a byte copy rather than two maintained files because the
  two apps authenticate to each other with a shared token, and a mismatch is not a startup error —
  the site renders every page empty instead.
*/
if (fs.existsSync(WEB_ENV)) write(WEB_ENV, lines);

console.log('Mail settings');
for (const [key, status] of report) console.log(`  ${key.padEnd(24)} ${status}`);
console.log('\nNo secret value was printed.');

if (report.some(([, status]) => status === 'MISSING')) {
  console.log('\nSMTP_PASSWORD is not set, so mail will not authenticate.');
  console.log('On a deploy it comes from the SMTP_PASSWORD repository secret in GitHub Actions.');
  console.log('To set it by hand once:  SMTP_PASSWORD=... node scripts/apply-mail-env.js');
  process.exitCode = 1;
}
