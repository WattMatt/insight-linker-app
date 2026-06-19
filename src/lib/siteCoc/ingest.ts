import { normShop } from "./normalize";
import type { ParsedScheduleRow, ParsedCertificate, SubsectionLite, ImportSummary } from "./types";

export function matchShop(shopRaw: string, subs: SubsectionLite[]): string | null {
  const key = normShop(shopRaw);
  if (!key) return null;
  const hit = subs.find(s => normShop(s.name) === key);
  return hit ? hit.id : null;
}

export interface ScheduleInsertRow extends ParsedScheduleRow {
  site_id: string; import_batch_id: string; subsection_id: string | null; match_status: "matched" | "unmatched";
}
export interface CertificateInsertRow extends ParsedCertificate {
  site_id: string; import_batch_id: string; subsection_id: string | null; match_status: "matched" | "unmatched";
}

export function assembleScheduleRows(parsed: ParsedScheduleRow[], subs: SubsectionLite[], siteId: string, batchId: string): ScheduleInsertRow[] {
  return parsed.map(p => {
    const subsection_id = matchShop(p.shop_no_raw, subs);
    return { ...p, site_id: siteId, import_batch_id: batchId, subsection_id, match_status: subsection_id ? "matched" : "unmatched" };
  });
}

export function assembleCertificateRows(certs: ParsedCertificate[], subs: SubsectionLite[], siteId: string, batchId: string): CertificateInsertRow[] {
  return certs.map(c => {
    const subsection_id = matchShop(c.shop_no_raw, subs);
    return { ...c, site_id: siteId, import_batch_id: batchId, subsection_id, match_status: subsection_id ? "matched" : "unmatched" };
  });
}

export function summarize(schedule: { match_status: string }[], certs: { match_status: string }[]): ImportSummary {
  const matched = schedule.filter(s => s.match_status === "matched").length;
  const unmatched = schedule.filter(s => s.match_status === "unmatched").length;
  return { shops_imported: schedule.length, certs_imported: certs.length, matched_count: matched, unmatched_count: unmatched };
}
