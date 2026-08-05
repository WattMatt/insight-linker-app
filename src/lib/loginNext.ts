// Post-login intended-destination guard. Only same-origin relative paths with
// an allow-listed prefix survive the login round-trip; everything else falls
// back to the role redirect. Prevents open-redirect via ?next=, and resolves
// dot-segments (e.g. /dashboard/../../settings) via URL normalization so the
// allow-list check runs against the actual resolved path, not the raw string.
const ALLOWED_PREFIXES = ["/contractor", "/clients", "/client-portal", "/dashboard", "/sites", "/qr-codes", "/qr-activity"];

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;

  let resolved: URL;
  try {
    resolved = new URL(raw, "http://internal.invalid");
  } catch {
    return null;
  }
  if (resolved.origin !== "http://internal.invalid") return null; // defense-in-depth

  const path = resolved.pathname + resolved.search; // dot-segments collapsed by URL
  const ok = ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`),
  );
  return ok ? path : null; // return the NORMALIZED value, never raw
}
