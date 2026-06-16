// Single source of truth for the public origin that QR codes and public
// landing links point at.
//
// QR PNGs are PERMANENT artifacts (printed, stored). The fallback order is
// deliberately `settings.qr_base_url → DEFAULT_QR_ORIGIN` and intentionally
// does NOT use window.location.origin: generating from a Vercel preview /
// staging / localhost deploy would otherwise bake an ephemeral, soon-dead
// origin into the QR code.
//
// DEFAULT_QR_ORIGIN is the canonical Next.js production deployment on Vercel.
// IMPORTANT: it must NOT be the Lovable host (wm-compliance.lovable.app) — that's
// a separate, divergent Vite build that does not receive our deploys. It is only
// used when settings.qr_base_url is unset (production sets it to this Vercel URL).
export const DEFAULT_QR_ORIGIN = "https://insight-linker-app.vercel.app";

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
