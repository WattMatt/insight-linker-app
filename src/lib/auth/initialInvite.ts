/**
 * Initial-invite credential helpers.
 *
 * Canonical, unit-tested home for generating the one-time initial password that
 * is emailed to a newly-invited user. The invite-user edge function sets this
 * password with `requires_password_change: true`, so it is only ever valid until
 * the user's first successful login, at which point the app forces them through
 * /auth/reset-password (see src/views/auth/Login.tsx + src/views/Auth.tsx).
 *
 * Pure + runtime-agnostic: uses Web Crypto (`globalThis.crypto`), which exists in
 * the browser, Node 20+, and Deno — so the admin UI can generate the password
 * client-side and pass it to the edge function, and vitest can test it directly.
 */

export const INITIAL_PASSWORD_POLICY = {
  length: 16,
  // Deliberately excludes visually ambiguous characters (0/O, 1/l/I) so a user
  // reading the password out of an email can type it without confusion, and
  // excludes quote/backslash characters that break copy-paste out of some mail
  // clients. Every class below is guaranteed to appear at least once.
  lower: "abcdefghijkmnpqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digits: "23456789",
  symbols: "!@#$%^&*-_=+?",
} as const;

/** Unbiased index into [0, max) using rejection sampling over Web Crypto bytes. */
function randomIndex(max: number): number {
  if (max <= 0) throw new Error("randomIndex: max must be positive");
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error("Web Crypto unavailable: cannot generate a secure password");
  }
  // Largest multiple of `max` that fits in a byte; reject values above it so the
  // modulo is uniform (no bias toward low indices).
  const limit = 256 - (256 % max);
  const buf = new Uint8Array(1);
  let value = 0;
  do {
    cryptoObj.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

function pick(chars: string): string {
  return chars[randomIndex(chars.length)];
}

/** Fisher–Yates shuffle using the same unbiased source. */
function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

/**
 * Generate a 16-character initial password guaranteed to contain at least one
 * lowercase, uppercase, digit and symbol — satisfying the app's password policy
 * (see setPasswordSchema) so the account is immediately usable, while still being
 * forced to change on first login.
 */
export function generateInitialPassword(): string {
  const { length, lower, upper, digits, symbols } = INITIAL_PASSWORD_POLICY;
  const all = lower + upper + digits + symbols;

  // Seed one of each required class, then fill the rest from the full alphabet.
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: length - required.length }, () => pick(all));

  return shuffle([...required, ...rest]).join("");
}
