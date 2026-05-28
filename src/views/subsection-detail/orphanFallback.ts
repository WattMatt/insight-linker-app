/**
 * Orphan-name fallback helper for the subsection detail view.
 *
 * Web ARCHITECTURE_AUDIT.md Strategy 6 — first carve from the 1,751-line
 * `useSubsectionDetail.ts` god-hook.
 *
 * Background. Mobile-app inspections were historically pushed with
 * `subsection_id = NULL` (closed by ECompliance Stage 4c-5). Existing
 * production rows still have NULL subsection_id, so the web app stitches
 * them back to subsections by string-matching the inspection's shop
 * fingerprint to the subsection's normalised name.
 *
 * The rule has 4 fingerprint sources, walked in precedence order:
 *   1. inspection.json_data.generalInfo.shopNumber
 *   2. inspection.json_data.generalInfo.shopName
 *   3. inspection.shop_number column
 *   4. inspection.shop_name column
 *
 * Normalisation: uppercase, strip everything that isn't [A-Z0-9].
 * That collapses "Shop 31/32" and "SHOP 31-32" to the same key.
 *
 * AUDIT: see insight-linker-app/docs/integrity-audit/root-causes.md Q9
 * for the production-data driver behind this rule (3 of 233 historical
 * orphans attached via the strict rule).
 */

/**
 * Minimal shape an inspection-like record needs to be fingerprinted.
 * The real Supabase row has many more columns — we only care about the
 * 4 fingerprint sources.
 */
export interface InspectionLike {
  shop_name?: string | null
  shop_number?: string | null
  json_data?: {
    generalInfo?: {
      shopName?: string | null
      shopNumber?: string | null
    } | null
  } | null
}

/**
 * Normalise a fingerprint candidate: uppercase, keep only [A-Z0-9].
 * Treats null/undefined/empty as the empty string.
 */
export function normalize(value: string | null | undefined): string {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Pick the highest-precedence fingerprint that exists on the inspection
 * and return its normalised form. Returns the empty string for "dark"
 * orphans where no fingerprint source has a value — callers should
 * treat empty as no-match.
 */
export function inspectionShopFingerprint(insp: InspectionLike): string {
  const shop =
    insp?.json_data?.generalInfo?.shopNumber ||
    insp?.json_data?.generalInfo?.shopName ||
    insp?.shop_number ||
    insp?.shop_name
  return normalize(shop)
}

/**
 * True iff the inspection's normalised shop fingerprint equals the
 * normalised subsection name. Empty-vs-empty is treated as no match
 * (a subsection with an empty name shouldn't pull in every dark orphan).
 */
export function matchesSubsection(
  insp: InspectionLike,
  subsectionName: string | null | undefined,
): boolean {
  const target = normalize(subsectionName)
  if (target === '') return false
  return inspectionShopFingerprint(insp) === target
}

/**
 * Filter a batch of orphan inspections down to those that match the
 * given subsection name. Useful for the call site in
 * `useSubsectionDetail` that pulls all `subsection_id IS NULL` rows
 * for the site and selects the ones that re-attach.
 */
export function selectOrphansForSubsection<T extends InspectionLike>(
  orphans: T[],
  subsectionName: string | null | undefined,
): T[] {
  const target = normalize(subsectionName)
  if (target === '') return []
  return orphans.filter(o => inspectionShopFingerprint(o) === target)
}
