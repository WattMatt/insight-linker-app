# Site Health & Marking Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5 divergent compliance calculations with one tested source of truth, redefine "Site Health" as an operational score (metering + snags + inspections; COC moves to its own card), fix the snag-status bug, and ship the redesigned site-overview cards.

**Architecture:** A new pure module `src/lib/siteHealth.ts` owns all marking math (no I/O, fully unit-tested — the repo's first tests). The site overview, compliance dashboard, unified-site-data hook, and PDF generator all call it, so every surface shows the same number. The snag lifecycle becomes `Open → Rectified → Closed` via a DB migration, fixing the `'rectified'`-vs-`'Open'/'Closed'` mismatch.

**Tech Stack:** TypeScript, React 18, Next.js 15, Supabase, vitest (added in Task 1).

**Reference spec:** `docs/superpowers/specs/2026-06-11-site-health-marking-redesign-design.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/lib/siteHealth.ts` (new) | Pure marking math: factor scores, composite, readiness, bands. Single source of truth. |
| `src/lib/siteHealth.test.ts` (new) | Unit tests for siteHealth.ts. |
| `vitest.config.ts` (new) | Test runner config. |
| `supabase/migrations/20260611140000_snag_status_lifecycle.sql` (new) | Widen `snags.status` to Open/Rectified/Closed + backfill. |
| `src/components/site/SiteOverview.tsx` (modify) | Consume siteHealth.ts; render redesigned hero + readiness + card set. |
| `src/views/SiteDetail.tsx` (modify) | Fix the `'rectified'` openSnags filter. |
| `src/components/ComplianceDashboard.tsx` (modify) | Replace `calculateOverallScore` with siteHealth.ts. |
| `src/hooks/useUnifiedSiteData.ts` (modify) | Replace `calculateKPIs` health math with siteHealth.ts. |

---

## Task 1: Add vitest test infrastructure

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `vitest.config.ts`
- Create: `src/lib/__smoke__.test.ts` (temporary smoke test, deleted in Step 5)

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest@^2.1.0`
Expected: adds `vitest` to devDependencies, no peer-dep errors.

- [ ] **Step 2: Create the vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 3: Add the test script**

In `package.json` `scripts`, add: `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 4: Write a smoke test and confirm the runner works**

Create `src/lib/__smoke__.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm src/lib/__smoke__.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest test infrastructure"
```

---

## Task 2: Build `src/lib/siteHealth.ts` (TDD — the source of truth)

**Files:**
- Create: `src/lib/siteHealth.test.ts`
- Create: `src/lib/siteHealth.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/siteHealth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isMetered, isSnagResolved, isInspectionCompleted,
  factorScores, siteHealthScore, readiness, getHealthBand,
  DEFAULT_WEIGHTS,
} from './siteHealth';

const sub = (id: string, over = {}) => ({ id, metering_status: null, meter_serial_number: null, ...over });

describe('predicates', () => {
  it('isMetered: installed status', () => {
    expect(isMetered({ id: '1', metering_status: 'Installed' })).toBe(true);
  });
  it('isMetered: serial number present', () => {
    expect(isMetered({ id: '1', meter_serial_number: 'SN-9' })).toBe(true);
  });
  it('isMetered: neither', () => {
    expect(isMetered({ id: '1', metering_status: 'Pending' })).toBe(false);
  });
  it('isSnagResolved: Rectified and Closed count, Open does not', () => {
    expect(isSnagResolved({ subsection_id: 's', status: 'Rectified' })).toBe(true);
    expect(isSnagResolved({ subsection_id: 's', status: 'Closed' })).toBe(true);
    expect(isSnagResolved({ subsection_id: 's', status: 'Open' })).toBe(false);
  });
  it('isInspectionCompleted: completed set', () => {
    expect(isInspectionCompleted({ status: 'Completed' })).toBe(true);
    expect(isInspectionCompleted({ status: 'Pending' })).toBe(false);
  });
});

describe('factorScores', () => {
  it('computes each factor as a site-level percentage', () => {
    const subs = [sub('a', { metering_status: 'Installed' }), sub('b', { meter_serial_number: 'x' }), sub('c')];
    const snags = [
      { subsection_id: 'a', status: 'Open' }, { subsection_id: 'a', status: 'Rectified' },
      { subsection_id: 'b', status: 'Closed' },
    ];
    const insp = [{ subsection_id: 'a', status: 'Completed' }, { subsection_id: 'b', status: 'Pending' }];
    const f = factorScores(subs, snags, insp);
    expect(f.metering).toBe(67);     // 2 of 3 metered
    expect(f.snags).toBe(67);        // 2 of 3 snags resolved
    expect(f.inspections).toBe(33);  // 1 of 3 subsections has a completed inspection
  });
  it('no snags => snag factor is 100', () => {
    expect(factorScores([sub('a')], [], []).snags).toBe(100);
  });
  it('no subsections => all factors 100', () => {
    const f = factorScores([], [], []);
    expect(f).toEqual({ metering: 100, snags: 100, inspections: 100 });
  });
  it('multiple completed inspections on one subsection count it once', () => {
    const insp = [{ subsection_id: 'a', status: 'Completed' }, { subsection_id: 'a', status: 'Done' }];
    expect(factorScores([sub('a'), sub('b')], [], insp).inspections).toBe(50);
  });
});

describe('siteHealthScore', () => {
  it('applies the safety weights', () => {
    expect(siteHealthScore({ metering: 87, snags: 61, inspections: 80 })).toBe(74);
  });
  it('uses DEFAULT_WEIGHTS that sum to 1', () => {
    const sum = DEFAULT_WEIGHTS.snags + DEFAULT_WEIGHTS.inspections + DEFAULT_WEIGHTS.metering;
    expect(Math.round(sum * 100)).toBe(100);
  });
});

describe('readiness', () => {
  it('a subsection is ready only when metered, no blocking open snag, and inspected', () => {
    const subs = [sub('ok', { metering_status: 'Installed' }), sub('bad')];
    const snags = [{ subsection_id: 'bad', status: 'Open', risk_level: 'Critical' }];
    const insp = [{ subsection_id: 'ok', status: 'Completed' }];
    const r = readiness(subs, snags, insp);
    expect(r.ready).toBe(1);
    expect(r.total).toBe(2);
    expect(r.failing.metering).toBe(1);   // 'bad' not metered
    expect(r.failing.inspection).toBe(1); // 'bad' not inspected
    expect(r.failing.snags).toBe(1);      // 'bad' has a critical open snag
  });
  it('only Critical/High open snags block; Medium/Low do not', () => {
    const subs = [sub('a', { metering_status: 'Installed' })];
    const insp = [{ subsection_id: 'a', status: 'Completed' }];
    const minor = [{ subsection_id: 'a', status: 'Open', risk_level: 'Medium' }];
    expect(readiness(subs, minor, insp).ready).toBe(1);
    const major = [{ subsection_id: 'a', status: 'Open', risk_level: 'High' }];
    expect(readiness(subs, major, insp).ready).toBe(0);
  });
  it('a resolved critical snag does not block', () => {
    const subs = [sub('a', { metering_status: 'Installed' })];
    const insp = [{ subsection_id: 'a', status: 'Completed' }];
    const snags = [{ subsection_id: 'a', status: 'Rectified', risk_level: 'Critical' }];
    expect(readiness(subs, snags, insp).ready).toBe(1);
  });
});

describe('getHealthBand', () => {
  it('band cutoffs at 80 and 50', () => {
    expect(getHealthBand(80)).toBe('success');
    expect(getHealthBand(79)).toBe('warning');
    expect(getHealthBand(50)).toBe('warning');
    expect(getHealthBand(49)).toBe('danger');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — "Failed to resolve import './siteHealth'".

- [ ] **Step 3: Implement `src/lib/siteHealth.ts`**

Create `src/lib/siteHealth.ts`:

```ts
/**
 * Site Health & Marking — single source of truth.
 *
 * Operational health is built from metering + snags + inspections ONLY.
 * COC certification is tracked separately (see complianceCalculations.ts) and is
 * NOT part of this score. Pure functions, no I/O — see siteHealth.test.ts.
 */

export interface SubsectionForHealth {
  id: string;
  metering_status?: string | null;
  meter_serial_number?: string | null;
}
export interface SnagForHealth {
  subsection_id: string;
  status?: string | null;     // 'Open' | 'Rectified' | 'Closed'
  risk_level?: string | null; // 'Low' | 'Medium' | 'High' | 'Critical'
}
export interface InspectionForHealth {
  subsection_id?: string | null;
  status?: string | null;
}
export interface FactorScores { metering: number; snags: number; inspections: number; }
export interface HealthWeights { snags: number; inspections: number; metering: number; }
export interface ReadinessResult {
  ready: number;
  total: number;
  failing: { metering: number; snags: number; inspection: number };
}

export const DEFAULT_WEIGHTS: HealthWeights = { snags: 0.40, inspections: 0.35, metering: 0.25 };
export const RESOLVED_SNAG_STATUSES = ['Rectified', 'Closed'];
export const BLOCKING_RISK_LEVELS = ['Critical', 'High'];
export const COMPLETED_INSPECTION_STATUSES = ['Complete', 'Completed', 'Closed', 'Done'];

export function isMetered(s: SubsectionForHealth): boolean {
  return s.metering_status === 'Installed' || !!s.meter_serial_number;
}
export function isSnagResolved(snag: SnagForHealth): boolean {
  return !!snag.status && RESOLVED_SNAG_STATUSES.includes(snag.status);
}
export function isInspectionCompleted(i: InspectionForHealth): boolean {
  return !!i.status && COMPLETED_INSPECTION_STATUSES.includes(i.status);
}
function isBlockingOpenSnag(snag: SnagForHealth): boolean {
  return snag.status === 'Open' && !!snag.risk_level && BLOCKING_RISK_LEVELS.includes(snag.risk_level);
}

export function factorScores(
  subsections: SubsectionForHealth[],
  snags: SnagForHealth[],
  inspections: InspectionForHealth[],
): FactorScores {
  const total = subsections.length;
  const metering = total === 0 ? 100 : Math.round((subsections.filter(isMetered).length / total) * 100);
  const snagScore = snags.length === 0 ? 100 : Math.round((snags.filter(isSnagResolved).length / snags.length) * 100);
  const inspectedIds = new Set(
    inspections.filter(isInspectionCompleted).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  const inspections_ = total === 0 ? 100 : Math.round((subsections.filter(s => inspectedIds.has(s.id)).length / total) * 100);
  return { metering, snags: snagScore, inspections: inspections_ };
}

export function siteHealthScore(factors: FactorScores, weights: HealthWeights = DEFAULT_WEIGHTS): number {
  return Math.round(
    weights.snags * factors.snags + weights.inspections * factors.inspections + weights.metering * factors.metering,
  );
}

export function readiness(
  subsections: SubsectionForHealth[],
  snags: SnagForHealth[],
  inspections: InspectionForHealth[],
): ReadinessResult {
  const blockedIds = new Set(snags.filter(isBlockingOpenSnag).map(s => s.subsection_id));
  const inspectedIds = new Set(
    inspections.filter(isInspectionCompleted).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  let ready = 0, failMeter = 0, failSnag = 0, failInsp = 0;
  for (const s of subsections) {
    const metered = isMetered(s);
    const blocked = blockedIds.has(s.id);
    const inspected = inspectedIds.has(s.id);
    if (!metered) failMeter++;
    if (blocked) failSnag++;
    if (!inspected) failInsp++;
    if (metered && !blocked && inspected) ready++;
  }
  return { ready, total: subsections.length, failing: { metering: failMeter, snags: failSnag, inspection: failInsp } };
}

export function getHealthBand(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteHealth.ts src/lib/siteHealth.test.ts
git commit -m "feat(siteHealth): pure marking source of truth with tests"
```

---

## Task 3: Snag lifecycle migration (Open → Rectified → Closed)

**Files:**
- Create: `supabase/migrations/20260611140000_snag_status_lifecycle.sql`

- [ ] **Step 1: Pre-audit the live data (MANUAL — needs DB access)**

Before applying, Arno runs in the Supabase SQL editor and reports the result:

```sql
SELECT status, count(*) FROM public.snags GROUP BY status ORDER BY 2 DESC;
```

This confirms which legacy values exist so the backfill in Step 2 maps them correctly. If unexpected values appear (e.g. lowercase `'rectified'`), extend the `CASE` in Step 2 before applying.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260611140000_snag_status_lifecycle.sql`:

```sql
-- Snag lifecycle: Open -> Rectified -> Closed. Replaces the original
-- ('Open','Closed') constraint and reconciles the code/schema mismatch where the
-- app filtered a 'rectified' status the constraint never allowed.
-- See docs/superpowers/specs/2026-06-11-site-health-marking-redesign-design.md

ALTER TABLE public.snags DROP CONSTRAINT IF EXISTS snags_status_check;

-- Normalise any legacy/casing values before re-applying the constraint.
UPDATE public.snags
SET status = CASE
  WHEN lower(status) = 'rectified' THEN 'Rectified'
  WHEN lower(status) = 'closed'    THEN 'Closed'
  WHEN lower(status) = 'open'      THEN 'Open'
  ELSE status
END;

-- Snags that were marked done but carry a rectified_at timestamp are treated as Rectified.
UPDATE public.snags
SET status = 'Rectified'
WHERE rectified_at IS NOT NULL AND status NOT IN ('Rectified', 'Closed');

ALTER TABLE public.snags
  ADD CONSTRAINT snags_status_check CHECK (status IN ('Open', 'Rectified', 'Closed'));

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Verify the SQL is well-formed**

Run: `cat supabase/migrations/20260611140000_snag_status_lifecycle.sql`
Expected: file prints; no syntax issues. (Application to prod is a manual dashboard step per the project's deploy pattern — flag for Arno; do not auto-apply.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260611140000_snag_status_lifecycle.sql
git commit -m "feat(db): snag status lifecycle Open/Rectified/Closed"
```

---

## Task 4: Redesign the site overview (consume siteHealth.ts)

**Files:**
- Modify: `src/components/site/SiteOverview.tsx`

- [ ] **Step 1: Fetch the raw data the model needs**

In `src/components/site/SiteOverview.tsx`, in the `extendedStats` query (`:170-254`):
- change the inspections select to include `subsection_id`: `.select("id, status, inspection_date, subsection_id")` (`:214`);
- change the snags select to the fields the model needs: `.select("subsection_id, status, risk_level")` (`:224`);
- change the `subsectionDetails` select to include `id` (the model keys on it): `.select("id, metering_status, meter_serial_number")` (`:234`);
- in the returned object (`:245-253`), add the raw arrays the new render needs:

```ts
        subsections: subsectionDetails || [],
        snags: (snags || []),
        inspections: { total: inspections?.length || 0, completed: completedInspections, pending: pendingInspections },
        inspectionsRaw: inspections || [],
```

(Keep the existing `snagStats`/`metering`/`floorPlanStats`/docs fields — the supporting cards still use them. Fix `snagStats.rectified` at `:228` to count the resolved set: `s.status === "Rectified" || s.status === "Closed"`, and `snagStats.critical`/`high` at `:229-230` to count `status === "Open"` of that risk: `s.risk_level === "Critical" && s.status === "Open"`.)

- [ ] **Step 2: Replace the health computation block**

Replace the `cocComplianceRate` / `siteHealthRate` / `snagResolutionRate` / `getHealthStatus` block (`:260-276`) with siteHealth.ts:

```ts
  const cocComplianceRate = stats.cocRequiredCount > 0
    ? Math.round((stats.cocApprovedCount / stats.cocRequiredCount) * 100)
    : 100;

  const subs = extendedStats?.subsections ?? [];
  const snags = extendedStats?.snags ?? [];
  const inspectionsRaw = extendedStats?.inspectionsRaw ?? [];
  const factors = factorScores(subs, snags, inspectionsRaw);
  const healthScore = siteHealthScore(factors);
  const ready = readiness(subs, snags, inspectionsRaw);
  const getHealthStatus = getHealthBand;
```

Add the import at the top (`:8`):

```ts
import { factorScores, siteHealthScore, readiness, getHealthBand } from "@/lib/siteHealth";
```

- [ ] **Step 3: Replace the primary KPI row with the hero + readiness + revised cards**

Replace the "Primary KPIs" grid (`:281-339`) with this JSX (reuses the existing `KPICard` component unchanged):

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Site Health"
          value={healthScore}
          subtitle={`Metering ${factors.metering} · Snags ${factors.snags} · Inspections ${factors.inspections}`}
          icon={<CheckCircle className="h-6 w-6" />}
          progress={healthScore}
          status={getHealthStatus(healthScore)}
          onClick={onTabChange ? () => onTabChange("compliance") : undefined}
          delay={0}
        />
        <KPICard
          title="Readiness"
          value={`${ready.ready} / ${ready.total}`}
          subtitle="Subsections ready"
          icon={<Target className="h-6 w-6" />}
          status={ready.total > 0 && ready.ready === ready.total ? "success" : "warning"}
          details={[
            { label: "Need metering", value: ready.failing.metering },
            { label: "Critical/High open snags", value: ready.failing.snags },
            { label: "Inspection incomplete", value: ready.failing.inspection },
          ]}
          delay={50}
        />
        <KPICard
          title="COC"
          value={`${cocComplianceRate}%`}
          subtitle={`${stats.cocApprovedCount} of ${stats.cocRequiredCount} validated · informational`}
          icon={<Shield className="h-6 w-6" />}
          status="info"
          onClick={onTabChange ? () => onTabChange("subsections") : undefined}
          delay={100}
        />
        <KPICard
          title="Subsections"
          value={stats.totalSubsections}
          subtitle="Total registered locations"
          icon={<Layers className="h-6 w-6" />}
          status="purple"
          onClick={onTabChange ? () => onTabChange("subsections") : undefined}
          details={extendedStats ? [
            { label: "Metered", value: extendedStats.metering.installed },
            { label: "Pending Meter", value: extendedStats.metering.pending }
          ] : undefined}
          delay={150}
        />
      </div>
```

Then delete the standalone "Snag Resolution" card from the secondary grid (`:386-398`) — resolution now lives in the hero's snag factor. Keep the Documents and Inspections cards; the Floor Plan Items card may stay or move to its tab.

- [ ] **Step 4: Type-check the changed file**

Run: `npx tsc --noEmit 2>&1 | grep "src/components/site/SiteOverview.tsx" || echo "no new errors in SiteOverview"`
Expected: "no new errors in SiteOverview" (baseline has ~109 pre-existing errors elsewhere; only assert none are in this file).

- [ ] **Step 5: Visual verification**

Run the app (`npm run dev`), open an admin site with subsections/snags/inspections, confirm: hero shows a 0–100 Site Health with the three factor figures; Readiness shows "X of Y ready" with failing counts; COC appears as its own card; numbers match `siteHealth.ts` for that site's data.

- [ ] **Step 6: Commit**

```bash
git add src/components/site/SiteOverview.tsx
git commit -m "feat(overview): redesigned site health hero + readiness, COC as its own card"
```

---

## Task 5: Fix the SiteDetail open-snags filter

**Files:**
- Modify: `src/views/SiteDetail.tsx:514`

- [ ] **Step 1: Replace the rectified filter with the resolved set**

At `src/views/SiteDetail.tsx:514`, the `openSnags` count filters out `'rectified'`/`'Rectified'`. Open snags are now anything not resolved. Replace with:

```ts
      openSnags: (snagsRes || []).filter(snag => !['Rectified', 'Closed'].includes(snag.status || '')).length,
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "src/views/SiteDetail.tsx" || echo "no new errors in SiteDetail"`
Expected: "no new errors in SiteDetail".

- [ ] **Step 3: Commit**

```bash
git add src/views/SiteDetail.tsx
git commit -m "fix(snags): count open snags by the new resolved set"
```

---

## Task 6: Propagate the source of truth to the remaining surfaces

**Files:**
- Modify: `src/components/ComplianceDashboard.tsx` (`calculateOverallScore` `:451-483`)
- Modify: `src/hooks/useUnifiedSiteData.ts` (`calculateKPIs` `:248-284`)

- [ ] **Step 1: ComplianceDashboard — overall score from siteHealth**

In `src/components/ComplianceDashboard.tsx`, import `factorScores, siteHealthScore` from `@/lib/siteHealth`. Replace the body of `calculateOverallScore` (`:451-483`) so it returns `siteHealthScore(factorScores(subsections, snags, inspections))`, using the component's already-loaded `subsections`, `snags`, and `inspections` arrays (these are fetched in the dashboard's data load — pass the same arrays). Remove the now-dead per-subsection gate loop and its `hasOpenInspectionItems` dependency if nothing else uses it (check with `grep -n hasOpenInspectionItems src/components/ComplianceDashboard.tsx` first; only delete if the single caller was `calculateOverallScore`).

- [ ] **Step 2: useUnifiedSiteData — KPIs from siteHealth**

In `src/hooks/useUnifiedSiteData.ts`, import from `@/lib/siteHealth`. In `calculateKPIs` (`:248-284`), replace the `complianceRate`/`overallHealth`/`meteringHealth`/`snagFreeRate` computations with `const f = factorScores(subsections, snags, inspections);` and set `overallHealth = siteHealthScore(f)`, `meteringHealth = f.metering`. Keep any COC-specific fields these previews show as separate COC values (do not fold COC into health).

- [ ] **Step 3: Type-check both files**

Run: `npx tsc --noEmit 2>&1 | grep -E "ComplianceDashboard.tsx|useUnifiedSiteData.ts" || echo "no new errors in the two files"`
Expected: "no new errors in the two files".

- [ ] **Step 4: Commit**

```bash
git add src/components/ComplianceDashboard.tsx src/hooks/useUnifiedSiteData.ts
git commit -m "refactor(marking): dashboard + unified KPIs use the siteHealth source of truth"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — siteHealth.test.ts all green.

- [ ] **Step 2: Lint the touched files**

Run: `npm run lint 2>&1 | tail -20`
Expected: no new errors in the files this plan modified.

- [ ] **Step 3: Confirm one number across surfaces**

For a known site, confirm the Site Health value is identical on the site overview hero and the compliance dashboard overall score (both now call `siteHealth.ts`).

- [ ] **Step 4: Update the gap register**

Note in `docs/system-reference/GAPS.md` that the 5-way compliance-calc inconsistency and the snag-status bug are resolved by this work (reference this plan), and that the snag-status migration awaits dashboard apply.

```bash
git add docs/system-reference/GAPS.md
git commit -m "docs(gaps): mark marking-consistency + snag-status fixes shipped"
```

---

## Notes / out of scope
- The server-side PDF parity (`complianceReportGenerator.ts`) is deferred: those generators are being retired (Phase-2 cleanup), so wiring them to siteHealth.ts now is wasted work. If a generator survives, point its rate calc at `siteHealthScore(factorScores(...))` in a follow-up.
- Tenant-isolation / RLS hardening (GAPS G-SEC-13) is unrelated and tracked separately.
- The optional `site_health(site_id)` SQL mirror (spec §6) is not built in v1 — the lib is the single source of truth; add the SQL mirror only if an RPC/report needs server-side parity.
