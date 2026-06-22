# Two-dimension subsection compliance (Installation Review / Documentation)

Date: 2026-06-22
Status: Approved design — ready for implementation plan

## Problem

A subsection currently has a single compliance verdict. The Site Summary report computes
it locally in `calculateSubsectionCompliance` ([SiteSummaryReport.tsx](../../../src/components/SiteSummaryReport.tsx))
from the subsection's **legacy `coc_status` field**, while the new Initial/Supplementary
(I/S) card line is driven by the actual **COC documents** (`groupCocDocuments`,
[cocHierarchy.ts](../../../src/lib/cocHierarchy.ts)). The two can disagree: a subsection whose
legacy `coc_status` says "Approved" but which has **no Initial COC document** shows
"I — Missing" *and* "Compliant" simultaneously.

We want compliance to stop conflating two unrelated things: the physical installation and
the paperwork. A clean install with missing paperwork should read as installation-OK,
documentation-not-OK — not a blanket "Compliant".

## Decision summary

Split a subsection's verdict into two independent markings plus a combined overall:

- **Installation Review** — physical health. Compliant when there are **no open snags** AND
  metering is **not "Missing"** (no `metering_status === "Missing"` with an empty
  `meter_serial_number`). COC plays no part.
- **Documentation** — COC paperwork. If the subsection **does not require a COC** →
  Compliant. Otherwise Compliant **only** when an **Initial-typed COC document exists and is
  Pass** (not failed, not expired) — read from the same `cocHierarchy` source as the I/S card
  line, so the two never disagree. Missing / Fail / expired / Pending initial → Non-compliant.
- **Overall** = `installation && documentation`.

Scope (chosen): **Approach A — shared client-side verdict, display only.** No DB column,
trigger, migration, or aggregate-dashboard changes.

## Architecture

### New pure module: `src/lib/subsectionCompliance.ts`

```ts
import { CocDoc, cocDocFails } from "./cocHierarchy";

export interface SubsectionVerdict {
  installation: boolean;
  documentationRequired: boolean;
  documentation: boolean;   // true also when not required
  overall: boolean;
}

export interface VerdictInput {
  isCocRequired: boolean;
  openSnagCount: number;
  meteringStatus: string | null | undefined;
  meterSerialNumber: string | null | undefined;
  cocDocs: CocDoc[];        // the subsection's COC-category documents
  today: string;            // YYYY-MM-DD
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

- Pure, deterministic, fully unit-tested.
- Reuses `cocHierarchy` (`CocDoc`, `cocDocFails`, strict `cocType === "Initial"`) so the
  Documentation verdict and the I/S card line are computed from one source of truth.
- `cocDocFails` already returns true for Fail or expired-Pass; combined with
  `cocStatus === "Pass"` this yields: Pass-and-not-expired ⇒ compliant; everything else
  (Missing / Pending / Fail / expired) ⇒ non-compliant.

### Integration points

1. **Site Summary report cards** ([pdfSubsectionRenderer.ts](../../../src/lib/pdfSubsectionRenderer.ts) +
   [SiteSummaryReport.tsx](../../../src/components/SiteSummaryReport.tsx)):
   - In `transformToSubsectionCardData`, compute the verdict from the already-built `cocDocs`
     (mapped via `toCocDoc`), `subSnags.length`, and the subsection's metering fields.
   - Add `installationReview: boolean` and `documentation: boolean` to `SubsectionCardData`.
     `isCompliant` continues to carry `overall` for any non-footer consumer, but the visible
     footer no longer renders a single combined badge.
   - `createCardFooter` renders exactly **two** labelled markings (no separate combined line):
     **Installation Review** ✓/✗ and **Documentation** ✓/✗. Documentation renders "Not required"
     (treated as ✓) when `documentationRequired` is false, and a "Non-compliant — initial COC
     missing" style note when required but the initial is absent.

2. **Subsection detail — Overview** ([src/views/subsection-detail/OverviewTab.tsx](../../../src/views/subsection-detail/OverviewTab.tsx)):
   - Compute the same verdict client-side from the subsection's open snags + COC documents
     (available via `useSubsectionDetail`), and render the two markings **in place of** the
     existing single compliance display. If `useSubsectionDetail` does not already expose the
     subsection's COC documents + open-snag count, wiring that data through is part of this change.

3. **Aggregates unchanged** — Compliance Dashboard, KPIs, site-health, snapshots/trends keep
   reading the server-owned `is_compliant` via `complianceState`
   ([subsectionStatus.ts](../../../src/lib/subsectionStatus.ts)) and keep showing a single
   combined number.

## Edge cases

- **Not-required subsection (e.g. Yarona generator):** `documentation = true` (Compliant);
  Installation Review still reflects snags/metering. So the generator reads Installation ✓ /
  Documentation ✓ once its stale snag is closed.
- **Metering:** only an explicit `metering_status === "Missing"` with no serial fails
  Installation; subsections with `null`/other metering states are unaffected (so a meterless
  subsection is not falsely failed).
- **Pending initial COC:** Documentation Non-compliant (Pass is required).
- **Failed / expired initial COC:** Documentation Non-compliant (`cocDocFails`).
- **Supplementaries:** do not affect the Documentation verdict in this version — only the
  Initial-typed document does (per the chosen "Initial present AND Pass" rule).

## Known boundaries / follow-ups (explicitly out of scope)

- The aggregate dashboards/KPIs/health/trends keep the existing server `is_compliant`, so the
  aggregate "compliant" count can differ slightly from the new per-subsection **overall** until
  a future unification (the deferred "everywhere" scope). This is stated, not silently diverged.
- The stale, hand-entered "no initial COC" **snag** on the generator still drives Installation
  Review ✗ (snags → Installation). Closing it remains a data fix (needs prod access or in-app
  deletion); it is not addressed by this change.
- The subsection **list** keeps its single combined badge (avoids per-row snag + COC-doc
  fetching). Two markings appear on the detail page only.

## Testing

Unit tests for `computeSubsectionVerdict`:
- clean install + valid Initial (Pass) → installation ✓, documentation ✓, overall ✓
- clean install + missing Initial → installation ✓, documentation ✗, overall ✗
- clean install + Initial Pending → documentation ✗
- clean install + Initial Fail or expired → documentation ✗
- open snag → installation ✗ (regardless of documentation)
- metering Missing + no serial → installation ✗
- not-required (isCocRequired=false) + no docs → documentation ✓, overall = installation
- not-required + open snag → installation ✗, documentation ✓, overall ✗

## Files touched

- `src/lib/subsectionCompliance.ts` (new) + `src/lib/subsectionCompliance.test.ts` (new)
- `src/lib/subsectionCardSpec.ts` — add `installationReview` + `documentation` to `SubsectionCardData`
- `src/lib/pdfSubsectionRenderer.ts` — `createCardFooter` renders two markings
- `src/components/SiteSummaryReport.tsx` — compute verdict in `transformToSubsectionCardData`; drop/replace `calculateSubsectionCompliance`
- `src/views/subsection-detail/OverviewTab.tsx` (+ `useSubsectionDetail` if data wiring needed) — show two markings
```
