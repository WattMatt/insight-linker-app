import type { ReportStatus, ReportTarget } from "./types";

const toMs = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
};

/** The latest of several timestamps (ISO strings); null when none parse. */
export function latestTimestamp(...values: Array<string | null | undefined>): string | null {
  let best: { ms: number; raw: string } | null = null;
  for (const raw of values) {
    const ms = toMs(raw);
    if (ms !== null && (best === null || ms > best.ms)) best = { ms, raw: raw as string };
  }
  return best?.raw ?? null;
}

/**
 * missing: no saved report. out-of-date: a legacy unlinked report, or an input changed after the
 * report was generated. current: otherwise. Hard-deleted inputs bump no timestamp, so a report
 * can read "current" after a deletion — the panel shows each report's generated time for that.
 */
export function reportStatus(target: Pick<ReportTarget, "existing" | "sourceUpdatedAt">): ReportStatus {
  const { existing, sourceUpdatedAt } = target;
  if (!existing) return "missing";
  if (!existing.linked) return "out-of-date";
  const source = toMs(sourceUpdatedAt);
  const generated = toMs(existing.createdAt);
  if (source !== null && generated !== null && source > generated) return "out-of-date";
  return "current";
}
