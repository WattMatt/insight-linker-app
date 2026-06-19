# Embed Verification Guideline in COC Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the bundled 9-page COC Verification Guideline PDF into every generated site COC report, right after the cover page.

**Architecture:** A `pdf-lib` helper rebuilds the report as `[cover] + [guideline] + [rest]`; `ReportSubTab` fetches the bundled guideline asset and merges it into the generated blob before preview/save/download, with a fallback to report-only if the asset is unavailable.

**Tech Stack:** React + TS, pdf-lib (already a dep), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-coc-report-guideline-design.md`
**Asset (already committed):** `public/reference/coc-verification-guideline.pdf`

---

## Task 1: Merge helper

**Files:** Create `src/lib/siteCoc/mergeReportGuideline.ts`; Test `src/lib/siteCoc/mergeReportGuideline.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergeGuidelineAfterCover } from "./mergeReportGuideline";

async function makeDoc(sizes: [number, number][]): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (const [w, h] of sizes) d.addPage([w, h]);
  return d.save();
}

describe("mergeGuidelineAfterCover", () => {
  it("inserts guideline pages after the report cover, then the rest", async () => {
    const report = await makeDoc([[842, 595], [842, 595], [842, 595]]); // 3 landscape: cover + 2 rest
    const guide = await makeDoc([[595, 842], [595, 842]]);              // 2 portrait
    const out = await mergeGuidelineAfterCover(report, guide);
    const merged = await PDFDocument.load(out);
    expect(merged.getPageCount()).toBe(5);
    const portrait = (i: number) => { const p = merged.getPage(i).getSize(); return p.height > p.width; };
    expect(portrait(0)).toBe(false); // cover (landscape)
    expect(portrait(1)).toBe(true);  // guideline page (portrait)
    expect(portrait(2)).toBe(true);  // guideline page
    expect(portrait(3)).toBe(false); // rest (landscape)
    expect(portrait(4)).toBe(false); // rest
  });

  it("handles a single-page report (cover only)", async () => {
    const report = await makeDoc([[842, 595]]);
    const guide = await makeDoc([[595, 842]]);
    const out = await mergeGuidelineAfterCover(report, guide);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** `npx vitest run src/lib/siteCoc/mergeReportGuideline.test.ts`

- [ ] **Step 3: Implement**

```ts
import { PDFDocument } from "pdf-lib";

type Bytes = ArrayBuffer | Uint8Array;

/** Build a new PDF = [report cover (page 0)] + [all guideline pages] + [remaining report pages]. */
export async function mergeGuidelineAfterCover(reportBytes: Bytes, guidelineBytes: Bytes): Promise<Uint8Array> {
  const report = await PDFDocument.load(reportBytes);
  const guide = await PDFDocument.load(guidelineBytes);
  const out = await PDFDocument.create();

  const reportCount = report.getPageCount();
  const [cover] = await out.copyPages(report, [0]);
  out.addPage(cover);

  const guidePages = await out.copyPages(guide, guide.getPageIndices());
  guidePages.forEach(p => out.addPage(p));

  if (reportCount > 1) {
    const restIdx = Array.from({ length: reportCount - 1 }, (_, i) => i + 1);
    const rest = await out.copyPages(report, restIdx);
    rest.forEach(p => out.addPage(p));
  }

  return out.save();
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `git add src/lib/siteCoc/mergeReportGuideline.ts src/lib/siteCoc/mergeReportGuideline.test.ts && git commit -m "feat(site-coc): pdf-lib helper to merge guideline after the report cover"`

## Task 2: Wire into ReportSubTab

**Files:** Modify `src/views/site-coc/ReportSubTab.tsx`

- [ ] **Step 1:** Import the helper:

```ts
import { mergeGuidelineAfterCover } from "@/lib/siteCoc/mergeReportGuideline";
```

- [ ] **Step 2:** In `generate()`, replace the blob creation with a generate-then-merge step. The current body is:

```ts
      const blob = await generatePdfBlob(buildSiteCocReportDocDef(buildModel()));
      const url = URL.createObjectURL(blob);
      setPreview({ url, name: `${siteName} - Site COC Report - ${new Date().toISOString().slice(0, 10)}.pdf`, blob, isObjectUrl: true });
```

Replace with:

```ts
      const reportBlob = await generatePdfBlob(buildSiteCocReportDocDef(buildModel()));
      let blob = reportBlob;
      try {
        const [reportBytes, guideRes] = await Promise.all([
          reportBlob.arrayBuffer(),
          fetch("/reference/coc-verification-guideline.pdf"),
        ]);
        if (guideRes.ok) {
          const merged = await mergeGuidelineAfterCover(reportBytes, await guideRes.arrayBuffer());
          blob = new Blob([merged], { type: "application/pdf" });
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.error("Guideline merge skipped:", e);
      }
      const url = URL.createObjectURL(blob);
      setPreview({ url, name: `${siteName} - Site COC Report - ${new Date().toISOString().slice(0, 10)}.pdf`, blob, isObjectUrl: true });
```

- [ ] **Step 3:** Update the helper text under the Generate button to mention the guideline:

```tsx
      <p className="text-sm text-muted-foreground">Generate the inclusive site COC report (with the SANS 10142-1 verification guideline) — then preview, download, or save it to the site's documents.</p>
```

- [ ] **Step 4: Build** `npm run build` — Expected: success.
- [ ] **Step 5: Commit** `git add src/views/site-coc/ReportSubTab.tsx && git commit -m "feat(site-coc): embed verification guideline after the report cover"`

## Task 3: Verify + deploy

- [ ] `npx vitest run` — all pass (incl. merge helper). `npm run build` — succeeds.
- [ ] Merge `feat/coc-report-guideline` → `main`, push; confirm Vercel Ready.
- [ ] Runtime: YARONA → Site COC → Report → Generate → preview shows cover, then the 9 guideline
  pages, then summary/KPIs, then tenants; download + save include the guideline.

---

## Self-Review
- Merge (not re-author), preserve formatting → Task 1 (pd-lib copy). ✓
- Placement up-front after cover → Task 1 `[cover]+[guideline]+[rest]`. ✓
- Always included + resilient fallback → Task 2 try/catch keeps report-only on failure. ✓
- Asset served from public/reference → committed; fetched in Task 2. ✓
- Saved/downloaded include guideline → `preview.blob` is the merged blob (existing save/download path). ✓
- Placeholders: none. Types: `mergeGuidelineAfterCover(Bytes, Bytes): Promise<Uint8Array>` consistent Task 1↔2; `Blob`/`arrayBuffer` usage standard.
