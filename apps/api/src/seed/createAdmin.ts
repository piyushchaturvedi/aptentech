/**
 * Creates the first admin account.
 *
 * The password is never hardcoded. It comes from `ADMIN_PASSWORD`, or is generated here
 * and printed once. Either way the account is flagged `mustChangePassword`, so the
 * temporary credential cannot survive first use — every admin route is blocked until a new
 * password is set.
 *
 *   npm run create-admin -- --email you@aptentech.com --name "Your Name" --role SUPER_ADMIN
 */
import crypto from 'node:crypto';
import { connectDb, disconnectDb } from '../config/db';
import { AdminUserModel, syncIndexes } from '../models';
import { hashPassword } from '../auth/password';
import { ADMIN_ROLES, type AdminRole } from '@aptentech/shared';

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
  const name = arg('name') ?? process.env.ADMIN_NAME ?? 'Aptentech Admin';
  const roleInput = (arg('role') ?? process.env.ADMIN_ROLE ?? 'SUPER_ADMIN') as AdminRole;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Provide a valid address: npm run create-admin -- --email you@aptentech.com --name "Your Name"');
  }
  if (!ADMIN_ROLES.includes(roleInput)) {
    throw new Error(`Role must be one of: ${ADMIN_ROLES.join(', ')}`);
  }

  // An empty or whitespace-only ADMIN_PASSWORD means "not supplied", not "use an empty
  // password". Treating `""` as a value would create an account with no real credential —
  // easy to do by exporting the variable without a value.
  const supplied = process.env.ADMIN_PASSWORD?.trim() || undefined;
  if (supplied !== undefined && supplied.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  }

  const password = supplied ?? generatePassword();

  await connectDb();
  await syncIndexes();

  const existing = await AdminUserModel.findOne({ email }).lean();
  if (existing) {
    // Resetting an existing account is a deliberate, separate action — this command will
    // not silently overwrite someone's credentials.
    throw new Error(`An admin with ${email} already exists. Use the CMS to change their password.`);
  }

  const user = await AdminUserModel.create({
    email,
    name,
    passwordHash: await hashPassword(password),
    role: roleInput,
    active: true,
    mustChangePassword: true,
  });

  const banner = '='.repeat(66);
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      banner,
      '  Admin account created',
      banner,
      `  Email    : ${user.email}`,
      `  Role     : ${user.role}`,
      supplied ? '  Password : (taken from ADMIN_PASSWORD)' : `  Password : ${password}`,
      '',
      '  This password must be changed at first sign-in.',
      supplied ? '' : '  It is shown once and is not stored anywhere in plain text.',
      '',
      '  Sign in at http://localhost:3000/admin/login',
      banner,
      '',
    ]
      .filter((l) => l !== '')
      .join('\n'),
  );

  await disconnectDb();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(`\nCould not create the admin account: ${(err as Error).message}\n`);
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
