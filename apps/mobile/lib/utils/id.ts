/**
 * Client-side UUID generation for offline idempotency keys.
 *
 * `clientId` is what makes offline sync safe: the server dedups on it, so a retried
 * batch cannot create a second record (03_TechSpec §5, 09_Test_Plan §4). That means
 * uniqueness genuinely matters — a collision between two drafts would make one
 * silently overwrite or shadow the other.
 *
 * It does *not* need to be unpredictable. The key is never a capability: the server
 * still authorises every synced record against the JWT subject, so guessing someone
 * else's clientId gains nothing.
 *
 * Strategy, in order of preference:
 *   1. `crypto.randomUUID` — present on modern Hermes builds.
 *   2. `crypto.getRandomValues` — assemble a v4 from CSPRNG bytes.
 *   3. `Math.random` plus a timestamp — last resort. Documented rather than silent.
 */

interface MaybeCrypto {
  randomUUID?: () => string;
  getRandomValues?: <T extends Uint8Array>(array: T) => T;
}

const webCrypto = (globalThis as { crypto?: MaybeCrypto }).crypto;

/** Formats 16 bytes as a RFC 4122 version 4 UUID string. */
function formatV4(bytes: Uint8Array): string {
  // Version 4 and the IETF variant bits.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    hex.push((bytes[index] ?? 0).toString(16).padStart(2, '0'));
  }

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export function generateClientId(): string {
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
    return formatV4(bytes);
  }

  // Fallback. Mixes the clock into the first six bytes so two drafts created in the
  // same millisecond on the same device still differ, and fills the rest from
  // Math.random. Weaker than a CSPRNG, but sufficient for a uniqueness-only key.
  const timestamp = Date.now();
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = (timestamp >>> (8 * (5 - index))) & 0xff;
  }
  for (let index = 6; index < 16; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return formatV4(bytes);
}
