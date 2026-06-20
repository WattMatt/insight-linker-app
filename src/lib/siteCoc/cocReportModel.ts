import type { SiteKpiBlock } from "./reportKpis";

export type VerdictKind = "pass" | "fail" | "review" | "cv" | "pending";

export interface ReportCert {
  certNo: string; type: string; verdict: string; verdictKind: VerdictKind;
  issuedDate: string | null; hasCoc: boolean; hasEval: boolean;
  rules: Record<string, string>; failedRules: string[];
}
export interface ReportTenant {
  subsectionId: string; name: string; tenantName: string | null; shopNo: string;
  registerInitial: string; registerSupp: string;
  coverage: { hasCoc: boolean; hasEval: boolean; verdictKind: VerdictKind };
  certs: ReportCert[]; actions: string[]; noCoc: boolean;
}
export interface CocReportModel {
  siteName: string; generatedAt: string; lastImport: string | null;
  cover: { clientName: string | null; address: string | null };
  summary: { required: number; clear: number; noCoc: number; failed: number; compliantPct: number };
  kpis: { cocCoveragePct: number; evalCoveragePct: number; verdict: { pass: number; fail: number; review: number; cv: number; pending: number }; outstanding: number };
  issues: { noCoc: { name: string }[]; failed: { name: string; certNo: string; failedRules: string[] }[] };
  tenants: ReportTenant[];
  siteKpis?: SiteKpiBlock;
}

interface SubRow { id: string; name: string; tenant_name: string | null; is_coc_required: boolean | null }
interface CertRow { subsection_id: string | null; cert_no: string; cert_type: string; verdict: string; rules: Record<string, string> | null; issued_date: string | null; coc_document_id: string | null; eval_document_id: string | null }
interface SchedRow { subsection_id: string | null; shop_no_raw: string; initial_cert_nos: string; supplementary_cert_nos: string }
export interface BuildInput { siteName: string; generatedAt: string; lastImport: string | null; clientName?: string | null; address?: string | null; subsections: SubRow[]; certificates: CertRow[]; schedule: SchedRow[]; siteKpis?: SiteKpiBlock; }

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
  const certsBySub = new Map<string, CertRow[]>();
  for (const c of input.certificates) {
    if (!c.subsection_id) continue;
    const arr = certsBySub.get(c.subsection_id) ?? [];
    arr.push(c);
    certsBySub.set(c.subsection_id, arr);
  }
  const schedBySub = new Map<string, SchedRow>();
  for (const r of input.schedule) if (r.subsection_id) schedBySub.set(r.subsection_id, r);

  const tenants: ReportTenant[] = required
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(s => {
      const raw = certsBySub.get(s.id) ?? [];
      const certs: ReportCert[] = raw.map(c => ({
        certNo: c.cert_no, type: c.cert_type, verdict: c.verdict,
        verdictKind: verdictKind(c.verdict, c.rules), issuedDate: c.issued_date,
        hasCoc: !!c.coc_document_id, hasEval: !!c.eval_document_id,
        rules: c.rules ?? {}, failedRules: failedRulesOf(c.rules),
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
      for (const c of certs.filter(c => c.verdictKind === "fail"))
        actions.push(`COC ${c.certNo} failed SANS rule(s) ${c.failedRules.join(", ") || "(see verdict)"} — remediate the installation and obtain a re-issued COC.`);
      return {
        subsectionId: s.id, name: s.name, tenantName: s.tenant_name, shopNo: sched?.shop_no_raw ?? "",
        registerInitial: sched?.initial_cert_nos ?? "", registerSupp: sched?.supplementary_cert_nos ?? "",
        coverage: { hasCoc: certs.some(c => c.hasCoc), hasEval: certs.some(c => c.hasEval), verdictKind: overall },
        certs, actions, noCoc,
      };
    });

  const noCoc = tenants.filter(t => t.noCoc);
  const failed = tenants.filter(t => t.certs.some(c => c.verdictKind === "fail"));
  const clear = tenants.filter(t => !t.noCoc && !t.certs.some(c => c.verdictKind === "fail")).length;
  const issuesFailed = failed.flatMap(t => t.certs.filter(c => c.verdictKind === "fail").map(c => ({ name: t.name, certNo: c.certNo, failedRules: c.failedRules })));

  const pct = (n: number) => required.length ? Math.round((n / required.length) * 100) : 0;
  const verdict = { pass: 0, fail: 0, review: 0, cv: 0, pending: 0 };
  for (const t of tenants) for (const c of t.certs) verdict[c.verdictKind] += 1;
  const kpis = {
    cocCoveragePct: pct(tenants.filter(t => t.coverage.hasCoc).length),
    evalCoveragePct: pct(tenants.filter(t => t.coverage.hasEval).length),
    verdict,
    outstanding: tenants.reduce((n, t) => n + t.actions.length, 0),
  };

  return {
    siteName: input.siteName, generatedAt: input.generatedAt, lastImport: input.lastImport,
    cover: { clientName: input.clientName ?? null, address: input.address ?? null },
    summary: { required: required.length, clear, noCoc: noCoc.length, failed: failed.length, compliantPct: required.length ? Math.round((clear / required.length) * 100) : 0 },
    kpis,
    issues: { noCoc: noCoc.map(t => ({ name: t.name })), failed: issuesFailed },
    tenants,
    siteKpis: input.siteKpis,
  };
}
