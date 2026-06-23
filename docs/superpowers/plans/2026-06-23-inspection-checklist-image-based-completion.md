# Image-based Inspection Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the site checklist, KPI inspection count, and weighted health score treat an inspection as "done" only when it has at least one image — the same signal the Reports tab already shows.

**Architecture:** Extract the Reports tab's `json_data` photo-counting into one shared, tested module (`src/lib/inspectionImages.ts`). Reuse it in the Reports tab (dedupe) and swap the inspected-set predicate in `buildInspections`, `factorScores`, and `readiness` from existence (`isInspectionCompleted`) to image presence. Add `json_data` to the two inspection queries that currently omit it.

**Tech Stack:** TypeScript, React, Supabase, Vitest. Test runner: `npx vitest run`.

---

## File Structure

- **Create** `src/lib/inspectionImages.ts` — `countInspectionPhotos` + `inspectionHasImages`. Single source of truth for "does this inspection have images".
- **Create** `src/lib/inspectionImages.test.ts` — unit tests for the helper.
- **Modify** `src/components/site/BulkInspectionReportGenerator.tsx` — call the shared helper instead of its inline loop.
- **Modify** `src/lib/siteHealth.ts` — add `json_data` to `InspectionForHealth`; image-based set in `factorScores` + `readiness`.
- **Modify** `src/lib/siteHealth.test.ts` — fixtures carry `json_data`; new empty-inspection assertions.
- **Modify** `src/lib/siteDeliverables.ts` — image-based set in `buildInspections`.
- **Modify** `src/lib/siteDeliverables.test.ts` — fixtures carry `json_data`; new empty-inspection test.
- **Modify** `src/app/api/snapshots/capture/route.ts` — add `json_data` to inspections select.
- **Modify** `src/views/Dashboard.tsx` — add `json_data` to inspections select.

`isInspectionCompleted` is **not** touched (subsection-detail still uses it with `{status}`).

---

### Task 1: Shared `inspectionImages` module

**Files:**
- Create: `src/lib/inspectionImages.ts`
- Test: `src/lib/inspectionImages.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/inspectionImages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { countInspectionPhotos, inspectionHasImages } from './inspectionImages';

describe('countInspectionPhotos', () => {
  it('counts photos in section items', () => {
    const json = { sectionA: { item1: { photos: ['u1', 'u2'] }, item2: { photos: ['u3'] } } };
    expect(countInspectionPhotos(json)).toBe(3);
  });
  it('counts tenant meter/breaker/ctRatio images', () => {
    const json = { tenants: [{ meterImage: 'm', breakerImage: 'b' }, { ctRatioImage: 'c' }] };
    expect(countInspectionPhotos(json)).toBe(3);
  });
  it('ignores the generalInfo section', () => {
    const json = { generalInfo: { item: { photos: ['x'] } } };
    expect(countInspectionPhotos(json)).toBe(0);
  });
  it('returns 0 for empty / null / undefined / non-object', () => {
    expect(countInspectionPhotos({})).toBe(0);
    expect(countInspectionPhotos(null)).toBe(0);
    expect(countInspectionPhotos(undefined)).toBe(0);
    expect(countInspectionPhotos('nope')).toBe(0);
  });
  it('tolerates null tenants in the array', () => {
    const json = { tenants: [null, { meterImage: 'm' }] };
    expect(countInspectionPhotos(json)).toBe(1);
  });
});

describe('inspectionHasImages', () => {
  it('true when >=1 image, false otherwise', () => {
    expect(inspectionHasImages({ json_data: { s: { i: { photos: ['u'] } } } })).toBe(true);
    expect(inspectionHasImages({ json_data: {} })).toBe(false);
    expect(inspectionHasImages({ json_data: null })).toBe(false);
    expect(inspectionHasImages(null)).toBe(false);
    expect(inspectionHasImages(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/inspectionImages.test.ts`
Expected: FAIL — `Failed to resolve import "./inspectionImages"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/inspectionImages.ts`:

