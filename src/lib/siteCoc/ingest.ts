import { normShop } from "./normalize";
import type { ParsedScheduleRow, ParsedCertificate, SubsectionLite, ImportSummary } from "./types";

function keysFor(...vals: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of vals) { const k = normShop(v); if (k) out.push(k); }
  return Array.from(new Set(out));
}

const distinctIds = (subs: SubsectionLite[]) => Array.from(new Set(subs.map(s => s.id)));

/**
 * Match a schedule shop to a subsection. Subsections may be named by shop code OR trading name,
 * so try both the row's Shop No and Trading Name against the subsection name AND tenant_name:
 *   1. exact (normalised) on any key pair;
 *   2. fall back to a "contains" match on the trading name vs name/tenant_name.
 * Returns the subsection id, or null when there is no unique match (ambiguous → manual resolve).
 */
export function matchSubsection(row: { shop_no_raw: string; trading_name: string }, subs: SubsectionLite[]): string | null {
  const schedKeys = keysFor(row.shop_no_raw, row.trading_name);
  if (!schedKeys.length) return null;

  const exact = subs.filter(s => keysFor(s.name, s.tenant_name).some(k => schedKeys.includes(k)));
  const exactIds = distinctIds(exact);
  if (exactIds.length === 1) return exactIds[0];
  if (exactIds.length > 1) return null; // ambiguous → manual

  // Contains fallback: trading name only (Shop No would falsely contains-match e.g. "ATM" subsections).
  const trade = normShop(row.trading_name);
  if (trade.length >= 3) {
    const contains = subs.filter(s =>
      keysFor(s.name, s.tenant_name).some(k => k.length >= 3 && (k.includes(trade) || trade.includes(k))));
    const ids = distinctIds(contains);
    if (ids.length === 1) return ids[0];
  }
  return null;
}

export interface ScheduleInsertRow extends ParsedScheduleRow {
  site_id: string; import_batch_id: string; subsection_id: string | null; match_status: "matched" | "unmatched";
}
export interface CertificateInsertRow extends ParsedCertificate {
  site_id: string; import_batch_id: string; subsection_id: string | null; match_status: "matched" | "unmatched";
}

export function assembleScheduleRows(parsed: ParsedScheduleRow[], subs: SubsectionLite[], siteId: string, batchId: string): ScheduleInsertRow[] {
  return parsed.map(p => {
    const subsection_id = matchSubsection({ shop_no_raw: p.shop_no_raw, trading_name: p.trading_name }, subs);
    return { ...p, site_id: siteId, import_batch_id: batchId, subsection_id, match_status: subsection_id ? "matched" : "unmatched" };
  });
}

/** Certificates inherit their shop's match from the assembled schedule rows (keyed by Shop No). */
export function assembleCertificateRows(certs: ParsedCertificate[], scheduleRows: ScheduleInsertRow[], siteId: string, batchId: string): CertificateInsertRow[] {
  const byShop = new Map<string, string | null>();
  for (const s of scheduleRows) byShop.set(normShop(s.shop_no_raw), s.subsection_id);
  return certs.map(c => {
    const subsection_id = byShop.get(normShop(c.shop_no_raw)) ?? null;
    return { ...c, site_id: siteId, import_batch_id: batchId, subsection_id, match_status: subsection_id ? "matched" : "unmatched" };
  });
}

export function summarize(schedule: { match_status: string }[], certs: { match_status: string }[]): ImportSummary {
  const matched = schedule.filter(s => s.match_status === "matched").length;
  const unmatched = schedule.filter(s => s.match_status === "unmatched").length;
  return { shops_imported: schedule.length, certs_imported: certs.length, matched_count: matched, unmatched_count: unmatched };
}
