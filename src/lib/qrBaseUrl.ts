// Single source of truth for the public origin that QR codes and public
// landing links point at.
//
// QR PNGs are PERMANENT artifacts (printed, stored). The fallback order is
// deliberately `settings.qr_base_url → DEFAULT_QR_ORIGIN` and intentionally
// does NOT use window.location.origin: generating from a Vercel preview /
// staging / localhost deploy would otherwise bake an ephemeral, soon-dead
// origin into the QR code.
//
// DEFAULT_QR_ORIGIN matches the live qr-redirect function and the PDF/report
// defaults, so legacy-redirect targets and freshly-generated QR targets agree.
// It is only used when settings.qr_base_url is unset (production sets it).
export const DEFAULT_QR_ORIGIN = "https://watsonmattheus.com";

/** Normalize a configured base URL (or the default) — strips a trailing slash. */
export function resolveQrBaseUrl(configured?: string | null): string {
  return (configured?.trim() || DEFAULT_QR_ORIGIN).replace(/\/$/, "");
}

/** Build the public landing URL for a subsection. */
export function publicSubsectionUrl(
  subsectionId: string,
  configured?: string | null,
): string {
  return `${resolveQrBaseUrl(configured)}/public/subsections/${subsectionId}`;
}
