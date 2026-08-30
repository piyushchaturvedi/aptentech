import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * Argon2id password hashing.
 *
 * Argon2id is memory-hard, which is what makes large-scale offline cracking expensive in
 * a way bcrypt's CPU-only cost factor no longer is. Parameters follow current OWASP
 * guidance (19 MiB, 2 iterations, 1 degree of parallelism); the cost is encoded in the
 * hash string, so raising these later still verifies existing passwords.
 */
const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    // A malformed or truncated hash must read as "wrong password", never as an error the
    // caller could distinguish — that difference is an account-enumeration oracle.
    return false;
  }
}

/**
 * Constant-ish work for accounts that do not exist.
 *
 * Without this, "no such user" returns in ~1 ms while a real user costs ~50 ms, and the
 * timing difference tells an attacker which email addresses are registered.
 */
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zYWx0LXZhbHVl$0000000000000000000000000000000000000000000';

export async function burnTime(): Promise<void> {
  await verifyPassword(DUMMY_HASH, 'timing-equalisation');
}
