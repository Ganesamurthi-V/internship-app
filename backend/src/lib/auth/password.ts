/**
 * Password hashing — 07_Security_and_Privacy §5.
 *
 * bcrypt with cost factor 12. `bcryptjs` is the pure-JavaScript implementation,
 * chosen over the native `bcrypt` binding so the project installs and builds
 * identically on Windows, Linux and CI without a compiler toolchain.
 */

import bcrypt from 'bcryptjs';
import { BCRYPT_COST_FACTOR } from '@ims/shared-types';

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST_FACTOR);
}

/**
 * Verifies a password against a stored hash.
 *
 * `storedHash` is nullable because SSO accounts and unclaimed mentor invites have
 * no password. Those cases return false rather than throwing, so a login attempt
 * against a passwordless account is an ordinary credential failure and reveals
 * nothing about why.
 */
export async function verifyPassword(
  plaintext: string,
  storedHash: string | null,
): Promise<boolean> {
  if (!storedHash) {
    // Still burn comparable time so a passwordless account is not detectable by
    // how fast the request fails.
    await bcrypt.compare(plaintext, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plaintext, storedHash);
}

/**
 * A real bcrypt hash of a value nobody will submit, used purely to equalise
 * timing on the "user does not exist" and "user has no password" paths.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.O1LCkVGRUaHTFmqcJ0Kk3ROCkzXOJEO';

/**
 * Whether a stored hash was produced with a weaker cost than the current policy.
 * Lets login transparently re-hash a password when the policy is raised.
 */
export function needsRehash(storedHash: string): boolean {
  const cost = bcrypt.getRounds(storedHash);
  return cost < BCRYPT_COST_FACTOR;
}
