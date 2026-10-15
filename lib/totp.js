// Time-based one-time passwords (RFC 6238), for the admin console's second
// factor. Server-only: node:crypto. No dependency, on purpose: this is
// forty lines of arithmetic, and it is checked in tests/totp.test.mjs against
// the RFC's own test vectors.
//
// Codes are 6 digits on a 30-second step, HMAC-SHA1, which is what every
// authenticator app (Google Authenticator, 1Password, Authy, Microsoft
// Authenticator) defaults to.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str || "").toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Not a base32 secret.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret: 160 bits, the RFC's recommended size for SHA-1. */
export function generateSecret() {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226) for one counter value. */
export function hotp(secretBuf, counter, digits = DIGITS, algorithm = "sha1") {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, secretBuf).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) | ((mac[offset + 1] & 0xff) << 16) | ((mac[offset + 2] & 0xff) << 8) | (mac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** The code for a moment in time. */
export function totp(secret, { time = Date.now(), digits = DIGITS, algorithm = "sha1" } = {}) {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  return hotp(key, Math.floor(time / 1000 / STEP_SECONDS), digits, algorithm);
}

/**
 * Checks a code, allowing one step either side for clock drift. Returns the
 * step number that matched (so a caller can refuse a replayed code) or null.
 */
export function verifyTotp(secret, code, { time = Date.now(), window = 1 } = {}) {
  const given = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const key = base32Decode(secret);
  const step = Math.floor(time / 1000 / STEP_SECONDS);
  for (let d = -window; d <= window; d += 1) {
    const expected = hotp(key, step + d);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return step + d;
  }
  return null;
}

/** The otpauth:// URI an authenticator app understands. */
export function otpauthUri({ secret, account, issuer = "MADBOT Admin" }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}
