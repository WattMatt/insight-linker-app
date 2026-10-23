/**
 * Re-verification import planner (pure — no I/O, no Supabase).
 *
 * Turns one site's re-verification `verdicts.json` plus the site's existing coc_certificates
 * rows into a plan: adds / updates / unchanged / superseded / blocked. The CLI
 * (scripts/coc-reverification-dry-run.mjs) prints the plan; nothing here writes.
 *
 * Rules (see 20261023120000_coc_reverification_proposed.sql):
 *   - Only scored records (PASS | FAIL | REVIEW, no copy_of) become certificate rows. Copies are
 *     folded into their primary's `copies`; N/A records are counted, not imported.
 *   - Every row is review_status 'proposed' with verdict NULL — the import never sets a final
 *     verdict or a sign-off.
 *   - Stable key = site + source record id (record_key). cert_norm (+ db) is NOT unique in the
 *     source (blank numbers on test-report pages, reused numbers across shops).
 *   - Legacy rows stay live at import; sign-off of the replacing record supersedes them. Earlier
 *     re-verification rows the batch no longer carries are superseded at import. Never delete.
 *   - Any change to a signed-off row is BLOCKED, never planned.
 *
 * Kept free of path aliases and runtime-only TS syntax so Node can run it via type stripping.
 */

export type SourceVerdict = "PASS" | "FAIL" | "REVIEW" | "N/A";

export interface SourceRule { rule: string; res: string; note?: string | null; val?: string | null }

export interface SourceDoc {
  id: string;
  file: string;
  doc_class: string;
  cert_no: string | null;
  cert_norm?: string | null;
  cls_type: string | null;
  verdict: SourceVerdict;
  verdict_alt?: string | null;
  reason: string;
  flags: string[];
  rules: SourceRule[];
  db?: string | null;
  building?: string | null;
  address?: string | null;
  date?: string | null;
  reg_person?: string | null;
  reg_no?: string | null;
  form?: string | null;
  confidence?: string | null;
  copy_of?: string | null;
}

export interface SiteSource { site: string; policy: Record<string, unknown>; docs: SourceDoc[] }

/** Existing coc_certificates row, as exported by the read-only snapshot query. */
export interface ExistingCert {
  id: string;
  site_id: string;
  cert_no: string | null;
  cert_no_norm: string | null;
  verdict: string | null;
  subsection_id: string | null;
  coc_document_id: string | null;
  eval_document_id: string | null;
  record_key?: string | null;
  review_status?: string | null;
  signed_off_at?: string | null;
  superseded_at?: string | null;
  source_content_hash?: string | null;
}

/** The coc_certificates columns a proposed row is written with. */
export interface ProposedRow {
  record_key: string;
  review_status: "proposed";
  verdict: null;
  proposed_verdict: "PASS" | "FAIL" | "REVIEW";
  proposed_verdict_alt: string | null;
  cert_no: string | null;
  cert_no_norm: string;
  cert_type: "Initial" | "Supplementary" | "Unclear";
  doc_type: string;
  issued_date: string | null;
  location: string | null;
  confidence: string | null;
  source_file: string;
  reasons: string;
  rules: Record<string, never>;
  rule_results: SourceRule[];
  flags: string[];
  caveats: string[];
  copies: string[];
  db_name: string | null;
  building: string | null;
  reg_person: string | null;
  reg_no: string | null;
  form_type: string | null;
  notes: string | null;
  source_content_hash: string;
}

export interface PlannedAdd {
  row: ProposedRow;
  subsection_id: string | null;
  coc_document_id: string | null;
  eval_document_id: string | null;
  supersedes_ids: string[];
}
export interface PlannedUpdate { id: string; row: ProposedRow; restores: boolean }
export interface Blocked { id: string; record_key: string | null; why: string }

