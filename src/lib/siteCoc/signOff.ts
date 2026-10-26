/**
 * Sign-off screen model (pure). Turns re-verification coc_certificates rows into what the
 * Sign-off tab shows: plain-words verdict, the rules that did not pass, flags/caveats, page
 * images, and progress. No Supabase calls here — see src/views/site-coc/useSignOff.ts.
 */

export type ReviewStatus = "proposed" | "signed_off" | "rejected";
export type ProposedVerdict = "PASS" | "FAIL" | "REVIEW";

export interface RuleLine { rule: string; res: string; note: string | null; val: string | null }

export interface SignOffRecord {
  id: string;
  recordKey: string;
  status: ReviewStatus;
  verdict: ProposedVerdict;
  verdictAlt: string | null;
  certNo: string | null;
  certType: string | null;
  docType: string | null;
  issuedDate: string | null;
  location: string | null;
  confidence: string | null;
  sourceFile: string | null;
  reasons: string | null;
  rules: RuleLine[];
  flags: string[];
  caveats: string[];
  dbName: string | null;
  building: string | null;
  regPerson: string | null;
  regNo: string | null;
  subsectionId: string | null;
  signedOffAt: string | null;
  signOffNote: string | null;
  /** Storage paths in the private `documents` bucket, in page order. */
  pages: string[];
}

/** Row shape returned by useSignOff's select (nested page links included). */
export interface SignOffRow {
  id: string;
  record_key: string;
  review_status: string;
  proposed_verdict: string | null;
  proposed_verdict_alt: string | null;
  cert_no: string | null;
  cert_type: string | null;
  doc_type: string | null;
  issued_date: string | null;
  location: string | null;
  confidence: string | null;
  source_file: string | null;
  reasons: string | null;
  rule_results: unknown;
  flags: unknown;
  caveats: unknown;
  db_name: string | null;
  building: string | null;
  reg_person: string | null;
  reg_no: string | null;
  subsection_id: string | null;
  signed_off_at: string | null;
  sign_off_note: string | null;
  coc_certificate_source_files?: { page_no: number | null; role: string; coc_source_files: { storage_path: string } | null }[] | null;
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function toSignOffRecord(r: SignOffRow): SignOffRecord {
  const rules = (Array.isArray(r.rule_results) ? r.rule_results : []).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { rule: String(o.rule ?? ""), res: String(o.res ?? ""), note: (o.note as string) ?? null, val: (o.val as string) ?? null };
  });
  const pages = (r.coc_certificate_source_files ?? [])
    .filter((l) => l.role === "page" && l.coc_source_files?.storage_path)
    .sort((a, b) => (a.page_no ?? 0) - (b.page_no ?? 0))
    .map((l) => l.coc_source_files!.storage_path);
  return {
    id: r.id, recordKey: r.record_key,
    status: (["proposed", "signed_off", "rejected"].includes(r.review_status) ? r.review_status : "proposed") as ReviewStatus,
    verdict: (["PASS", "FAIL", "REVIEW"].includes(r.proposed_verdict ?? "") ? r.proposed_verdict : "REVIEW") as ProposedVerdict,
    verdictAlt: r.proposed_verdict_alt, certNo: r.cert_no, certType: r.cert_type, docType: r.doc_type,
    issuedDate: r.issued_date, location: r.location, confidence: r.confidence, sourceFile: r.source_file,
    reasons: r.reasons, rules, flags: asStrings(r.flags), caveats: asStrings(r.caveats),
    dbName: r.db_name, building: r.building, regPerson: r.reg_person, regNo: r.reg_no,
    subsectionId: r.subsection_id, signedOffAt: r.signed_off_at, signOffNote: r.sign_off_note, pages,
  };
}

/** Plain-words heading for the proposed verdict. */
export const VERDICT_WORDS: Record<ProposedVerdict, string> = {
  PASS: "Passes every rule",
  FAIL: "Fails one or more rules",
  REVIEW: "Needs a closer look (values unclear or unreadable)",
};

/** Plain-words meaning of each rule result shown in the list. */
export const RESULT_WORDS: Record<string, string> = {
  FAIL: "Fails",
  ASSERTED: "Ticked compliant, no value",
  CV: "Unclear / can't verify",
  FLAG: "Flag",
};

const RESULT_ORDER = ["FAIL", "ASSERTED", "CV", "FLAG"];

/** Rules that did not pass, worst first (FAIL, then ASSERTED, CV, FLAG); PASS and N/A are left out. */
export function issues(rules: RuleLine[]): RuleLine[] {
  return rules
    .filter((r) => RESULT_ORDER.includes(r.res))
    .sort((a, b) => RESULT_ORDER.indexOf(a.res) - RESULT_ORDER.indexOf(b.res));
}

export interface Progress { total: number; toReview: number; signedOff: number; rejected: number }

export function progress(records: SignOffRecord[]): Progress {
  return {
    total: records.length,
    toReview: records.filter((r) => r.status === "proposed").length,
    signedOff: records.filter((r) => r.status === "signed_off").length,
    rejected: records.filter((r) => r.status === "rejected").length,
  };
}

export interface SignOffFilter { status: ReviewStatus; verdict: ProposedVerdict | "all" }

export function filterRecords(records: SignOffRecord[], f: SignOffFilter): SignOffRecord[] {
  return records.filter((r) => r.status === f.status && (f.verdict === "all" || r.verdict === f.verdict));
}

/** Index to show after the record at `index` leaves the filtered list (it was just decided). */
export function indexAfterDecision(index: number, remaining: number): number {
  if (remaining <= 0) return 0;
  return Math.min(index, remaining - 1);
}
