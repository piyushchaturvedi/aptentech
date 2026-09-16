/**
 * Standalone SMTP check.
 *
 * Run with `npm run test-email` from apps/api. Reads the same env the server would, tries
 * an authenticated connection, then sends one real message — so "is my SMTP config right"
 * has a yes/no answer with the exact provider error attached, without needing to submit a
 * form, dig through request logs, or have MongoDB reachable at all.
 */
import { env } from '../config/env';

async function main(): Promise<void> {
  console.log(`EMAIL_DRIVER = ${env.EMAIL_DRIVER}`);

  if (env.EMAIL_DRIVER !== 'smtp') {
    console.log(
      `\nNothing to test — EMAIL_DRIVER is "${env.EMAIL_DRIVER}", not "smtp".\n` +
        'Set EMAIL_DRIVER=smtp in apps/api/.env and re-run this to actually exercise SMTP.',
    );
    process.exitCode = 1;
    return;
  }

  const to = env.ADMIN_NOTIFICATION_EMAIL || env.EMAIL_FROM;
  if (!to) {
    console.log('\nNo ADMIN_NOTIFICATION_EMAIL (and no EMAIL_FROM) set — nowhere to send the test to.');
    process.exitCode = 1;
    return;
  }

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    console.log('\nSMTP_HOST, SMTP_USER or SMTP_PASSWORD is missing from apps/api/.env.');
    process.exitCode = 1;
    return;
  }

  const nodemailer = await import('nodemailer').catch(() => {
    throw new Error('The "nodemailer" package is not installed — run npm install in apps/api first.');
  });

  console.log(`Connecting to ${env.SMTP_HOST}:${env.SMTP_PORT} (secure=${env.SMTP_SECURE}) as ${env.SMTP_USER} ...`);

  const transport = nodemailer.default.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });

  try {
    await transport.verify();
    console.log('✓ Connected and authenticated.');
  } catch (err) {
    console.error('\n✗ SMTP login FAILED:', err instanceof Error ? err.message : err);
    console.error(
      '\nCommon causes: wrong SMTP_HOST/SMTP_PORT, wrong SMTP_PASSWORD, SMTP_SECURE set wrong for the port\n' +
        '(587 wants SMTP_SECURE=false, 465 wants SMTP_SECURE=true), or the mailbox provider blocking this\n' +
        'connection (new device / unusual location, 2FA required, app-password needed, etc).',
    );
    process.exitCode = 1;
    return;
  }

  try {
    const info = await transport.sendMail({
      from: { name: 'AptenTech — test', address: env.EMAIL_FROM },
      to,
      subject: 'AptenTech — SMTP test',
      text: 'If you are reading this in your inbox, SMTP delivery from the site is working.',
    });
    console.log(`✓ Test email sent to ${to}. Provider message id: ${info.messageId ?? '(none returned)'}`);
    console.log('\nCheck that inbox (and its spam folder) for a message titled "AptenTech — SMTP test".');
  } catch (err) {
    console.error('\n✗ Login worked, but sending the test message FAILED:', err instanceof Error ? err.message : err);
    console.error(
      '\nCommon causes: EMAIL_FROM address not verified with the provider, or the provider rejecting the\n' +
        'sender/recipient pair.',
    );
    process.exitCode = 1;
  }
}

main();
