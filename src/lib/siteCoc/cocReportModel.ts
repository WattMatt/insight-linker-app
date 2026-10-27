import type { SiteKpiBlock } from "./reportKpis";

export type VerdictKind = "pass" | "fail" | "review" | "cv" | "pending";

export interface ReportCert {
  certNo: string; type: string; verdict: string; verdictKind: VerdictKind;
  issuedDate: string | null; hasCoc: boolean; hasEval: boolean;
  rules: Record<string, string>; failedRules: string[];
  /** A proposed re-verification row: on file, but its verdict is not signed off yet. */
  awaitingSignOff: boolean;
}
export interface ReportTenant {
  subsectionId: string; name: string; tenantName: string | null; shopNo: string;
  registerInitial: string; registerSupp: string;
  coverage: { hasCoc: boolean; hasEval: boolean; verdictKind: VerdictKind };
  certs: ReportCert[]; actions: string[]; noCoc: boolean;
  /** COC on file, but only as proposed rows awaiting sign-off (no final or signed-off row). */
  awaitingSignOff: boolean;
}
export interface ScheduleTableRow {
  shopNo: string; trading: string; req: string; initial: string; supplementary: string;
  files: number | null; status: string; notes: string;
}
export interface VerificationRow { shop: string; certNo: string; type: string; verdict: string; rules: Record<string, string>; }
export interface FileRegisterRow {
  file: string; matched: string; docType: string; certNo: string; type: string;
  clause92: string; issued: string | null; conf: string; notes: string;
}
export interface CocReportModel {
  siteName: string; generatedAt: string; lastImport: string | null;
  cover: { clientName: string | null; address: string | null };
  summary: { required: number; clear: number; noCoc: number; failed: number; awaitingSignOff: number; compliantPct: number };
  kpis: { cocCoveragePct: number; evalCoveragePct: number; verdict: { pass: number; fail: number; review: number; cv: number; pending: number }; outstanding: number };
  issues: {
    noCoc: { name: string }[];
    failed: { name: string; certNo: string; failedRules: string[]; awaitingSignOff: boolean }[];
    awaitingSignOff: { name: string; verdictKind: VerdictKind }[];
  };
  tenants: ReportTenant[];
  siteKpis?: SiteKpiBlock;
  scheduleTable: ScheduleTableRow[];
  verificationRows: VerificationRow[];
  fileRegister: FileRegisterRow[];
}

interface SubRow { id: string; name: string; tenant_name: string | null; is_coc_required: boolean | null }
// cert_no / shop_no_raw / source_file can be NULL: signed-off re-verification rows include pages
// whose certificate number was blank. Every sort and label below treats them as "".
interface CertRow {
  subsection_id: string | null; cert_no: string | null; cert_type: string; verdict: string;
  rules: Record<string, string> | null; issued_date: string | null;
  coc_document_id: string | null; eval_document_id: string | null;
  shop_no_raw?: string | null; doc_type?: string; clause_9_2?: string; confidence?: string; source_file?: string | null; notes?: string;
}
interface SchedRow {
  subsection_id: string | null; shop_no_raw: string | null; initial_cert_nos: string; supplementary_cert_nos: string;
  trading_name?: string; coc_required?: string; files_count?: number | null; status?: string; notes?: string;
}
export interface BuildInput {
  siteName: string; generatedAt: string; lastImport: string | null; clientName?: string | null; address?: string | null;
  subsections: SubRow[]; certificates: CertRow[]; schedule: SchedRow[]; siteKpis?: SiteKpiBlock;
  /** Live proposed rows (verdict = proposed judgement verdict, rules = judgementRules()). Used only for
   *  shops with no final or signed-off row, so they read "COC on file, awaiting sign-off", not "no COC". */
  proposedCertificates?: CertRow[];
}

export function verdictKind(verdict: string, rules: Record<string, string> | null): VerdictKind {
  const v = (verdict || "").toUpperCase();
  const vals = Object.values(rules || {}).map(x => String(x).toUpperCase());
  if (v.startsWith("FAIL") || vals.includes("FAIL")) return "fail";
  if (v.startsWith("PASS")) return "pass";
  if (v.startsWith("REVIEW")) return "review";
  if (v.startsWith("CV") || vals.includes("CV")) return "cv";
  if (!v.trim()) return "pending";
  // Unknown, non-empty verdict text → treat as "review" (needs a human), never silently "pass".
  return "review";
}

const failedRulesOf = (rules: Record<string, string> | null) =>
  Object.entries(rules || {}).filter(([, v]) => String(v).toUpperCase() === "FAIL").map(([k]) => k);

