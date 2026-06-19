# Site COC Report (inclusive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic Site COC PDF with an inclusive report — a facility-manager dashboard (status + issues) plus per-tenant sections (coverage bar, register-vs-on-file, COCs, outstanding actions, SANS grid).

**Architecture:** A pure, tested `cocReportModel` turns the on-tab data (subsections + coc_certificates + schedule) into a render-ready model; `siteCocReport` renders it to a pdfmake doc; `ReportSubTab` builds the model and downloads. Frontend-only.

**Tech Stack:** React + TS, pdfmake, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-site-coc-report-design.md`

---

## File Structure
- `src/lib/siteCoc/cocReportModel.ts` (new) — `verdictKind`, `buildCocReportModel`.
- `src/lib/siteCoc/cocReportModel.test.ts` (new) — tests.
- `src/lib/siteCoc/siteCocReport.ts` (rewrite) — `buildSiteCocReportDocDef(model)`.
- `src/views/site-coc/ReportSubTab.tsx` (modify) — accept `subsections`, build model, download.
- `src/views/site-coc/SiteCocTab.tsx` (modify) — pass `subsections` to `ReportSubTab`.

---

## Task 1: Report model (pure, tested)

**Files:** Create `src/lib/siteCoc/cocReportModel.ts`; Test `src/lib/siteCoc/cocReportModel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { verdictKind, buildCocReportModel } from "./cocReportModel";

describe("verdictKind", () => {
  it("classifies fail/pass/review/cv/pending", () => {
    expect(verdictKind("FAIL", {})).toBe("fail");
    expect(verdictKind("PASS", { C1: "FAIL" })).toBe("fail");
    expect(verdictKind("PASS — minor (C14)", { C14: "CV" })).toBe("pass");
    expect(verdictKind("REVIEW — confirm", { C1: "CV" })).toBe("review");
    expect(verdictKind("", { C1: "CV" })).toBe("cv");
    expect(verdictKind("", {})).toBe("pending");
  });
});

const subs = [
  { id: "a", name: "ACK", tenant_name: "ACK", is_coc_required: true },
  { id: "t", name: "TELKOM", tenant_name: "TELKOM", is_coc_required: true },
  { id: "x", name: "STORE", tenant_name: "STORE", is_coc_required: false },
];
const certs = [
  { subsection_id: "a", cert_no: "B1", cert_type: "Initial", verdict: "PASS", rules: {}, issued_date: "2024-01-01", coc_document_id: "d1", eval_document_id: "e1" },
  { subsection_id: "a", cert_no: "B2", cert_type: "Supplementary", verdict: "FAIL", rules: { C8: "FAIL" }, issued_date: null, coc_document_id: "d2", eval_document_id: null },
];
const schedule = [{ subsection_id: "a", shop_no_raw: "SHOP 1", initial_cert_nos: "B1", supplementary_cert_nos: "B2" }];

