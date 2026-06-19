# Site COC Report — Cover + Summary + KPIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cover page, executive summary, and KPI block to the inclusive Site COC PDF report.

**Architecture:** Extend the pure `cocReportModel` with `cover` + `kpis`; render two new front-matter pages in `siteCocReport` (pdfmake `canvas` bars); thread client name + site address from `SiteDetail` → `SiteCocTab` → `ReportSubTab`. Frontend-only.

**Tech Stack:** React + TS, pdfmake, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-site-coc-report-cover-design.md`

---

## Task 1: Model — cover + KPIs

**Files:** Modify `src/lib/siteCoc/cocReportModel.ts`; `src/lib/siteCoc/cocReportModel.test.ts`

- [ ] **Step 1: Add the failing test (append)**

```ts
describe("buildCocReportModel KPIs + cover", () => {
  const m = buildCocReportModel({ siteName: "S", generatedAt: "d", lastImport: null, clientName: "Acme", address: "1 St",
    subsections: subs, certificates: certs, schedule });
  it("cover carries client + address", () => {
    expect(m.cover).toEqual({ clientName: "Acme", address: "1 St" });
  });
  it("kpis compute coverage, verdict, outstanding", () => {
    expect(m.kpis.cocCoveragePct).toBe(50);   // ACK has COC (d1/d2); TELKOM none → 1/2
    expect(m.kpis.evalCoveragePct).toBe(50);   // ACK has eval e1
    expect(m.kpis.verdict.fail).toBe(1);
    expect(m.kpis.verdict.pass).toBe(1);
    expect(m.kpis.outstanding).toBe(2);        // TELKOM no-COC + ACK fail
  });
});
```

- [ ] **Step 2: Run — expect FAIL** `npx vitest run src/lib/siteCoc/cocReportModel.test.ts`

- [ ] **Step 3: Implement** — extend `BuildInput`, `CocReportModel`, and `buildCocReportModel`:

In `BuildInput` add: `clientName?: string; address?: string;`

In `CocReportModel` add:
```ts
  cover: { clientName: string | null; address: string | null };
  kpis: { cocCoveragePct: number; evalCoveragePct: number; verdict: { pass: number; fail: number; review: number; cv: number; pending: number }; outstanding: number };
```

In `buildCocReportModel`, after `tenants` is built and before the `return`, compute:
```ts
  const pct = (n: number) => required.length ? Math.round((n / required.length) * 100) : 0;
  const verdict = { pass: 0, fail: 0, review: 0, cv: 0, pending: 0 };
  for (const t of tenants) for (const c of t.certs) verdict[c.verdictKind] += 1;
  const kpis = {
    cocCoveragePct: pct(tenants.filter(t => t.coverage.hasCoc).length),
    evalCoveragePct: pct(tenants.filter(t => t.coverage.hasEval).length),
    verdict,
    outstanding: tenants.reduce((n, t) => n + t.actions.length, 0),
  };
```
and add to the returned object:
```ts
    cover: { clientName: input.clientName ?? null, address: input.address ?? null },
    kpis,
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `git add src/lib/siteCoc/cocReportModel.ts src/lib/siteCoc/cocReportModel.test.ts && git commit -m "feat(site-coc): report model gains cover + KPIs"`

## Task 2: Render — cover page + summary/KPI page + safe glyphs

**Files:** Modify `src/lib/siteCoc/siteCocReport.ts`

- [ ] **Step 1: Roboto-safe SANS marks** — replace the `glyph` helper:

```ts
const glyph = (v: string) => { const t = (v || "").toUpperCase(); return t === "PASS" ? "P" : t === "FAIL" ? "F" : t === "CV" ? "CV" : t === "N/A" ? "N/A" : t ? t : "·"; };
```

- [ ] **Step 2: Add bar + cover + summary helpers** (above `buildSiteCocReportDocDef`):