```ts
/**
 * Inspection image detection — single source of truth.
 *
 * "Has this inspection been populated?" is answered by whether its json_data carries any
 * photos. Mirrors exactly what the Reports tab (BulkInspectionReportGenerator) counts:
 * section items' photos[] arrays plus tenant meter/breaker/ctRatio images. Pure, no I/O.
 */
export function countInspectionPhotos(jsonData: unknown): number {
  if (!jsonData || typeof jsonData !== 'object') return 0;
  let count = 0;
  for (const [key, section] of Object.entries(jsonData as Record<string, any>)) {
    if (key === 'tenants' && Array.isArray(section)) {
      for (const tenant of section) {
        if (tenant?.meterImage) count++;
        if (tenant?.breakerImage) count++;
        if (tenant?.ctRatioImage) count++;
      }
    } else if (typeof section === 'object' && section !== null && key !== 'generalInfo') {
      for (const item of Object.values(section)) {
        if (Array.isArray((item as any)?.photos)) {
          count += (item as any).photos.length;
        }
      }
    }
  }
  return count;
}

export function inspectionHasImages(
  inspection: { json_data?: unknown } | null | undefined,
): boolean {
  return countInspectionPhotos(inspection?.json_data) > 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/inspectionImages.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/inspectionImages.ts src/lib/inspectionImages.test.ts
git commit -m "feat(inspections): shared inspection image-count helper"
```

---

### Task 2: Dedupe the Reports tab onto the shared helper

**Files:**
- Modify: `src/components/site/BulkInspectionReportGenerator.tsx` (import + replace inline loop at lines 128-148)

- [ ] **Step 1: Add the import**

After line 2 (`import { supabase } ...`), add:

```ts
import { countInspectionPhotos } from "@/lib/inspectionImages";
```

- [ ] **Step 2: Replace the inline photo-count loop**

Replace this block (currently lines ~128-148):

```ts
        // Count photos in inspection data (sections + tenants)
        let photoCount = 0;
        if (latestInspection?.json_data) {
          const jsonData = latestInspection.json_data as Record<string, any>;
          Object.entries(jsonData).forEach(([key, section]: [string, any]) => {
            // Handle tenants array separately
            if (key === 'tenants' && Array.isArray(section)) {
              section.forEach((tenant: any) => {
                if (tenant.meterImage) photoCount++;
                if (tenant.breakerImage) photoCount++;
                if (tenant.ctRatioImage) photoCount++;
              });
            } else if (typeof section === 'object' && section !== null && key !== 'generalInfo') {
              Object.values(section).forEach((item: any) => {
                if (Array.isArray(item?.photos)) {
                  photoCount += item.photos.length;
                }
              });
            }
          });
        }
```

with:

```ts
        // Count photos in inspection data (sections + tenants) — shared helper.
        const photoCount = countInspectionPhotos(latestInspection?.json_data);
```

- [ ] **Step 3: Verify the suite + types still pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS — no test references this component's internals; the helper's own tests cover the logic. `tsc` clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/site/BulkInspectionReportGenerator.tsx
git commit -m "refactor(reports): reuse shared inspection photo-count helper"
```

---

### Task 3: Image-based inspected set in site health

**Files:**
- Modify: `src/lib/siteHealth.ts` (`InspectionForHealth` type; `factorScores` line ~63-64; `readiness` line ~85-86)
- Test: `src/lib/siteHealth.test.ts`

- [ ] **Step 1: Update the tests (drives the change)**

In `src/lib/siteHealth.test.ts`, after the `sub` helper (line 8) add a photo helper:

```ts
// Inspection json_data carrying at least one photo (sections form).
const PHOTO_JSON = { sec: { item: { photos: ['u1'] } } };
const withPhoto = (subsection_id: string, over: Record<string, unknown> = {}) =>
  ({ subsection_id, json_data: PHOTO_JSON, ...over });