describe("buildCocReportModel", () => {
  const m = buildCocReportModel({ siteName: "S", generatedAt: "2026-06-19", lastImport: "2026-06-19", subsections: subs, certificates: certs, schedule });
  it("summary counts COC-required only", () => {
    expect(m.summary.required).toBe(2);
    expect(m.summary.noCoc).toBe(1);      // TELKOM
    expect(m.summary.failed).toBe(1);     // ACK has a FAIL
  });
  it("issues list = no-COC + failed", () => {
    expect(m.issues.noCoc.map(i => i.name)).toEqual(["TELKOM"]);
    expect(m.issues.failed[0]).toMatchObject({ name: "ACK", certNo: "B2", failedRules: ["C8"] });
  });
  it("tenant carries register numbers, coverage, actions", () => {
    const ack = m.tenants.find(t => t.name === "ACK")!;
    expect(ack.registerInitial).toBe("B1");
    expect(ack.coverage.hasCoc).toBe(true);
    expect(ack.actions.some(a => a.includes("B2") && a.toLowerCase().includes("remediate"))).toBe(true);
    const telkom = m.tenants.find(t => t.name === "TELKOM")!;
    expect(telkom.noCoc).toBe(true);
    expect(telkom.actions[0].toLowerCase()).toContain("no coc");
  });
  it("excludes non-COC-required subsections", () => {
    expect(m.tenants.find(t => t.name === "STORE")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run src/lib/siteCoc/cocReportModel.test.ts`

- [ ] **Step 3: Implement**

```ts
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
  summary: { required: number; clear: number; noCoc: number; failed: number; compliantPct: number };
  issues: { noCoc: { name: string }[]; failed: { name: string; certNo: string; failedRules: string[] }[] };
  tenants: ReportTenant[];
}

interface SubRow { id: string; name: string; tenant_name: string | null; is_coc_required: boolean | null }
interface CertRow { subsection_id: string | null; cert_no: string; cert_type: string; verdict: string; rules: Record<string, string> | null; issued_date: string | null; coc_document_id: string | null; eval_document_id: string | null }
interface SchedRow { subsection_id: string | null; shop_no_raw: string; initial_cert_nos: string; supplementary_cert_nos: string }
export interface BuildInput { siteName: string; generatedAt: string; lastImport: string | null; subsections: SubRow[]; certificates: CertRow[]; schedule: SchedRow[]; }

export function verdictKind(verdict: string, rules: Record<string, string> | null): VerdictKind {
  const v = (verdict || "").toUpperCase();
  const vals = Object.values(rules || {}).map(x => String(x).toUpperCase());
  if (v.startsWith("FAIL") || vals.includes("FAIL")) return "fail";
  if (v.startsWith("PASS")) return "pass";
  if (v.startsWith("REVIEW")) return "review";
  if (v.startsWith("CV") || vals.includes("CV")) return "cv";
  if (!v.trim()) return "pending";
  return "pass";
}

const failedRulesOf = (rules: Record<string, string> | null) =>
  Object.entries(rules || {}).filter(([, v]) => String(v).toUpperCase() === "FAIL").map(([k]) => k);

export function buildCocReportModel(input: BuildInput): CocReportModel {
  const required = input.subsections.filter(s => !!s.is_coc_required);
  const certsBySub = new Map<string, CertRow[]>();
  for (const c of input.certificates) {
    if (!c.subsection_id) continue;
    (certsBySub.get(c.subsection_id) ?? certsBySub.set(c.subsection_id, []).get(c.subsection_id)!).push(c);
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

  return {
    siteName: input.siteName, generatedAt: input.generatedAt, lastImport: input.lastImport,
    summary: { required: required.length, clear, noCoc: noCoc.length, failed: failed.length, compliantPct: required.length ? Math.round((clear / required.length) * 100) : 0 },
    issues: { noCoc: noCoc.map(t => ({ name: t.name })), failed: issuesFailed },
    tenants,
  };
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `git add src/lib/siteCoc/cocReportModel.ts src/lib/siteCoc/cocReportModel.test.ts && git commit -m "feat(site-coc): pure report model (summary, issues, per-tenant)"`

## Task 2: Render the doc (pdfmake)

**Files:** Rewrite `src/lib/siteCoc/siteCocReport.ts`

- [ ] **Step 1: Implement** `buildSiteCocReportDocDef(model)`

```ts
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { COC_SANS_RULES } from "./sansRules";
import type { CocReportModel, ReportCert, VerdictKind } from "./cocReportModel";

const FILL: Record<VerdictKind | "na", string> = {
  pass: "#E1F5EE", fail: "#FCEBEB", review: "#FAEEDA", cv: "#FAEEDA", pending: "#F1EFE8", na: "#F1EFE8",
};
const TEXT: Record<VerdictKind, string> = {
  pass: "#0F6E56", fail: "#A32D2D", review: "#854F0B", cv: "#854F0B", pending: "#5F5E5A",
};
const verdictLabel: Record<VerdictKind, string> = { pass: "Pass", fail: "Fail", review: "Review", cv: "CV", pending: "Pending" };
const glyph = (v: string) => { const t = (v || "").toUpperCase(); return t === "PASS" ? "✓" : t === "FAIL" ? "✗" : t === "CV" ? "CV" : t === "N/A" ? "–" : t ? t : "·"; };
const ruleFill = (v: string) => { const t = (v || "").toUpperCase(); return t === "FAIL" ? FILL.fail : t === "CV" ? FILL.cv : t === "N/A" ? FILL.na : FILL.pass; };

function sansGrid(c: ReportCert): Content {
  const codes = COC_SANS_RULES.map(r => ({ text: r.code, fontSize: 6, alignment: "center", fillColor: "#F1EFE8" }));
  const marks = COC_SANS_RULES.map(r => { const v = c.rules?.[r.code] ?? ""; return { text: glyph(v), fontSize: 6, alignment: "center", fillColor: ruleFill(v) }; });
  return { table: { widths: Array(COC_SANS_RULES.length).fill("*"), body: [codes, marks] }, layout: "noBorders", margin: [0, 2, 0, 4] };
}

function tenantSection(t: CocReportModel["tenants"][number], first: boolean): Content[] {
  const out: Content[] = [];
  const header: Content = {
    columns: [
      { text: [{ text: t.name, bold: true }, { text: t.shopNo ? `   ${t.shopNo}` : "", fontSize: 8, color: "#5F5E5A" }] },
      { text: t.noCoc ? "No COC on file" : verdictLabel[t.coverage.verdictKind], alignment: "right", color: t.noCoc ? TEXT.fail : TEXT[t.coverage.verdictKind] },
    ],
    margin: [0, first ? 0 : 0, 0, 2],
  };
  if (!first) out.push({ text: "", pageBreak: "before" });
  out.push(header);
  out.push({ text: `Coverage: COC ${t.coverage.hasCoc ? "yes" : "—"} · Evaluation ${t.coverage.hasEval ? "yes" : "—"}`, fontSize: 8, color: "#5F5E5A", margin: [0, 0, 0, 2] });
  out.push({ text: `Register expects — Initial: ${t.registerInitial || "—"}   Supplementary: ${t.registerSupp || "—"}`, fontSize: 8, color: "#5F5E5A", margin: [0, 0, 0, 4] });

  if (t.certs.length) {
    out.push({
      table: { headerRows: 1, widths: ["auto", "auto", "auto", "auto", "auto"], body: [
        [{ text: "Cert no", bold: true }, { text: "Type", bold: true }, { text: "Verdict", bold: true }, { text: "Issued", bold: true }, { text: "Files", bold: true }],
        ...t.certs.map(c => [
          { text: c.certNo }, { text: c.type },
          { text: verdictLabel[c.verdictKind], color: TEXT[c.verdictKind] },
          { text: c.issuedDate ?? "—" },
          { text: `${c.hasCoc ? "COC" : ""}${c.hasCoc && c.hasEval ? " + " : ""}${c.hasEval ? "Eval" : ""}` || "—" },
        ]),
      ] }, layout: "lightHorizontalLines", fontSize: 9, margin: [0, 0, 0, 4],
    });
    for (const c of t.certs) out.push(sansGrid(c));
  }
  if (t.actions.length) {
    out.push({ text: "Outstanding actions", bold: true, fontSize: 9, margin: [0, 2, 0, 2] });
    out.push({ ul: t.actions, fontSize: 9, color: "#A32D2D" });
  } else {
    out.push({ text: "No outstanding items.", fontSize: 9, color: "#0F6E56" });
  }
  return out;
}

export function buildSiteCocReportDocDef(model: CocReportModel): TDocumentDefinitions {
  const s = model.summary;
  const dashboard: Content[] = [
    { text: `${model.siteName} — Site COC report`, fontSize: 16, bold: true },
    { text: `Generated ${model.generatedAt}${model.lastImport ? ` · imported ${model.lastImport}` : ""}`, fontSize: 9, color: "#5F5E5A", margin: [0, 0, 0, 8] },
    { columns: [
      { text: [{ text: `${s.required}\n`, fontSize: 16, bold: true }, { text: "COC required", fontSize: 8, color: "#5F5E5A" }] },
      { text: [{ text: `${s.clear}\n`, fontSize: 16, bold: true, color: TEXT.pass }, { text: "Clear (Pass)", fontSize: 8, color: "#5F5E5A" }] },
      { text: [{ text: `${s.noCoc}\n`, fontSize: 16, bold: true, color: TEXT.fail }, { text: "No COC on file", fontSize: 8, color: "#5F5E5A" }] },
      { text: [{ text: `${s.failed}\n`, fontSize: 16, bold: true, color: TEXT.fail }, { text: "Failed", fontSize: 8, color: "#5F5E5A" }] },
      { text: [{ text: `${s.compliantPct}%\n`, fontSize: 16, bold: true }, { text: "Compliant", fontSize: 8, color: "#5F5E5A" }] },
    ], margin: [0, 0, 0, 10] },
    { text: "Issues & exceptions", fontSize: 12, bold: true, margin: [0, 0, 0, 4] },
    { text: `No COC on file (${model.issues.noCoc.length})`, fontSize: 9, color: TEXT.fail },
    { text: model.issues.noCoc.map(i => i.name).join(" · ") || "—", fontSize: 9, margin: [0, 0, 0, 6] },
    { text: `Failed verdict / SANS rules (${model.issues.failed.length})`, fontSize: 9, color: TEXT.fail },
    model.issues.failed.length
      ? { ul: model.issues.failed.map(f => `${f.name} — ${f.certNo} — failed ${f.failedRules.join(", ") || "(see verdict)"}`), fontSize: 9 }
      : { text: "—", fontSize: 9 },
  ];

  const tenantContent = model.tenants.flatMap((t, i) => tenantSection(t, i === 0 && false));
  // first tenant still page-breaks after the dashboard:
  const tenantsBlock: Content[] = [{ text: "Tenant detail", fontSize: 12, bold: true, pageBreak: "before", margin: [0, 0, 0, 6] }, ...model.tenants.flatMap((t, i) => tenantSection(t, i === 0))];

  return {
    pageOrientation: "landscape",
    content: [...dashboard, ...tenantsBlock],
    defaultStyle: { fontSize: 9 },
  } as TDocumentDefinitions;
}
```

> Note: `tenantContent` above is dead — delete it; `tenantsBlock` is the one used (first tenant `first=true` so no page-break before it; the "Tenant detail" heading carries the page-break after the dashboard). Keep only `tenantsBlock`.

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` (no new errors).
- [ ] **Step 3: Commit** `git add src/lib/siteCoc/siteCocReport.ts && git commit -m "feat(site-coc): render inclusive report (dashboard + per-tenant + SANS grid)"`

## Task 3: Wire ReportSubTab + SiteCocTab

**Files:** Modify `src/views/site-coc/ReportSubTab.tsx`, `src/views/site-coc/SiteCocTab.tsx`

- [ ] **Step 1:** Rewrite `ReportSubTab.tsx` to accept `subsections` and build the model:

```tsx
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { buildCocReportModel } from "@/lib/siteCoc/cocReportModel";
import { buildSiteCocReportDocDef } from "@/lib/siteCoc/siteCocReport";
import type { CocScheduleRow, CocCertRow, CocBatch, SubsectionOption } from "./useSiteCoc";

export function ReportSubTab({ siteName, schedule, certificates, batch, subsections }: {
  siteName: string; schedule: CocScheduleRow[]; certificates: CocCertRow[]; batch: CocBatch | null; subsections: SubsectionOption[];
}) {
  const [busy, setBusy] = useState(false);
  const empty = !subsections.some(s => s.is_coc_required);

  const download = async () => {
    setBusy(true);
    try {
      const { downloadPdf } = await import("@/lib/pdfMakeConfig");
      const model = buildCocReportModel({
        siteName,
        generatedAt: new Date().toLocaleDateString(),
        lastImport: batch ? new Date(batch.created_at).toLocaleDateString() : null,
        subsections: subsections.map(s => ({ id: s.id, name: s.name, tenant_name: s.tenant_name, is_coc_required: s.is_coc_required })),
        certificates: certificates.map(c => ({ subsection_id: c.subsection_id, cert_no: c.cert_no, cert_type: c.cert_type, verdict: c.verdict, rules: c.rules, issued_date: c.issued_date, coc_document_id: c.coc_document_id, eval_document_id: c.eval_document_id })),
        schedule: schedule.map(r => ({ subsection_id: r.subsection_id, shop_no_raw: r.shop_no_raw, initial_cert_nos: r.initial_cert_nos, supplementary_cert_nos: r.supplementary_cert_nos })),
      });
      downloadPdf(buildSiteCocReportDocDef(model), `${siteName} - Site COC Report.pdf`);
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Site COC report failed:", e);
      toast.error("Could not generate the report");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Inclusive site COC report — facility-manager dashboard + a per-tenant section for each COC-required subsection.</p>
      <Button onClick={download} disabled={busy || empty}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        Download PDF
      </Button>
      {empty && <p className="text-xs text-muted-foreground">No COC-required subsections on this site.</p>}
    </div>
  );
}
```

(Confirm `CocCertRow` includes `subsection_id`, `rules`, `issued_date`, `coc_document_id`, `eval_document_id` — it does from earlier tasks. `SubsectionOption` has `is_coc_required` from the coverage work.)

- [ ] **Step 2:** In `SiteCocTab.tsx`, pass `subsections` to the report tab:

```tsx
<TabsContent value="report"><Card><CardContent className="pt-4"><ReportSubTab siteName={siteName} schedule={schedule} certificates={certificates} batch={batch} subsections={subsections} /></CardContent></Card></TabsContent>
```

- [ ] **Step 3: Build** `npm run build` — Expected: success.
- [ ] **Step 4: Commit** `git add src/views/site-coc/ReportSubTab.tsx src/views/site-coc/SiteCocTab.tsx && git commit -m "feat(site-coc): wire inclusive report into the Report sub-tab"`

## Task 4: Verify

- [ ] `npx vitest run` — all pass (incl. cocReportModel).
- [ ] `npm run build` — succeeds.

## Task 5: Deploy

- [ ] Merge `feat/site-coc-report` → `main`, push; confirm Vercel Ready. (Frontend-only, no migration.)
- [ ] Runtime: open YARONA Site COC → Report → Download PDF; confirm dashboard shows 22 / 9 / 1, the issues list, and per-tenant sections with coverage + register numbers + SANS grids.

---

## Self-Review
- Spec dashboard (cards + issues No-COC/Failed) → Task 2 `dashboard`. ✓
- Per-tenant: coverage bar, register-vs-on-file, COCs, actions, SANS grid → Task 2 `tenantSection`. ✓
- REVIEW shown in section only (not page-1 issues) → model `issues` only includes noCoc + failed; verdictKind surfaces review in certs/grid. ✓
- Derivations (verdictKind, noCoc, failed, summary, coverage, actions) → Task 1 (tested). ✓
- Data from on-tab state, frontend-only → Task 3. ✓
- Placeholder scan: the Task 2 note flags removing the dead `tenantContent` var — addressed, not a silent TODO. No other placeholders.
- Type consistency: `CocReportModel`/`ReportTenant`/`ReportCert`/`VerdictKind` consistent Tasks 1↔2; `buildCocReportModel`/`buildSiteCocReportDocDef` signatures consistent Tasks 1↔2↔3; `SubsectionOption.is_coc_required` + `CocCertRow` fields used in Task 3 exist from prior work.