```ts
function miniBar(pct: number, color: string): Content {
  const w = 120, p = Math.max(0, Math.min(100, pct));
  return { canvas: [
    { type: "rect", x: 0, y: 0, w, h: 5, r: 2, color: "#ECECEC" },
    { type: "rect", x: 0, y: 0, w: (w * p) / 100, h: 5, r: 2, color },
  ], margin: [0, 3, 0, 0] };
}
function verdictBar(v: { pass: number; fail: number; review: number; cv: number; pending: number }): Content {
  const total = Math.max(1, v.pass + v.fail + v.review + v.cv + v.pending), W = 340;
  const seg = (n: number, color: string, x: number) => ({ type: "rect" as const, x, y: 0, w: (W * n) / total, h: 12, color });
  let x = 0; const rects: any[] = [];
  const push = (n: number, c: string) => { if (n) { rects.push(seg(n, c, x)); x += (W * n) / total; } };
  push(v.pass, "#1D9E75"); push(v.review + v.cv, "#EF9F27"); push(v.pending, "#B4B2A9"); push(v.fail, "#E24B4A");
  return { canvas: rects, margin: [0, 4, 0, 2] };
}
function kpiCell(label: string, value: string, sub: string, bar?: Content): Content {
  const stack: Content[] = [
    { text: label, fontSize: 8, color: "#5F5E5A" },
    { text: value, fontSize: 16, bold: true },
    { text: sub, fontSize: 7, color: "#5F5E5A" },
  ];
  if (bar) stack.push(bar);
  return { stack, margin: [0, 0, 8, 0] };
}
```

- [ ] **Step 3: Prepend cover + summary pages** in `buildSiteCocReportDocDef`. Replace the `return { ... content: [...dashboard, ...tenantsBlock] ... }` so `content` becomes `[...cover, ...summary, ...tenantsBlock]` where the existing dashboard's issues list moves into `summary`. Concretely, define:

```ts
  const k = model.kpis, cov = model.cover;
  const cover: Content[] = [
    { text: "WATSON MATTHEUS", fontSize: 13, bold: true, color: "#185FA5", characterSpacing: 2 },
    { text: "CONSULTING ELECTRICAL ENGINEERS", fontSize: 9, color: "#5F5E5A", margin: [0, 0, 0, 60] },
    { text: "Certificate of Compliance", fontSize: 30, bold: true },
    { text: "Status report", fontSize: 18, color: "#5F5E5A", margin: [0, 0, 0, 24] },
    { text: model.siteName, fontSize: 18, bold: true },
    { text: cov.address || "", fontSize: 10, color: "#5F5E5A", margin: [0, 0, 0, 20] },
    { table: { widths: ["auto", "*"], body: [
      [{ text: "Prepared for", color: "#5F5E5A" }, { text: cov.clientName || "—" }],
      [{ text: "Prepared by", color: "#5F5E5A" }, { text: "Watson Mattheus Consulting Electrical Engineers" }],
      [{ text: "Generated", color: "#5F5E5A" }, { text: `${model.generatedAt}${model.lastImport ? ` · data as of ${model.lastImport}` : ""}` }],
    ] }, layout: "noBorders", fontSize: 10, margin: [0, 0, 0, 26] },
    { text: `${s.compliantPct}% compliant`, fontSize: 26, bold: true },
    { text: `${s.noCoc} shops with no COC · ${s.failed} failed`, fontSize: 12, color: TEXT.fail, pageBreak: "after" },
  ];
  const narrative = `${model.siteName} has ${s.required} COC-required shops. ${s.clear} are clear (Pass), ${s.noCoc} have no COC on file, and ${s.failed} ${s.failed === 1 ? "has a failed certificate" : "have failed certificates"}. Overall compliance is ${s.compliantPct}%, with ${k.outstanding} outstanding ${k.outstanding === 1 ? "action" : "actions"}. COC documents are on record for ${k.cocCoveragePct}% of required shops and evaluation reports for ${k.evalCoveragePct}%.`;
  const summary: Content[] = [
    { text: "Executive summary", fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
    { text: narrative, fontSize: 11, margin: [0, 0, 0, 12] },
    { columns: [
      kpiCell("Compliance", `${s.compliantPct}%`, `${s.clear} of ${s.required} clear`, miniBar(s.compliantPct, "#1D9E75")),
      kpiCell("COC coverage", `${k.cocCoveragePct}%`, "shops with a COC", miniBar(k.cocCoveragePct, "#185FA5")),
      kpiCell("Eval coverage", `${k.evalCoveragePct}%`, "shops with an eval", miniBar(k.evalCoveragePct, "#185FA5")),
      kpiCell("Outstanding", `${k.outstanding}`, "no-COC + failed", undefined),
    ], margin: [0, 0, 0, 12] },
    { text: "Certificate verdict breakdown", fontSize: 9, color: "#5F5E5A" },
    verdictBar(k.verdict),
    { text: `Pass ${k.verdict.pass} · Review/CV ${k.verdict.review + k.verdict.cv} · Pending ${k.verdict.pending} · Fail ${k.verdict.fail}`, fontSize: 8, color: "#5F5E5A", margin: [0, 0, 0, 12] },
    ...dashboard.slice(2), // reuse the existing issues block (skip the title + generated line already on cover)
  ];
  return { pageOrientation: "landscape", content: [...cover, ...summary, ...tenantsBlock], defaultStyle: { fontSize: 9 } };
```

