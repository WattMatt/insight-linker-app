/**
 * SHA-256 (hex) of a trimmed, lower-cased email address.
 *
 * Must stay byte-for-byte equal to the SQL in
 * supabase/migrations/20261105130000_admin_sign_in_history.sql:
 *   encode(sha256(convert_to(lower(btrim(email)), 'UTF8')), 'hex')
 * which is how admin_user_sign_in_history matches pre-sign-in reports (a
 * rejected code, an email that didn't send) to the right user. Only the hash is
 * stored; the address itself never is.
 *
 * Returns null for anything that isn't a plausible address, so junk input
 * can't create rows that look attributed.
 */
export async function emailSha256(email: unknown): Promise<string | null> {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 320 || !normalized.includes('@')) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
