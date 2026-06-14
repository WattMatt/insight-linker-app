/**
 * Pure helpers for the Schematic Overview tab (SchematicDiagram).
 *
 * Extracted from the component so the fiddly bits — storage-path parsing, unique
 * identifier generation, and block→subsection matching — are dependency-free and unit-testable.
 */

export interface BlockLike {
  id: string;
  block_identifier: string;
  subsection_id: string | null;
}

export interface SubsectionLike {
  id: string;
  name: string;
}

/** Normalize an identifier/name for matching: uppercase, strip everything non-alphanumeric. */
export function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Parse a Supabase Storage URL into { bucket, path }.
 * Returns null when the URL is not a recognised storage object URL.
 * Mirrors parseSupabaseUrl in simpleImageLoader.ts but kept dependency-free for testing
 * and for deriving the object path when deleting/replacing a schematic PDF.
 */
export function parseStorageUrl(
  url: string | null | undefined
): { bucket: string; path: string } | null {
  if (!url) return null;
  try {
    const { pathname } = new URL(url);
    const m = pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

/**
 * Next unique block identifier of the form DB-NNN.
 * Uses the maximum existing DB-number (not the array length) so that deleting a middle
 * block can never produce a duplicate identifier — the previous count-based scheme could
 * (delete DB-002 of three → length 2 → next "DB-003" collides).
 */
export function nextBlockIdentifier(
  blocks: Array<Pick<BlockLike, "block_identifier">>
): string {
  let max = 0;
  for (const b of blocks) {
    const m = /^DB-?0*(\d+)$/i.exec((b.block_identifier ?? "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `DB-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Find the subsection whose name matches a block identifier.
 *
 * Matching is EXACT on the normalized tokens. The previous two-way substring match
 * ("DB1" ⊂ "DB10", "DB001" ⊂ "DB0012") produced silent false links; exact matching is
 * predictable and the manual "Link to Subsection" dialog covers anything it misses.
 * `excludeIds` keeps already-linked subsections off-limits.
 */
export function matchSubsectionId(
  identifier: string,
  subsections: SubsectionLike[],
  excludeIds: Set<string> = new Set()
): string | null {
  const idNorm = normalizeToken(identifier);
  if (!idNorm) return null;
  const hit = subsections.find(
    (s) => !excludeIds.has(s.id) && normalizeToken(s.name) === idNorm
  );
  return hit ? hit.id : null;
}

/**
 * Compute auto-match assignments for all currently-unlinked blocks.
 * Subsections already linked to a block — or matched earlier in this pass — are not reused,
 * so one subsection can never be linked to two blocks.
 */
export function computeAutoMatches(
  blocks: BlockLike[],
  subsections: SubsectionLike[]
): Array<{ blockId: string; subsectionId: string }> {
  const used = new Set<string>(
    blocks.map((b) => b.subsection_id).filter((id): id is string => !!id)
  );
  const result: Array<{ blockId: string; subsectionId: string }> = [];
  for (const block of blocks) {
    if (block.subsection_id) continue;
    const matchId = matchSubsectionId(block.block_identifier, subsections, used);
    if (matchId) {
      used.add(matchId);
      result.push({ blockId: block.id, subsectionId: matchId });
    }
  }
  return result;
}
