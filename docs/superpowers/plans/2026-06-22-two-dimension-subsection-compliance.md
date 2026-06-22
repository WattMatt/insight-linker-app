# Two-dimension subsection compliance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split a subsection's single compliance verdict into two independent markings — **Installation Review** (snags + metering) and **Documentation** (Initial COC present + Pass) — shown on the Site Summary report cards and the subsection detail page; overall = both.

**Architecture:** One pure function `computeSubsectionVerdict` (reusing `cocHierarchy`) produces both verdicts + overall. The report and the subsection detail view compute it client-side for display. Aggregate dashboards/KPIs/site-health keep the existing server `is_compliant` single number (unchanged).

**Tech Stack:** TypeScript, React, pdfmake, vitest. Spec: `docs/superpowers/specs/2026-06-22-two-dimension-subsection-compliance-design.md`.

---

### Task 1: Pure verdict module

**Files:**
- Create: `src/lib/subsectionCompliance.ts`
- Test: `src/lib/subsectionCompliance.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/subsectionCompliance.test.ts
import { describe, it, expect } from "vitest";
import { computeSubsectionVerdict } from "./subsectionCompliance";
import type { CocDoc } from "./cocHierarchy";

const TODAY = "2026-06-22";
const doc = (over: Partial<CocDoc>): CocDoc => ({
  id: "x", cocType: "Supplementary", cocNumber: null, cocIssueDate: null,
  cocExpiryDate: null, cocStatus: "Pending", fileName: "f.pdf", fileUrl: "u", ...over,
});
const base = { isCocRequired: true, openSnagCount: 0, meteringStatus: "Installed", meterSerialNumber: "123", cocDocs: [] as CocDoc[], today: TODAY };

describe("computeSubsectionVerdict", () => {
  it("clean install + valid Initial (Pass) => both compliant", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [doc({ cocType: "Initial", cocStatus: "Pass" })] });
    expect(v).toEqual({ installation: true, documentationRequired: true, documentation: true, overall: true });
  });
  it("clean install + missing Initial => installation ok, documentation fails", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [] });
    expect(v.installation).toBe(true);
    expect(v.documentation).toBe(false);
    expect(v.overall).toBe(false);
  });
  it("Initial Pending => documentation fails (Pass required)", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [doc({ cocType: "Initial", cocStatus: "Pending" })] });
    expect(v.documentation).toBe(false);
  });
  it("Initial Fail => documentation fails", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [doc({ cocType: "Initial", cocStatus: "Fail" })] });
    expect(v.documentation).toBe(false);
  });
  it("Initial Pass but expired => documentation fails", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [doc({ cocType: "Initial", cocStatus: "Pass", cocExpiryDate: "2020-01-01" })] });
    expect(v.documentation).toBe(false);
  });
  it("only a Supplementary (no Initial) => documentation fails", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [doc({ cocType: "Supplementary", cocStatus: "Pass" })] });
    expect(v.documentation).toBe(false);
  });
  it("open snag => installation fails regardless of docs", () => {
    const v = computeSubsectionVerdict({ ...base, openSnagCount: 2, cocDocs: [doc({ cocType: "Initial", cocStatus: "Pass" })] });
    expect(v.installation).toBe(false);
    expect(v.overall).toBe(false);
  });
  it("metering Missing + no serial => installation fails", () => {
    const v = computeSubsectionVerdict({ ...base, meteringStatus: "Missing", meterSerialNumber: "" });
    expect(v.installation).toBe(false);
  });
  it("not-required => documentation compliant even with no docs; overall = installation", () => {
    const v = computeSubsectionVerdict({ ...base, isCocRequired: false, cocDocs: [] });
    expect(v).toEqual({ installation: true, documentationRequired: false, documentation: true, overall: true });
  });
  it("not-required + open snag => installation fails, documentation ok, overall fails", () => {
    const v = computeSubsectionVerdict({ ...base, isCocRequired: false, openSnagCount: 1 });
    expect(v.installation).toBe(false);
    expect(v.documentation).toBe(true);
    expect(v.overall).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/subsectionCompliance.test.ts`
Expected: FAIL — `computeSubsectionVerdict` is not exported / module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/subsectionCompliance.ts
import { CocDoc, cocDocFails } from "./cocHierarchy";

export interface SubsectionVerdict {
  installation: boolean;
  documentationRequired: boolean;
  documentation: boolean; // true also when not required
  overall: boolean;
}

export interface VerdictInput {
  isCocRequired: boolean;
  openSnagCount: number;
  meteringStatus: string | null | undefined;
  meterSerialNumber: string | null | undefined;
  cocDocs: CocDoc[];
  today: string; // YYYY-MM-DD
}