export function buildCocReportModel(input: BuildInput): CocReportModel {
  const required = input.subsections.filter(s => !!s.is_coc_required);
  const bySub = (rows: CertRow[]) => {
    const m = new Map<string, CertRow[]>();
    for (const c of rows) {
      if (!c.subsection_id) continue;
      m.set(c.subsection_id, [...(m.get(c.subsection_id) ?? []), c]);
    }
    return m;
  };
  const certsBySub = bySub(input.certificates);
  const proposedBySub = bySub(input.proposedCertificates ?? []);
  const schedBySub = new Map<string, SchedRow>();
  for (const r of input.schedule) if (r.subsection_id) schedBySub.set(r.subsection_id, r);

  const tenants: ReportTenant[] = required
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    .map(s => {
      // A shop's final/signed-off rows decide its status. Only when it has none do its proposed rows
      // count, and then as "on file, awaiting sign-off" — never as "no COC on file".
      const live = certsBySub.get(s.id) ?? [];
      const awaitingSignOff = live.length === 0 && (proposedBySub.get(s.id)?.length ?? 0) > 0;
      const raw = awaitingSignOff ? proposedBySub.get(s.id)! : live;
      const certs: ReportCert[] = raw.map(c => ({
        certNo: c.cert_no ?? "", type: c.cert_type, verdict: c.verdict,
        verdictKind: verdictKind(c.verdict, c.rules), issuedDate: c.issued_date,
        hasCoc: !!c.coc_document_id, hasEval: !!c.eval_document_id,
        rules: c.rules ?? {}, failedRules: failedRulesOf(c.rules), awaitingSignOff,
      }));
      const noCoc = certs.length === 0;
      const anyFail = certs.some(c => c.verdictKind === "fail");
      const overall: VerdictKind = noCoc ? "pending"
        : anyFail ? "fail"
        : certs.some(c => c.verdictKind === "review") ? "review"
        : certs.some(c => c.verdictKind === "cv") ? "cv"
        : certs.some(c => c.verdictKind === "pending") ? "pending" : "pass";
      const sched = schedBySub.get(s.id);
      const actions: string[] = [];
      if (noCoc) actions.push("No COC on file. Obtain and upload an Initial Certificate of Compliance for this installation.");
      if (awaitingSignOff) actions.push("COC on file; its re-verification verdict is awaiting engineer sign-off.");
      for (const c of certs.filter(c => c.verdictKind === "fail"))
        actions.push(`COC ${c.certNo || "(no certificate number)"} failed SANS rule(s) ${c.failedRules.join(", ") || "(see verdict)"}${awaitingSignOff ? " (proposed, awaiting sign-off)" : ""} — remediate the installation and obtain a re-issued COC.`);
      return {
        subsectionId: s.id, name: s.name, tenantName: s.tenant_name, shopNo: sched?.shop_no_raw ?? "",
        registerInitial: sched?.initial_cert_nos ?? "", registerSupp: sched?.supplementary_cert_nos ?? "",
        coverage: { hasCoc: certs.some(c => c.hasCoc), hasEval: certs.some(c => c.hasEval), verdictKind: overall },
        certs, actions, noCoc, awaitingSignOff,
      };
    });

  const noCoc = tenants.filter(t => t.noCoc);
  const failed = tenants.filter(t => t.certs.some(c => c.verdictKind === "fail"));
  // "Clear" is reported to the client as Pass, so only an outright, signed pass may count:
  // review / cv / pending tenants and verdicts awaiting sign-off are unresolved, not clear.
  const clear = tenants.filter(t => t.coverage.verdictKind === "pass" && !t.awaitingSignOff).length;
  const awaiting = tenants.filter(t => t.awaitingSignOff);
  const issuesFailed = failed.flatMap(t => t.certs.filter(c => c.verdictKind === "fail").map(c => ({ name: t.name, certNo: c.certNo, failedRules: c.failedRules, awaitingSignOff: c.awaitingSignOff })));

  const pct = (n: number) => required.length ? Math.round((n / required.length) * 100) : 0;
  const verdict = { pass: 0, fail: 0, review: 0, cv: 0, pending: 0 };
  for (const t of tenants) for (const c of t.certs) verdict[c.verdictKind] += 1;
  const kpis = {
    cocCoveragePct: pct(tenants.filter(t => t.coverage.hasCoc).length),
    evalCoveragePct: pct(tenants.filter(t => t.coverage.hasEval).length),
    verdict,
    outstanding: tenants.reduce((n, t) => n + t.actions.length, 0),
  };

  const scheduleTable: ScheduleTableRow[] = input.schedule
    .map(r => ({
      shopNo: r.shop_no_raw ?? "", trading: r.trading_name ?? "", req: r.coc_required ?? "",
      initial: r.initial_cert_nos ?? "", supplementary: r.supplementary_cert_nos ?? "",
      files: r.files_count ?? null, status: r.status ?? "", notes: r.notes ?? "",
    }))
    .sort((a, b) => a.shopNo.localeCompare(b.shopNo));

  const verificationRows: VerificationRow[] = input.certificates
    .map(c => ({ shop: c.shop_no_raw ?? "", certNo: c.cert_no ?? "", type: c.cert_type, verdict: c.verdict, rules: c.rules ?? {} }))
    .sort((a, b) => a.shop.localeCompare(b.shop) || a.certNo.localeCompare(b.certNo));

  const fileRegister: FileRegisterRow[] = input.certificates
    .map(c => ({
      file: c.source_file ?? "", matched: c.shop_no_raw ?? "", docType: c.doc_type ?? "",
      certNo: c.cert_no ?? "", type: c.cert_type, clause92: c.clause_9_2 ?? "", issued: c.issued_date,
      conf: c.confidence ?? "", notes: c.notes ?? "",
    }))
    .sort((a, b) => a.file.localeCompare(b.file));

  return {
    siteName: input.siteName, generatedAt: input.generatedAt, lastImport: input.lastImport,
    cover: { clientName: input.clientName ?? null, address: input.address ?? null },
    summary: { required: required.length, clear, noCoc: noCoc.length, failed: failed.length, awaitingSignOff: awaiting.length, compliantPct: required.length ? Math.round((clear / required.length) * 100) : 0 },
    kpis,
    issues: {
      noCoc: noCoc.map(t => ({ name: t.name })),
      failed: issuesFailed,
      awaitingSignOff: awaiting.map(t => ({ name: t.name, verdictKind: t.coverage.verdictKind })),
    },
    tenants,
    siteKpis: input.siteKpis,
    scheduleTable, verificationRows, fileRegister,
  };
}
