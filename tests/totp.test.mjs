// lib/totp.js — the admin console's second factor, against RFC 6238's own
// test vectors.
//   node --no-warnings --import ./tests/_register.mjs tests/totp.test.mjs
import { suite, test, eq, truthy, report } from "./_harness.mjs";

const T = await import("../lib/totp.js");

suite("lib/totp.js — RFC 6238 and the checks around it");

// RFC 6238 Appendix B: the SHA-1 seed is the ASCII string "12345678901234567890",
// 8-digit codes. These are the published values.
const SEED = Buffer.from("12345678901234567890");
const VECTORS = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

await test("matches every RFC 6238 SHA-1 test vector", () => {
  for (const [seconds, code] of VECTORS) {
    eq(T.totp(SEED, { time: seconds * 1000, digits: 8 }), code, `T=${seconds}`);
  }
});

await test("base32 round-trips, and decodes the RFC seed", () => {
  const b32 = T.base32Encode(SEED);
  eq(b32, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "encoded");
  eq(T.base32Decode(b32).toString(), "12345678901234567890", "decoded");
  eq(T.base32Decode("gezd gnbv-gy3t qojq gezd gnbv gy3t qojq").toString(), "12345678901234567890", "spaces, dashes, lower case");
});

await test("a fresh secret is 160 bits of base32", () => {
  const s = T.generateSecret();
  eq(s.length, 32, "length");
  eq(T.base32Decode(s).length, 20, "bytes");
  truthy(s !== T.generateSecret(), "two secrets differ");
});

await test("verify accepts the current code and one step of drift either side, and nothing further", () => {
  const secret = T.generateSecret();
  const now = Date.UTC(2026, 9, 14, 12, 0, 15);
  const at = (ms) => T.totp(secret, { time: ms });
  truthy(T.verifyTotp(secret, at(now), { time: now }) !== null, "now");
  truthy(T.verifyTotp(secret, at(now - 30_000), { time: now }) !== null, "30s behind");
  truthy(T.verifyTotp(secret, at(now + 30_000), { time: now }) !== null, "30s ahead");
  eq(T.verifyTotp(secret, at(now - 90_000), { time: now }), null, "90s behind");
});

await test("verify returns the matched step, so a replayed code can be refused", () => {
  const secret = T.generateSecret();
  const now = Date.UTC(2026, 9, 14, 12, 0, 0);
  eq(T.verifyTotp(secret, T.totp(secret, { time: now }), { time: now }), Math.floor(now / 30_000), "step");
});

await test("anything that isn't six digits is refused before any comparison", () => {
  const secret = T.generateSecret();
  for (const bad of ["", "12345", "1234567", "abcdef", null, undefined, "12 34 5"]) {
    eq(T.verifyTotp(secret, bad), null, JSON.stringify(bad));
  }
});

await test("the otpauth URI carries the secret, issuer and parameters an authenticator needs", () => {
  const uri = T.otpauthUri({ secret: "ABC", account: "ops@example.com" });
  truthy(uri.startsWith("otpauth://totp/MADBOT%20Admin%3Aops%40example.com?"), uri);
  for (const p of ["secret=ABC", "issuer=MADBOT+Admin", "digits=6", "period=30", "algorithm=SHA1"]) truthy(uri.includes(p), p);
});

report();
