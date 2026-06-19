export function assignedSubsectionIds(rows: { subsection_id: string | null }[]): Set<string> {
  return new Set(rows.map(r => r.subsection_id).filter((x): x is string => !!x));
}

export function unassignedCocRequired<T extends { id: string; is_coc_required?: boolean | null }>(
  subs: T[], assigned: Set<string>,
): T[] {
  return subs.filter(s => !!s.is_coc_required && !assigned.has(s.id));
}