export interface SitePlan {
  site: string;
  siteId: string | null;
  records: number;
  scored: number;
  pass: number;
  fail: number;
  review: number;
  notScored: number;
  notScoredByClass: Record<string, number>;
  copies: number;
  orphanCopies: string[];
  adds: PlannedAdd[];
  updates: PlannedUpdate[];
  unchanged: number;
  superseded: string[];
  blocked: Blocked[];
  subsectionCarried: number;
  docLinksCarried: number;
  /** Live legacy rows a new record will supersede when it is signed off. */
  legacyLinked: number;
  /** Live legacy rows no new record replaces — they stay live after every sign-off. */
  legacyUnlinked: number;
  /** Extra rows that would collapse onto an existing key if the key were site + cert_norm + db. */
  certNormDbCollisions: number;
}

const SCORED: ReadonlySet<string> = new Set(["PASS", "FAIL", "REVIEW"]);

export function isScored(d: SourceDoc): boolean {
  return SCORED.has(d.verdict) && !d.copy_of;
}

/** Same convention as normCert() in ./normalize (kept local so this module has no imports). */
export function normCertLegacy(s: string | null | undefined): string {
  return (s ?? "").toString().toUpperCase().replace(/[\s-]+/g, "").trim();
}

/** cert_no_norm for a re-verification record: the reader's bracketed notes ("559612 (handwritten
 *  above…)", "NM (digits faded…)") are dropped first; a number with no digits left normalises to "". */
