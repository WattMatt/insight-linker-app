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

// Build the STABLE redirect URL that QR codes encode. Unlike publicSubsectionUrl,
// this points at the Supabase `qr-redirect` edge function (verify_jwt=false), whose
// host is the project ref — NOT the frontend domain. An unauthenticated scan hits
// the function, which 302s to `${settings.qr_base_url}/public/subsections/<id>`.
//
// Why: QR PNGs are permanent/printed artifacts. Baking the app domain into them
// (publicSubsectionUrl) orphaned every printed code when the domain moved
// (lovable → vercel). Encoding THIS endpoint instead makes a future domain change
// settings-only — even already-printed codes re-target. Trade-off: +1 redirect hop.
//
// NEXT_PUBLIC_SUPABASE_URL is guaranteed at app boot (see integrations/supabase/client.ts,
// which throws if it is missing) and is inlined by Next at build time.
export function qrRedirectUrl(subsectionId: string): string {
  const fnHost = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return `${fnHost}/functions/v1/qr-redirect?path=${subsectionId}`;
}

/** Stable redirect for SITE-level QR codes (report covers) — same indirection
 *  as qrRedirectUrl: the edge function resolves the live domain at scan time. */
export function qrSiteRedirectUrl(siteId: string): string {
  const fnHost = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return `${fnHost}/functions/v1/qr-redirect?site=${siteId}`;
}
