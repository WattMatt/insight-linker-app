export function assignedSubsectionIds(rows: { subsection_id: string | null }[]): Set<string> {
  return new Set(rows.map(r => r.subsection_id).filter((x): x is string => !!x));
}

export function unassignedCocRequired<T extends { id: string; is_coc_required?: boolean | null }>(
  subs: T[], assigned: Set<string>,
): T[] {
  return subs.filter(s => !!s.is_coc_required && !assigned.has(s.id));
}

/** Live matched/unmatched tally from the current schedule rows (a row is matched when it has a subsection). */
export function liveMatchCounts(rows: { subsection_id: string | null }[]): { matched: number; unmatched: number } {
  let matched = 0;
  for (const r of rows) if (r.subsection_id) matched++;
  return { matched, unmatched: rows.length - matched };
}
