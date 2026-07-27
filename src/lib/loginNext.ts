// Post-login intended-destination guard. Only same-origin relative paths with
// an allow-listed prefix survive the login round-trip; everything else falls
// back to the role redirect. Prevents open-redirect via ?next=.
const ALLOWED_PREFIXES = ["/contractor", "/clients", "/client-portal", "/dashboard", "/sites", "/qr-codes", "/qr-activity"];

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const ok = ALLOWED_PREFIXES.some(
    (p) => raw === p || raw.startsWith(`${p}/`) || raw.startsWith(`${p}?`),
  );
  return ok ? raw : null;
}