export function certNoNormForRow(certNo: string | null | undefined): string {
  const stripped = (certNo ?? "").replace(/\(.*$/s, "").replace(/…/g, "").trim();
  return /\d/.test(stripped) ? normCertLegacy(stripped) : "";
}

/** Digits only — the re-verification cert_norm convention ("NM 1791989" -> "1791989"). */
export function certDigits(s: string | null | undefined): string {
  return (s ?? "").toString().replace(/\D+/g, "");
}

function certType(cls: string | null): ProposedRow["cert_type"] {
  if (cls === "I") return "Initial";
  if (cls === "S") return "Supplementary";
  return "Unclear";
}

/** dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd -> yyyy-mm-dd. Anything else (2-digit years, "October 2017") -> null. */
export function parseSourceDate(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  let hit = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (hit) { y = +hit[1]; m = +hit[2]; d = +hit[3]; }
  else if ((hit = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) { d = +hit[1]; m = +hit[2]; y = +hit[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Batch-wide caveats from "_README - how to use these packs.txt" (2026-10-23). */
export const BATCH_CAVEATS: readonly string[] = [
  "All verdicts are PROPOSED (strict SANS 10142-1 rule set v0.4.2 applied literally); none is signed off.",
  "Pages that exist only once were read once; no full independent second reading has been done.",
  "Open ruling C5 (neutral loop must not exceed earth loop): strict = FAIL, judgement = FLAG.",
  "Open ruling C1/C2 (Compliant ticked with no ohm value): strict = ASSERTED, judgement = PASS.",
  "Cover page and test report are matched by certificate number, date and registered person; a flag marks disagreements — confirm on the original.",
  "SHOPRITE KOKSTAD: one duplicate pair could not be re-read (source file no longer on disk).",
];

interface RecordCaveat { site: string; match: (d: SourceDoc) => boolean; text: string }

const RECORD_CAVEATS: readonly RecordCaveat[] = [
  { site: "EVATON", match: d => d.cert_norm === "2082938",
    text: "Neutral-loop cell written '03 Ω' with no visible decimal point; read as 0.3 Ω. If 3.0 Ω, C5 fails. Confirm on the original." },
  { site: "VENDA PLAZA", match: d => d.cert_norm === "1832401",
    text: "Older form with no DB/Supply field; A3 fails on the literal rule." },
  { site: "PARK CENTRAL", match: d => d.cert_norm === "2326510",
    text: "Was a duplicate PASS (Studio 88); now scored once." },
  { site: "Pineslopes Boulevard", match: d => d.id === "doc053",
    text: "Source file no longer on disk; not re-read." },
  { site: "SHOPRITE KOKSTAD", match: d => d.id === "doc048" || d.id === "doc072",
    text: "Source file no longer on disk; not re-read." },
];

export function caveatsFor(site: string, d: SourceDoc): string[] {
  const out: string[] = [];
  const res = (code: string) => d.rules.find(r => r.rule === code)?.res;
  if (res("C5") === "FAIL") out.push("Open ruling C5 applies to this record (strict FAIL).");
  if (res("C1") === "ASSERTED" || res("C2") === "ASSERTED") out.push("Open ruling C1/C2 applies to this record (Compliant tick without ohm value).");
  for (const c of RECORD_CAVEATS) if (c.site === site && c.match(d)) out.push(c.text);
  return out;
}

/** Map a scored source record to the row the importer would write. reader_notes is deliberately
 *  NOT carried: it holds ID numbers, phone numbers and home addresses. */
export function toProposedRow(site: string, d: SourceDoc, copies: string[], hash: (s: string) => string): ProposedRow {
  const issued = parseSourceDate(d.date);
  const content = {
    record_key: d.id,
    proposed_verdict: d.verdict as ProposedRow["proposed_verdict"],
    proposed_verdict_alt: d.verdict_alt ?? null,
    cert_no: d.cert_no,
    cert_no_norm: certNoNormForRow(d.cert_no),
    cert_type: certType(d.cls_type),
    doc_type: d.doc_class,
    issued_date: issued,
    location: d.address ?? null,
    confidence: d.confidence ?? null,
    source_file: d.file,
    reasons: d.reason,
    rule_results: d.rules,
    flags: d.flags ?? [],
    caveats: caveatsFor(site, d),
    copies: [...copies].sort(),
    db_name: d.db ?? null,
    building: d.building ?? null,
    reg_person: d.reg_person ?? null,
    reg_no: d.reg_no ?? null,
    form_type: d.form ?? null,
    notes: d.date && !issued ? `Issued date as written: ${d.date}` : null,
  };
  return { ...content, review_status: "proposed", verdict: null, rules: {}, source_content_hash: hash(JSON.stringify(content)) };
}

export function planSite(src: SiteSource, siteId: string | null, existing: ExistingCert[], hash: (s: string) => string): SitePlan {
  const docs = src.docs;
  const scored = docs.filter(isScored);
  const scoredIds = new Set(scored.map(d => d.id));

  // Fold each copy into its scored primary, following copy-of-a-copy chains.
  const copyOf = new Map(docs.filter(d => d.copy_of).map(d => [d.id, d.copy_of as string]));
  const primaryOf = (id: string): string | null => {
    const seen = new Set<string>();
    let cur = id;
    while (copyOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = copyOf.get(cur)!; }
    return scoredIds.has(cur) ? cur : null;
  };
  const copiesOf = new Map<string, string[]>();
  const orphanCopies: string[] = [];
  for (const d of docs) {
    if (!d.copy_of) continue;
    const primary = primaryOf(d.id);
    if (primary) copiesOf.set(primary, [...(copiesOf.get(primary) ?? []), d.id]);
    else orphanCopies.push(`${d.id}->${d.copy_of}`);
  }

  const notScoredByClass: Record<string, number> = {};
  for (const d of docs) if (!isScored(d)) notScoredByClass[d.doc_class] = (notScoredByClass[d.doc_class] ?? 0) + 1;

  const keyCounts = new Map<string, number>();
  for (const d of scored) {
    const k = `${d.cert_norm ?? ""}|${(d.db ?? "").trim().toLowerCase()}`;
    keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
  }
  let certNormDbCollisions = 0;
  for (const n of keyCounts.values()) if (n > 1) certNormDbCollisions += n - 1;

  const byKey = new Map<string, ExistingCert>();
  for (const e of existing) if (e.record_key) byKey.set(e.record_key, e);
  const legacyLive = existing.filter(e => !e.record_key && !e.superseded_at);
  const legacyByDigits = new Map<string, ExistingCert[]>();
  for (const e of legacyLive) {
    const k = certDigits(e.cert_no_norm ?? e.cert_no);
    if (k) legacyByDigits.set(k, [...(legacyByDigits.get(k) ?? []), e]);
  }

  const plan: SitePlan = {
    site: src.site, siteId,
    records: docs.length, scored: scored.length,
    pass: scored.filter(d => d.verdict === "PASS").length,
    fail: scored.filter(d => d.verdict === "FAIL").length,
    review: scored.filter(d => d.verdict === "REVIEW").length,
    notScored: docs.length - scored.length, notScoredByClass,
    copies: docs.filter(d => d.copy_of).length, orphanCopies,
    adds: [], updates: [], unchanged: 0, superseded: [], blocked: [],
    subsectionCarried: 0, docLinksCarried: 0, legacyLinked: 0, legacyUnlinked: 0, certNormDbCollisions,
  };

  for (const d of scored) {
    const row = toProposedRow(src.site, d, copiesOf.get(d.id) ?? [], hash);
    const prior = byKey.get(d.id);
    if (prior) {
      const changed = prior.source_content_hash !== row.source_content_hash;
      const restores = !!prior.superseded_at;
      if (!changed && !restores) { plan.unchanged++; continue; }
      if (prior.signed_off_at) { plan.blocked.push({ id: prior.id, record_key: d.id, why: `signed off ${prior.signed_off_at}; source changed` }); continue; }
      plan.updates.push({ id: prior.id, row, restores });
      continue;
    }
    // First import of this record: carry the shop link and attached-document links from the
    // legacy row(s) with the same certificate number, each only when it is unambiguous.
    const legacy = d.cert_norm ? legacyByDigits.get(d.cert_norm) ?? [] : [];
    const only = (vals: (string | null)[]) => {
      const u = Array.from(new Set(vals.filter((v): v is string => !!v)));
      return u.length === 1 ? u[0] : null;
    };
    const subsection_id = only(legacy.map(e => e.subsection_id));
    const coc_document_id = only(legacy.map(e => e.coc_document_id));
    const eval_document_id = only(legacy.map(e => e.eval_document_id));
    if (subsection_id) plan.subsectionCarried++;
    if (coc_document_id || eval_document_id) plan.docLinksCarried++;
    plan.adds.push({ row, subsection_id, coc_document_id, eval_document_id, supersedes_ids: legacy.map(e => e.id) });
  }

  // Legacy (workbook) rows stay live at import: each is superseded only when a re-verification
  // record that lists it in supersedes_ids is signed off (sign_off_coc_certificate). Here we only
  // supersede earlier re-verification rows this batch no longer carries (never deleted).
  for (const e of existing) {
    if (e.superseded_at || !e.record_key || scoredIds.has(e.record_key)) continue;
    if (e.signed_off_at) { plan.blocked.push({ id: e.id, record_key: e.record_key, why: `signed off ${e.signed_off_at}; would be superseded` }); continue; }
    plan.superseded.push(e.id);
  }
  const linked = new Set(plan.adds.flatMap(a => a.supersedes_ids));
  plan.legacyLinked = legacyLive.filter(e => linked.has(e.id)).length;
  plan.legacyUnlinked = legacyLive.length - plan.legacyLinked;
  return plan;
}

export interface ExpectedSite { records: number; scored: number; pass: number; fail: number; review: number; na: number }

/** Compare a site plan to the roll-up row. Returns human-readable mismatches (empty = reconciled). */
export function reconcileSite(p: SitePlan, exp: ExpectedSite | undefined): string[] {
  if (!exp) return ["no roll-up row for this site"];
  const out: string[] = [];
  const pairs: [string, number, number][] = [
    ["records", p.records, exp.records], ["scored", p.scored, exp.scored], ["PASS", p.pass, exp.pass],
    ["FAIL", p.fail, exp.fail], ["REVIEW", p.review, exp.review], ["not scored", p.notScored, exp.na],
  ];
  for (const [k, got, want] of pairs) if (got !== want) out.push(`${k} ${got} != roll-up ${want}`);
  return out;
}

/** Match a source site name to a sites row: explicit override first, then case/space-insensitive exact. */
export function resolveSiteId(name: string, sites: { id: string; name: string }[], overrides: Record<string, string>): string | null {
  if (overrides[name]) return overrides[name];
  const norm = (s: string) => s.toUpperCase().replace(/&/g, " AND ").replace(/\s+/g, " ").trim();
  const hits = sites.filter(s => norm(s.name) === norm(name));
  return hits.length === 1 ? hits[0].id : null;
}