```

Replace each inspection fixture so "inspected" rows carry images:

- Line ~44: `const insp = [{ subsection_id: 'a', status: 'Completed' }, { subsection_id: 'b', status: 'Pending' }];`
  → `const insp = [withPhoto('a'), withPhoto('b')];`
- Line ~58: `const insp = [{ subsection_id: 'a', status: 'Completed' }, { subsection_id: 'a', status: 'Done' }];`
  → `const insp = [withPhoto('a'), withPhoto('a')];`
- Line ~77: `const insp = [{ subsection_id: 'ok', status: 'Completed' }];`
  → `const insp = [withPhoto('ok')];`
- Line ~87: `const insp = [{ subsection_id: 'a', status: 'Completed' }];`
  → `const insp = [withPhoto('a')];`
- Line ~95: `const insp = [{ subsection_id: 'a', status: 'Completed' }];`
  → `const insp = [withPhoto('a')];`
- Line ~117: `const insps = [{ subsection_id: 'a' }];`
  → `const insps = [withPhoto('a')];`

Then add a new test inside the `describe('factorScores', ...)` block (after the "multiple completed inspections" test, ~line 60):

```ts
  it('an inspection with no images does NOT count as inspected', () => {
    const subs = [sub('a'), sub('b')];
    const insp = [{ subsection_id: 'a', json_data: {} }, withPhoto('b')]; // a empty, b populated
    expect(factorScores(subs, [], insp).inspections).toBe(50);
  });
```

And add a new test inside `describe('readiness', ...)` (after the "resolved critical snag" test, ~line 98):

```ts
  it('an empty (image-less) inspection leaves the subsection inspection-failing', () => {
    const subs = [sub('a', { metering_status: 'Installed' })];
    const insp = [{ subsection_id: 'a', json_data: {} }];
    const r = readiness(subs, [], insp);
    expect(r.failing.inspection).toBe(1);
    expect(r.ready).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/lib/siteHealth.test.ts`
Expected: FAIL — the two new tests fail (old existence logic still counts the image-less inspection), all others PASS.

- [ ] **Step 3: Implement the image-based predicate**

In `src/lib/siteHealth.ts`:

(a) Add the import at the top (after the file's opening comment block, before the interfaces):

```ts
import { inspectionHasImages } from './inspectionImages';
```

(b) Add `json_data` to the interface (replace the `InspectionForHealth` block, ~lines 20-23):

```ts
export interface InspectionForHealth {
  subsection_id?: string | null;
  status?: string | null;
  json_data?: unknown;
}
```

(c) In `factorScores`, replace the inspected-set line (~63-65):

```ts
  const inspectedIds = new Set(
    inspections.filter(isInspectionCompleted).map(i => i.subsection_id).filter(Boolean) as string[],
  );
```

with:

```ts
  const inspectedIds = new Set(
    inspections.filter(inspectionHasImages).map(i => i.subsection_id).filter(Boolean) as string[],
  );
```

(d) In `readiness`, replace the identical inspected-set line (~85-87) with the same `inspectionHasImages` version:

```ts
  const inspectedIds = new Set(
    inspections.filter(inspectionHasImages).map(i => i.subsection_id).filter(Boolean) as string[],
  );
```

Leave `isInspectionCompleted` defined and exported as-is (still used by subsection-detail).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/siteHealth.test.ts`
Expected: PASS (all, including the two new tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteHealth.ts src/lib/siteHealth.test.ts
git commit -m "feat(health): count an inspection as done only when it has images"
```

---

### Task 4: Image-based inspected set in deliverables

**Files:**
- Modify: `src/lib/siteDeliverables.ts` (`buildInspections` line ~211-213)
- Test: `src/lib/siteDeliverables.test.ts`

- [ ] **Step 1: Update the tests (drives the change)**

In `src/lib/siteDeliverables.test.ts`, after the `get` helper (line 42) add:

```ts
const PHOTO_JSON = { sec: { item: { photos: ['u1'] } } };
```

Replace the inspection fixtures so "inspected" rows carry images:

- Line ~92: `inspections: [{ subsection_id: 'a', status: 'Completed' }, { subsection_id: 'b', status: 'Pending' }],`
  → `inspections: [{ subsection_id: 'a', json_data: PHOTO_JSON }, { subsection_id: 'b', json_data: PHOTO_JSON }],`
- Line ~309: `inspections: [{ subsection_id: 's', status: 'Completed' }],`
  → `inspections: [{ subsection_id: 's', json_data: PHOTO_JSON }],`

Add a new test after the existing inspections test (after line ~98):

```ts
  it('inspections: an inspection with no images leaves the subsection outstanding', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      inspections: [
        { subsection_id: 'a', json_data: PHOTO_JSON }, // populated
        { subsection_id: 'b', json_data: {} },          // empty -> outstanding
      ],
    }));
    const d = get(s, 'inspections');
    expect(d.done).toBe(1);
    expect(d.total).toBe(2);
    expect(d.outstandingItems.map(i => i.subsectionId)).toEqual(['b']);
  });
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npx vitest run src/lib/siteDeliverables.test.ts`
Expected: FAIL — the new "no images -> outstanding" test fails (old existence logic marks `b` done); others PASS.

- [ ] **Step 3: Implement the image-based predicate**

In `src/lib/siteDeliverables.ts`:

(a) Add a new import line near the existing imports (after line 13, below the `complianceCalculations` import):

```ts
import { inspectionHasImages } from './inspectionImages';
```

(b) In `buildInspections`, replace the inspected-set line (~211-213):

```ts
  const inspected = new Set(
    input.inspections.filter(isInspectionCompleted).map(i => i.subsection_id).filter(Boolean) as string[],
  );
