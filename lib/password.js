// One definition of what counts as an acceptable password.
//
// Imported by the sign-up form and by anything server-side that needs to state
// the rule, so the checklist a person sees and the rule that is enforced can
// never drift apart.
//
// The shape of the rules follows NIST SP 800-63B rather than the older
// "one uppercase, one symbol" folklore: length does far more work than
// composition, and forced symbols mostly produce Password1! — which is in
// every cracking dictionary. So: a real minimum length, a block on the
// obvious ones, and a block on using your own email as your password.
//
// Client-safe. No server imports.

export const MIN_LENGTH = 10;
export const MAX_LENGTH = 128;

// Substrings that make a password worthless no matter what else is in it.
// Short list on purpose — this is a floor, not a dictionary check.
const BANNED = [
  "password", "passw0rd", "letmein", "welcome", "qwerty", "asdfgh", "zxcvbn",
  "iloveyou", "admin", "root", "111111", "123456", "abc123", "monkey",
  "dragon", "sunshine", "princess", "football", "madbot", "getmadbot",
];

const SEQUENCES = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop"];

function hasLongRun(value) {
  // aaaa, 1111 — four or more of the same character in a row.
  return /(.)\1{3,}/.test(value);
}

function hasSequence(value) {
  const v = value.toLowerCase();
  for (const seq of SEQUENCES) {
    for (let i = 0; i + 4 <= seq.length; i += 1) {
      const run = seq.slice(i, i + 4);
      if (v.includes(run) || v.includes([...run].reverse().join(""))) return true;
    }
  }
  return false;
}

/**
 * The rules, each one checkable on its own so the form can show a live list
 * rather than a single "invalid password" after submission.
 *
 * Each returns true when satisfied.
 */
export function checkRules(password = "", { email = "", name = "" } = {}) {
  const value = String(password);
  const local = String(email).split("@")[0] || "";
  const lower = value.toLowerCase();

  return [
    {
      id: "length",
      label: `At least ${MIN_LENGTH} characters`,
      ok: value.length >= MIN_LENGTH && value.length <= MAX_LENGTH,
    },
    {
      id: "letter",
      label: "A letter",
      ok: /[a-zA-Z]/.test(value),
    },
    {
      id: "number",
      label: "A number or a symbol",
      ok: /[0-9]/.test(value) || /[^a-zA-Z0-9]/.test(value),
    },
    {
      id: "notCommon",
      label: "Not a commonly used password",
      ok:
        value.length > 0 &&
        !BANNED.some((b) => lower.includes(b)) &&
        !hasLongRun(value) &&
        !hasSequence(value),
    },
    {
      id: "notPersonal",
      label: "Not your name or email address",
      // Compared with separators stripped from both sides. Matching the raw
      // string only caught "Siddhant Mallah" and let "SiddhantMallah7",
      // "Siddhant.Mallah7" and "siddhant-mallah-1" straight through, which
      // is to say it blocked the form nobody types and allowed the form
      // everyone does.
      ok: (() => {
        if (!value.length) return false;
        const squashed = lower.replace(/[^a-z0-9]/g, "");
        const nameKey = String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
        const localKey = local.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (localKey.length >= 3 && squashed.includes(localKey)) return false;
        if (nameKey.length >= 3 && squashed.includes(nameKey)) return false;
        return true;
      })(),
    },
  ];
}

export function isAcceptable(password, context) {
  return checkRules(password, context).every((r) => r.ok);
}

/**
 * A coarse strength read for the meter, 0-4. Deliberately not presented as a
 * percentage or a crack time: both imply a precision this does not have.
 */
export function strength(password = "", context) {
  const value = String(password);
  if (!value) return { score: 0, label: "" };
  if (!isAcceptable(value, context)) return { score: 1, label: "Not yet usable" };

  let score = 2;
  if (value.length >= 14) score += 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(value)).length;
  if (value.length >= 18 || (classes >= 3 && value.length >= 16)) score += 1;

  return { score, label: ["", "Not yet usable", "Fine", "Good", "Strong"][score] };
}

/**
 * Firebase's own error codes for a password it refuses, mapped to something a
 * person can act on. Firebase enforces a 6-character floor of its own; ours is
 * stricter, so in practice a rejection from Firebase means the client-side
 * check was bypassed.
 */
export function serverPasswordError(code = "") {
  if (code.includes("weak-password")) return `Use at least ${MIN_LENGTH} characters.`;
  return null;
}
