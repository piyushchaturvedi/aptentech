/**
 * Resets an existing admin's password from the command line.
 *
 * `create-admin` deliberately refuses to overwrite an account and points at the CMS instead,
 * which is right for the ordinary case — one admin should not silently change another's
 * credentials. But it leaves no way back when nobody can sign in at all: the only account's
 * password is lost, the CMS is the only place to change it, and the CMS needs the password.
 * This command is the way out of that, and it requires shell access to the server to run.
 *
 * Like `create-admin`, the password is never hardcoded: it comes from `ADMIN_PASSWORD` or is
 * generated here and printed once, and the account is flagged `mustChangePassword` so the
 * temporary credential cannot survive first use.
 *
 *   npm run reset-admin-password -- --email you@aptentech.com
 */
import crypto from 'node:crypto';
import { connectDb, disconnectDb } from '../config/db';
import { AdminUserModel, SessionModel, syncIndexes } from '../models';
import { hashPassword } from '../auth/password';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Readable but high-entropy: 32 base64url chars is ~192 bits. */
function generatePassword(): string {
  return crypto.randomBytes(24).toString('base64url');
}

async function main(): Promise<void> {
  const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Provide a valid address: npm run reset-admin-password -- --email you@aptentech.com');
  }

  // An empty or whitespace-only ADMIN_PASSWORD means "not supplied", not "use an empty
  // password" — the same trap `create-admin` guards against.
  const supplied = process.env.ADMIN_PASSWORD?.trim() || undefined;
  if (supplied !== undefined && supplied.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  }

  const password = supplied ?? generatePassword();

  await connectDb();
  await syncIndexes();

  const user = await AdminUserModel.findOne({ email });
  if (!user) {
    throw new Error(`No admin with ${email}. Use create-admin to make one.`);
  }

  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = true;
  await user.save();

  /*
    Every existing session for this account is destroyed.

    A password reset is also how a lost or stolen session is revoked, so leaving old sessions
    valid would defeat the point: whoever held one would keep their access despite the reset.
  */
  const { deletedCount } = await SessionModel.deleteMany({ adminId: user._id });

  const banner = '='.repeat(66);
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      banner,
      '  Admin password reset',
      banner,
      `  Email    : ${user.email}`,
      `  Role     : ${user.role}`,
      supplied ? '  Password : (taken from ADMIN_PASSWORD)' : `  Password : ${password}`,
      '',
      '  This password must be changed at first sign-in.',
      `  Signed-out sessions: ${deletedCount}`,
      banner,
      '',
    ].join('\n'),
  );

  await disconnectDb();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
