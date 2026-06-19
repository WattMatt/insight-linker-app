import { normShop } from "./normalize";

/**
 * Carry prior (manual or auto) resolutions onto freshly-assembled schedule rows so a re-import does
 * not wipe matching work. A new row is only adjusted when it is currently unmatched AND its
 * normalised shop has a prior subsection that still exists. Fresh auto-matches always win.
 */
export function applyPriorMatches<T extends { shop_no_raw: string; subsection_id: string | null; match_status: "matched" | "unmatched" }>(
  newRows: T[], priorMap: Map<string, string>, validSubsectionIds: Set<string>,
): T[] {
  return newRows.map(r => {
    if (r.subsection_id) return r;
    const prior = priorMap.get(normShop(r.shop_no_raw));
    if (prior && validSubsectionIds.has(prior)) {
      return { ...r, subsection_id: prior, match_status: "matched" as const };
    }
    return r;
  });
}