export function computeSubsectionVerdict(input: VerdictInput): SubsectionVerdict {
  const installation =
    input.openSnagCount === 0 &&
    !(input.meteringStatus === "Missing" && !input.meterSerialNumber);

  const documentationRequired = input.isCocRequired;
  let documentation = true;
  if (documentationRequired) {
    const initial = input.cocDocs.find(d => d.cocType === "Initial");
    documentation = !!initial && initial.cocStatus === "Pass" && !cocDocFails(initial, input.today);
  }

  return { installation, documentationRequired, documentation, overall: installation && documentation };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/subsectionCompliance.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/subsectionCompliance.ts src/lib/subsectionCompliance.test.ts
git commit -m "feat(compliance): pure two-dimension subsection verdict (installation/documentation)"
```

---

### Task 2: Wire the verdict into the report card data

**Files:**
- Modify: `src/lib/subsectionCardSpec.ts` (SubsectionCardData)
- Modify: `src/components/SiteSummaryReport.tsx` (transformToSubsectionCardData + its callsite + remove calculateSubsectionCompliance)

- [ ] **Step 1: Add the two fields to SubsectionCardData**

In `src/lib/subsectionCardSpec.ts`, inside `interface SubsectionCardData`, add after `cocCertificates?: CocCardLine[];`:

```ts
  // Two-dimension compliance for the report card (see subsectionCompliance.ts).
  installationReview?: boolean;
  documentation?: boolean;
  documentationRequired?: boolean;
```

- [ ] **Step 2: Compute the verdict in transformToSubsectionCardData**

In `src/components/SiteSummaryReport.tsx`:

(a) Add imports near the other lib imports:
```ts
import { computeSubsectionVerdict } from "@/lib/subsectionCompliance";
```

(b) Change the `transformToSubsectionCardData` signature to accept `today`:
```ts
  const transformToSubsectionCardData = (
    sub: any,
    allSnags: any[],
    assets: any[],
    subsectionDocs: any[],
    today: string,
  ): SubsectionCardData => {
```

(c) Replace the `cocCertificates` block so it builds the mapped `cocDocs` once and derives both the I/S lines and the verdict. Find:
```ts
    const cocCertificates = buildCocCardLines(
      (subsectionDocs || [])
        .filter(d => d.subsection_id === sub.id && isCocCertificateCategory(d.document_categories?.name || ''))
        .map(d => toCocDoc(d)),
    );
```
Replace with:
```ts
    const cocDocs = (subsectionDocs || [])
      .filter(d => d.subsection_id === sub.id && isCocCertificateCategory(d.document_categories?.name || ''))
      .map(d => toCocDoc(d));
    const cocCertificates = buildCocCardLines(cocDocs);

    const verdict = computeSubsectionVerdict({
      isCocRequired: sub.is_coc_required ?? true,
      openSnagCount: subSnags.length,
      meteringStatus: sub.metering_status,
      meterSerialNumber: sub.meter_serial_number,
      cocDocs,
      today,
    });
```

(d) In the returned object, replace `isCompliant: calculateSubsectionCompliance(sub, allSnags),` with:
```ts
      isCompliant: verdict.overall,
      installationReview: verdict.installation,
      documentation: verdict.documentation,
      documentationRequired: verdict.documentationRequired,
```

- [ ] **Step 3: Pass `today` at the callsite and delete the dead function**

(a) Find the callsite:
```ts
    const subsectionCardData: SubsectionCardData[] = subsections.map(sub =>
      transformToSubsectionCardData(sub, allSnags, siteAssets, subsectionDocsData)
    );
```
Replace with:
```ts
    const today = new Date().toISOString().split('T')[0];
    const subsectionCardData: SubsectionCardData[] = subsections.map(sub =>
      transformToSubsectionCardData(sub, allSnags, siteAssets, subsectionDocsData, today)
    );
```

(b) Delete the now-unused `calculateSubsectionCompliance` function (the `const calculateSubsectionCompliance = (subsection, snags) => {...}` block). Confirm no other references remain:

Run: `grep -n "calculateSubsectionCompliance" src/components/SiteSummaryReport.tsx`
Expected: no output.

- [ ] **Step 4: Verify types + tests**

Run: `npx tsc --noEmit 2>&1 | grep -E "SiteSummaryReport|subsectionCardSpec|subsectionCompliance"`
Expected: no output (no new type errors in these files).
Run: `npx vitest run`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/subsectionCardSpec.ts src/components/SiteSummaryReport.tsx
git commit -m "feat(site-summary): compute two-dimension verdict for report cards"
```

---

### Task 3: Render the two markings on the report card

**Files:**
- Modify: `src/lib/pdfSubsectionRenderer.ts` (`createCardFooter`)

- [ ] **Step 1: Replace the single compliance footer with two markings**

In `src/lib/pdfSubsectionRenderer.ts`, replace the whole `createCardFooter` function with:

```ts
function createCardFooter(data: SubsectionCardData): any {
  const okColors = STATUS_COLORS.compliant;
  const badColors = STATUS_COLORS.nonCompliant;

  const installOk = data.installationReview !== false;
  const installRow = {
    columns: [
      { text: 'Installation Review:', fontSize: CARD_LAYOUT.labelSize, color: '#6b7280', width: 110 },
      createStatusBadge(installOk ? 'Compliant' : 'Non-Compliant', installOk ? okColors : badColors),
    ],
    margin: [0, 0, 0, 4],
  };

  // Documentation: "Not required" reads as satisfied; required-but-not-compliant
  // shows a short reason.
  let docLabel: string;
  let docColors: { bg: string; text: string; border?: string };
  if (data.documentationRequired === false) {
    docLabel = 'Not Required';
    docColors = { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };
  } else if (data.documentation) {
    docLabel = 'Compliant';
    docColors = okColors;
  } else {
    docLabel = 'Non-Compliant — initial COC missing/invalid';
    docColors = badColors;
  }
  const docRow = {
    columns: [
      { text: 'Documentation:', fontSize: CARD_LAYOUT.labelSize, color: '#6b7280', width: 110 },
      createStatusBadge(docLabel, docColors),
    ],
  };

  return { stack: [installRow, docRow], margin: [0, CARD_LAYOUT.sectionSpacing, 0, 0] };
}
```

- [ ] **Step 2: Remove the now-unused getComplianceLabel import if unused**

Run: `grep -n "getComplianceLabel" src/lib/pdfSubsectionRenderer.ts`
If the only remaining hit is the import line, remove `getComplianceLabel,` from the `import { ... } from './subsectionCardSpec';` statement.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -4`
Expected: build completes (route table printed, no error).

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdfSubsectionRenderer.ts
git commit -m "feat(site-summary): render Installation Review + Documentation on cards"
```

---

### Task 4: Show the two markings on the subsection detail page

**Files:**
- Modify: `src/views/subsection-detail/OverviewTab.tsx`

OverviewTab already receives `subsection` (with `isCocRequired`, `meteringStatus`, `meterSerialNumber`), `openSnagsCount`, and `supabaseDocuments` (each with `category`, `coc_type`, `coc_status`, …).

- [ ] **Step 1: Add imports**

At the top of `src/views/subsection-detail/OverviewTab.tsx`:
```ts
import { isCocCertificateCategory, toCocDoc } from "@/lib/cocHierarchy";
import { computeSubsectionVerdict } from "@/lib/subsectionCompliance";
```

- [ ] **Step 2: Compute the verdict inside the component**

Immediately after the `const highlightSnagId = ...` line (before the `useEffect`), add:
```ts
  const verdict = computeSubsectionVerdict({
    isCocRequired: subsection.isCocRequired,
    openSnagCount: openSnagsCount,
    meteringStatus: subsection.meteringStatus,
    meterSerialNumber: subsection.meterSerialNumber,
    cocDocs: (supabaseDocuments || [])
      .filter((d: any) => isCocCertificateCategory(d.category || ''))
      .map((d: any) => toCocDoc(d)),
    today: new Date().toISOString().split('T')[0],
  });
```

- [ ] **Step 3: Render the two markings**

Inside the "Subsection Details" `<Card>`, directly after the closing `</div>` of the "COC Required" field block (the `<div>` that contains the `COC Required` label + toggle), add a new grid cell:
```tsx
          <div>
            <p className="text-sm text-muted-foreground mb-1">Compliance</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm w-40">Installation Review</span>
                <Badge variant={verdict.installation ? "default" : "destructive"}>
                  {verdict.installation ? "Compliant" : "Non-Compliant"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm w-40">Documentation</span>
                <Badge variant={!verdict.documentationRequired ? "secondary" : verdict.documentation ? "default" : "destructive"}>
                  {!verdict.documentationRequired ? "Not required" : verdict.documentation ? "Compliant" : "Initial COC missing/invalid"}
                </Badge>
              </div>
            </div>
          </div>
```

- [ ] **Step 4: Verify types + build**

Run: `npx tsc --noEmit 2>&1 | grep OverviewTab`
Expected: no output.
Run: `npm run build 2>&1 | tail -4`
Expected: build completes.

- [ ] **Step 5: Commit**

```bash
git add src/views/subsection-detail/OverviewTab.tsx
git commit -m "feat(subsection-detail): show Installation Review + Documentation markings"
```

---

### Task 5: Full verification and deploy

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS — all tests (prior count + 10 new).

- [ ] **Step 2: Production build**

Run: `npm run build 2>&1 | tail -6`
Expected: completes, no errors.

- [ ] **Step 3: Rebase onto latest main and deploy**

```bash
git fetch origin
git rebase origin/main
git checkout main && git merge --ff-only feat/two-dimension-compliance
git push origin main
```
(If a pre-existing modified doc blocks the rebase, `git stash push <that file>` first and `git stash pop` after.)

- [ ] **Step 4: Confirm**

Vercel auto-deploys `main`. After deploy, hard-refresh the PWA (`Cmd+Shift+R`) and regenerate a Site Summary: cards show **Installation Review** + **Documentation**; the subsection detail shows the same two markings.

---

## Notes / boundaries (from the spec)

- Aggregate dashboards/KPIs/site-health/trends are intentionally **unchanged**; the report's own KPIs (health-by-category, summary stats) now reflect the new `overall` via the card `isCompliant`, which is expected.
- The stale "no initial COC" **snag** on the generator still drives Installation Review ✗ (snags → Installation); closing it remains a data fix (prod token / in-app), out of scope here.