> The existing `dashboard` array begins with the title + generated line + metric cards + issues. `dashboard.slice(2)` drops the title + generated line (now on the cover) and keeps the metric-card columns + issues list for the summary page. Verify the slice index against the actual `dashboard` array after editing; adjust so only the title and the generated-date lines are dropped.

- [ ] **Step 4: Typecheck** `npx tsc --noEmit` (no new errors).
- [ ] **Step 5: Commit** `git add src/lib/siteCoc/siteCocReport.ts && git commit -m "feat(site-coc): report cover page + executive summary + KPI page"`

## Task 3: Wire client + address through

**Files:** `src/views/site-coc/ReportSubTab.tsx`, `src/views/site-coc/SiteCocTab.tsx`, `src/views/SiteDetail.tsx`

- [ ] **Step 1: ReportSubTab** — add `clientName` + `siteAddress` props and pass into the model build:

In the props type add `clientName?: string | null; siteAddress?: string | null;`, and in the `buildCocReportModel({...})` call add `clientName: clientName ?? null, address: siteAddress ?? null,`.

- [ ] **Step 2: SiteCocTab** — add `clientName?: string | null; siteAddress?: string | null;` to its props; forward to `ReportSubTab`:

```tsx
<ReportSubTab siteName={siteName} schedule={schedule} certificates={certificates} batch={batch} subsections={subsections} clientName={clientName} siteAddress={siteAddress} />
```

- [ ] **Step 3: SiteDetail** — pass them where `SiteCocTab` is rendered:

```tsx
<SiteCocTab siteId={siteId} siteName={site.name} clientName={site.clients?.name ?? null} siteAddress={site.address ?? null} />
```

- [ ] **Step 4: Build** `npm run build` — Expected: success.
- [ ] **Step 5: Commit** `git add src/views/site-coc/ReportSubTab.tsx src/views/site-coc/SiteCocTab.tsx src/views/SiteDetail.tsx && git commit -m "feat(site-coc): pass client + address to the report"`

## Task 4: Verify + deploy

- [ ] `npx vitest run` — all pass. `npm run build` — succeeds.
- [ ] Merge `feat/site-coc-report-cover` → `main`, push; confirm Vercel Ready. (Frontend-only.)
- [ ] Runtime: YARONA → Site COC → Report → Download PDF → cover (YARONA Centre / Fortress Fund / address), summary+KPI page, issues, tenants; SANS grid marks render (P/F/CV).

---

## Self-Review
- Cover page → Task 2 `cover`. ✓  Exec summary + KPIs (cards/bars/verdict) → Task 2 `summary`. ✓
- KPI model (coverage %, verdict, outstanding) + cover fields → Task 1 (tested). ✓
- Roboto-safe glyphs → Task 2 Step 1. ✓
- Client + address wiring → Task 3. ✓
- Placeholders: the `dashboard.slice(2)` carries a verify-the-index note (not a silent TODO). No others.
- Types: `cover`/`kpis` shapes consistent Task 1↔2; `clientName`/`siteAddress` props consistent Tasks 1(model input)↔3; `TEXT`, `s`, `dashboard`, `tenantsBlock` already exist in `siteCocReport.ts` from the prior report build.