```

with:

```ts
  const inspected = new Set(
    input.inspections.filter(inspectionHasImages).map(i => i.subsection_id).filter(Boolean) as string[],
  );
```

`isInspectionCompleted` is no longer referenced in this file — remove it from the import on line 10 (change `isMetered, isSnagResolved, isInspectionCompleted, getHealthBand, BLOCKING_RISK_LEVELS,` to `isMetered, isSnagResolved, getHealthBand, BLOCKING_RISK_LEVELS,`).

`InspectionForDeliverables` aliases `InspectionForHealth`, which now carries `json_data` — no further type change needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/siteDeliverables.test.ts`
Expected: PASS (all, including the new test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteDeliverables.ts src/lib/siteDeliverables.test.ts
git commit -m "feat(deliverables): inspection done requires images on the checklist + KPI count"
```

---

### Task 5: Load `json_data` in the two queries that omit it

**Files:**
- Modify: `src/app/api/snapshots/capture/route.ts` (inspections select, line ~54)
- Modify: `src/views/Dashboard.tsx` (inspections select, line ~172)

- [ ] **Step 1: Snapshot cron query**

In `src/app/api/snapshots/capture/route.ts`, change line ~54:

```ts
      fetchAll(supabase, "inspections", "subsection_id, status, site_id"),
```

to:

```ts
      fetchAll(supabase, "inspections", "subsection_id, status, site_id, json_data"),
```

- [ ] **Step 2: Dashboard triage query**

In `src/views/Dashboard.tsx`, change line ~172:

```ts
        supabase.from("inspections").select("subsection_id, status, site_id"),
```

to:

```ts
        supabase.from("inspections").select("subsection_id, status, site_id, json_data"),
```

- [ ] **Step 3: Verify build + types**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — types compile (`json_data` is optional on the shared interface), full suite green.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/snapshots/capture/route.ts src/views/Dashboard.tsx
git commit -m "fix(inspections): load json_data for snapshot cron + triage so image-based score is correct"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS — all suites green (previous count + the new image tests).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 3: Confirm no stray `isInspectionCompleted` image-related drift**

Run: `grep -rn "isInspectionCompleted" src/lib/siteDeliverables.ts src/lib/siteHealth.ts`
Expected: only the definition in `siteHealth.ts` (and `factorScores`/`readiness` no longer reference it); `siteDeliverables.ts` returns nothing.

---

## Notes for the implementer

- **Expected runtime impact (not a bug):** sites with started-but-empty inspections will see their inspection KPI count and weighted health score drop once deployed. The snapshot trend sparkline shows a one-time step-change (past snapshots used existence; new ones use images). This is the intended behavior.
- **Do not** change `isInspectionCompleted` or its subsection-detail callers (`OverviewTab.tsx`, `useSubsectionDetail.ts`) — separate per-entry display, out of scope.
- **Do not** fix the Reports tab's `created_at` "latest" selection bug — out of scope.
