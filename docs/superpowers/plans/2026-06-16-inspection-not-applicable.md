# Inspection-Not-Applicable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a subsection be marked "inspection not applicable" (`is_inspection_required = false`) so it is waived from the inspection checklist item, the inspection factor of site grading, readiness, and inspection KPIs — while COC, metering, snags and thermal stay fully in effect.

**Architecture:** One nullable-default-true boolean column on `subsections`. Three pure-function edits (`siteHealth.factorScores`, `siteHealth.readiness`, `siteDeliverables.buildInspections`) treat `is_inspection_required === false` as waived. KPIs/snapshot/summary flow through those shared functions. A toggle on the subsection Overview mirrors the existing COC/Thermal toggles. Server `is_compliant`/recompute is untouched.

**Tech Stack:** TypeScript, React, Supabase (Postgres), Vitest, Vercel. Spec: `docs/superpowers/specs/2026-06-16-inspection-not-applicable-design.md`.

---

### Task 1: Waive inspections in site grading (`siteHealth.ts`)

**Files:**
- Modify: `src/lib/siteHealth.ts` (interface `SubsectionForHealth`; `factorScores`; `readiness`)
- Test: `src/lib/siteHealth.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/siteHealth.test.ts`:

```ts
import { factorScores, readiness } from './siteHealth';

describe('inspection-not-applicable waiver', () => {
  it('factorScores: a waived subsection is excluded from the inspection denominator', () => {
    const subs = [
      { id: 'a' },                                 // required, inspected
      { id: 'b' },                                 // required, NOT inspected
      { id: 'c', is_inspection_required: false },  // waived
    ];
    const insps = [{ subsection_id: 'a' }];
    // Required = a,b. Inspected = a. Factor = 1/2 = 50 (c neither counts nor drags).
    expect(factorScores(subs, [], insps).inspections).toBe(50);
  });

  it('factorScores: all-waived site scores 100 on inspections (vacuous)', () => {
    const subs = [{ id: 'a', is_inspection_required: false }];
    expect(factorScores(subs, [], []).inspections).toBe(100);
  });

  it('readiness: a waived subsection is not counted as inspection-failing', () => {
    const subs = [
      { id: 'a', metering_status: 'Installed', is_inspection_required: false },
      { id: 'b', metering_status: 'Installed' }, // required, not inspected -> fails inspection
    ];
    const r = readiness(subs, [], []);
    expect(r.failing.inspection).toBe(1); // only b
    expect(r.ready).toBe(1);              // a is ready (metered, no snag, inspection waived)
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/siteHealth.test.ts -t "inspection-not-applicable"`
Expected: FAIL (waived subsection still counted — inspections factor 33, `failing.inspection` 2).

- [ ] **Step 3: Add the field to `SubsectionForHealth`**

In `src/lib/siteHealth.ts`, change:

```ts
export interface SubsectionForHealth {
  id: string;
  metering_status?: string | null;
  meter_serial_number?: string | null;
}
```

to:

```ts
export interface SubsectionForHealth {
  id: string;
  metering_status?: string | null;
  meter_serial_number?: string | null;
  is_inspection_required?: boolean | null;
}
```

- [ ] **Step 4: Waive inspections in `factorScores`**

Replace this line in `factorScores`:

```ts
  const inspections_ = total === 0 ? 100 : Math.round((subsections.filter(s => inspectedIds.has(s.id)).length / total) * 100);
```

with:

```ts
  // Inspection-not-applicable subsections are waived: neither inspected nor missing.
  const inspectionReq = subsections.filter(s => s.is_inspection_required !== false);
  const inspections_ = inspectionReq.length === 0 ? 100
    : Math.round((inspectionReq.filter(s => inspectedIds.has(s.id)).length / inspectionReq.length) * 100);
```

- [ ] **Step 5: Waive inspections in `readiness`**

Replace this line inside the `for (const s of subsections)` loop:

```ts
    const inspected = inspectedIds.has(s.id);
```

with:

```ts
    // Waived subsections (is_inspection_required === false) are treated as inspection-satisfied.
    const inspected = s.is_inspection_required === false || inspectedIds.has(s.id);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/siteHealth.test.ts`
Expected: PASS (all, including the existing tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/siteHealth.ts src/lib/siteHealth.test.ts
git commit -m "feat(siteHealth): waive inspection-not-applicable subsections from grading + readiness"
```

---

### Task 2: Waive inspections in the deliverables checklist (`siteDeliverables.ts`)

**Files:**
- Modify: `src/lib/siteDeliverables.ts` (`buildInspections`)
- Test: `src/lib/siteDeliverables.test.ts`

`SubsectionForDeliverables extends SubsectionForHealth`, so it already carries `is_inspection_required` after Task 1 — no type change needed here.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/siteDeliverables.test.ts` (inside the `computeSiteDeliverables — counts` describe, or a new describe):

```ts
describe('computeSiteDeliverables — inspection-not-applicable', () => {
  it('waived subsections drop out of the inspection count and outstanding list', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [
        { id: 'a', name: 'A' },                                // required, no inspection
        { id: 'b', name: 'B', is_inspection_required: false }, // waived
      ],
      inspections: [],
    }));
    const d = get(s, 'inspections');
    expect(d.total).toBe(1);                       // only A counts
    expect(d.done).toBe(0);
    expect(d.status).toBe('outstanding');
    expect(d.outstandingItems.map(i => i.subsectionId)).toEqual(['a']); // B not listed
  });

  it('a site whose every subsection waives inspection reads not_required', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A', is_inspection_required: false }],
    }));
    expect(get(s, 'inspections').status).toBe('not_required');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/siteDeliverables.test.ts -t "inspection-not-applicable"`
Expected: FAIL (B still counted in total; status not `not_required`).

- [ ] **Step 3: Waive inspections in `buildInspections`**

Replace the body of `buildInspections` in `src/lib/siteDeliverables.ts`:

```ts
function buildInspections(input: SiteDeliverablesInput, subName: Map<string, string>): DeliverableResult {
  const inspected = new Set(
    input.inspections.filter(isInspectionCompleted).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  const total = input.subsections.length;
  const done = input.subsections.filter(s => inspected.has(s.id)).length;
  const items: OutstandingItem[] = input.subsections
    .filter(s => !inspected.has(s.id))
    .map(s => ({
      id: `insp-${s.id}`, category: 'inspections',
      label: `Inspection outstanding: ${subName.get(s.id) ?? 'Subsection'}`,
      severity: 'none', blocking: false,
      subsectionId: s.id, subsectionName: subName.get(s.id),
    }));
  return {
    key: 'inspections', label: DELIVERABLE_LABELS.inspections, kind: 'count',
    done, total,
    status: total === 0 || done === total ? 'complete' : 'outstanding',
    blocking: false, outstandingItems: items,
  };
}
```

with:

```ts
function buildInspections(input: SiteDeliverablesInput, subName: Map<string, string>): DeliverableResult {
  const inspected = new Set(
    input.inspections.filter(isInspectionCompleted).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  // Inspection-not-applicable subsections (is_inspection_required === false) are waived.
  const applicable = input.subsections.filter(s => s.is_inspection_required !== false);
  const total = applicable.length;
  const done = applicable.filter(s => inspected.has(s.id)).length;
  const items: OutstandingItem[] = applicable
    .filter(s => !inspected.has(s.id))
    .map(s => ({
      id: `insp-${s.id}`, category: 'inspections',
      label: `Inspection outstanding: ${subName.get(s.id) ?? 'Subsection'}`,
      severity: 'none', blocking: false,
      subsectionId: s.id, subsectionName: subName.get(s.id),
    }));
  return {
    key: 'inspections', label: DELIVERABLE_LABELS.inspections, kind: 'count',
    done, total,
    status: total === 0 ? 'not_required' : done === total ? 'complete' : 'outstanding',
    blocking: false, outstandingItems: items,
  };
}
```

- [ ] **Step 4: Update the empty-site aggregation test**

`buildInspections` now returns `not_required` (not `complete`) when there are no inspection-required subsections, which changes the empty-site math. In `src/lib/siteDeliverables.test.ts`, find the test `empty site: binary docs outstanding, count categories complete/not_required, band danger` and replace its body:

```ts
    const s = computeSiteDeliverables(baseInput());
    // snags(0/0 complete), inspections(not_required), coc/metering/thermal(not_required),
    // schematic+asset+summary outstanding -> complete 1 of applicable 4 => 25%
    expect(s.completeCount).toBe(1);
    expect(s.applicableCount).toBe(4);
    expect(s.completionPct).toBe(25);
    expect(s.band).toBe('danger');
    expect(s.outstandingCount).toBe(3);
    expect(s.blockingCount).toBe(0);
```

- [ ] **Step 5: Run the full deliverables suite to verify it passes**

Run: `npx vitest run src/lib/siteDeliverables.test.ts`
Expected: PASS (all). If any other test that uses subsections-without-inspections now reads `not_required`, confirm it's the empty-site test only; the existence-based inspections test (subsections WITH inspections) is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/lib/siteDeliverables.ts src/lib/siteDeliverables.test.ts
git commit -m "feat(deliverables): waive inspection-not-applicable subsections from the checklist"
```

---

### Task 3: Feed `is_inspection_required` through the column-list consumers

**Files:**
- Modify: `src/views/Dashboard.tsx:170`
- Modify: `src/app/api/snapshots/capture/route.ts` (subsections `fetchAll`)

`SiteDetail.tsx` and `SiteSummaryReport.tsx` use `select("*")`, so they need no change.

- [ ] **Step 1: Add the column to the Dashboard triage select**

In `src/views/Dashboard.tsx`, change:

```ts
        supabase.from("subsections").select("id, site_id, name, coc_status, is_coc_required, is_thermal_required, metering_status, meter_serial_number"),
```

to:

```ts
        supabase.from("subsections").select("id, site_id, name, coc_status, is_coc_required, is_thermal_required, is_inspection_required, metering_status, meter_serial_number"),
```

- [ ] **Step 2: Add the column to the snapshot capture select**

In `src/app/api/snapshots/capture/route.ts`, change:

```ts
      fetchAll(supabase, "subsections", "id, site_id, name, coc_status, is_coc_required, is_thermal_required, metering_status, meter_serial_number"),
```

to:

```ts
      fetchAll(supabase, "subsections", "id, site_id, name, coc_status, is_coc_required, is_thermal_required, is_inspection_required, metering_status, meter_serial_number"),
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "Dashboard.tsx|capture/route" || echo "no new errors"`
Expected: no new errors (the `subs` cast already in Dashboard absorbs the generated-type lag; capture uses `any[]` via `fetchAll`).

- [ ] **Step 4: Commit**

```bash
git add src/views/Dashboard.tsx src/app/api/snapshots/capture/route.ts
git commit -m "feat: select is_inspection_required for dashboard triage + snapshot capture"
```

---

### Task 4: Subsection "Inspection Required" toggle (UI)

**Files:**
- Modify: `src/views/subsection-detail/types.ts` (`SubsectionData`)
- Modify: `src/views/subsection-detail/useSubsectionDetail.ts` (mapping)
- Modify: `src/views/subsection-detail/OverviewTab.tsx` (toggle)

No unit test — this mirrors the existing COC/Thermal toggles exactly and is verified by typecheck + runtime.

- [ ] **Step 1: Add `isInspectionRequired` to `SubsectionData`**

In `src/views/subsection-detail/types.ts`, change:

```ts
  isCocRequired: boolean;
  isThermalRequired: boolean;
  isCompliant?: boolean | null;
```

to:

```ts
  isCocRequired: boolean;
  isThermalRequired: boolean;
  isInspectionRequired: boolean;
  isCompliant?: boolean | null;
```

- [ ] **Step 2: Map it in `useSubsectionDetail.ts`**

In `src/views/subsection-detail/useSubsectionDetail.ts`, change:

```ts
        isThermalRequired: (fullSubsection as any).is_thermal_required ?? false,
        isCompliant: fullSubsection.is_compliant,
```

to:

```ts
        isThermalRequired: (fullSubsection as any).is_thermal_required ?? false,
        isInspectionRequired: (fullSubsection as any).is_inspection_required ?? true,
        isCompliant: fullSubsection.is_compliant,
```

- [ ] **Step 3: Add the toggle in `OverviewTab.tsx`**

In `src/views/subsection-detail/OverviewTab.tsx`, find the Thermal toggle block that ends with:

```tsx
                {subsection.isThermalRequired ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Overall Status</p>
```

and insert a new block between the Thermal block's closing `</div>` and the `Overall Status` `<div>`:

```tsx
                {subsection.isThermalRequired ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Inspection Required</p>
            <div className="flex items-center gap-2">
              <Badge variant={subsection.isInspectionRequired ? "default" : "secondary"}>
                {subsection.isInspectionRequired ? "Yes" : "No"}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={async () => {
                  const newValue = !subsection.isInspectionRequired;
                  try {
                    const { error } = await supabase
                      .from('subsections')
                      .update({ is_inspection_required: newValue } as any)
                      .eq('id', subsectionId);

                    if (error) throw error;

                    setSubsection({ ...subsection, isInspectionRequired: newValue });
                    toast.success(`Inspection requirement ${newValue ? 'enabled' : 'disabled'}`);
                  } catch (error) {
                    if (process.env.NODE_ENV === 'development') console.error('Error toggling inspection requirement:', error);
                    toast.error('Failed to update inspection requirement');
                  }
                }}
              >
                {subsection.isInspectionRequired ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Overall Status</p>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "OverviewTab|subsection-detail/(types|useSubsectionDetail)" || echo "only pre-existing"`
Expected: at most the pre-existing `OverviewTab` `subsectionId: string|undefined` pattern shared by the COC/Thermal toggles (tolerated; build has `ignoreBuildErrors`). No other new errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/subsection-detail/types.ts src/views/subsection-detail/useSubsectionDetail.ts src/views/subsection-detail/OverviewTab.tsx
git commit -m "feat(ui): Inspection Required toggle on the subsection Overview"
```

---

### Task 5: Database migration (`is_inspection_required` column)

**Files:**
- Create: `supabase/migrations/20260616130000_subsection_inspection_required.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260616130000_subsection_inspection_required.sql`:

```sql
-- Per-subsection "inspection required" flag. When false, the subsection is treated as
-- inspection-not-applicable: waived from the inspection checklist item, the inspection factor
-- of site grading/readiness, and inspection KPIs. COC / metering / snags / thermal are
-- unaffected. Mirrors is_coc_required. Default true = no behaviour change for existing rows.
ALTER TABLE public.subsections
  ADD COLUMN IF NOT EXISTS is_inspection_required boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply to prod via the Management API**

Run (read the project ref from `supabase/config.toml`; the Management-API PAT path is documented in the `site-deliverables-tracking` memory — `User-Agent: curl/8.4.0` to avoid the Cloudflare-1010 block):

```bash
python3 - <<'PY'
import json,urllib.request
REF="oltzgidkjxwsukvkomof"; TOK="<MANAGEMENT_API_PAT>"
def q(sql):
    body=json.dumps({"query":sql}).encode()
    req=urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=body,headers={"Authorization":f"Bearer {TOK}","Content-Type":"application/json","User-Agent":"curl/8.4.0"},method="POST")
    with urllib.request.urlopen(req,timeout=60) as r: return json.load(r)
print(q("ALTER TABLE public.subsections ADD COLUMN IF NOT EXISTS is_inspection_required boolean NOT NULL DEFAULT true; NOTIFY pgrst, 'reload schema';"))
print(q("select is_inspection_required, count(*) n from public.subsections where deleted_at is null group by 1"))
PY
```

Expected: `[]` for the ALTER, then a single row `{is_inspection_required: true, n: <all subsections>}` (default true, no backfill).

- [ ] **Step 3: Record the migration in the ledger (drift-safe)**

```bash
python3 - <<'PY'
import json,urllib.request
REF="oltzgidkjxwsukvkomof"; TOK="<MANAGEMENT_API_PAT>"
def q(sql):
    body=json.dumps({"query":sql}).encode()
    req=urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=body,headers={"Authorization":f"Bearer {TOK}","Content-Type":"application/json","User-Agent":"curl/8.4.0"},method="POST")
    with urllib.request.urlopen(req,timeout=60) as r: return json.load(r)
print(q("""insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260616130000','subsection_inspection_required',
  ARRAY[$mig$ALTER TABLE public.subsections ADD COLUMN IF NOT EXISTS is_inspection_required boolean NOT NULL DEFAULT true;$mig$])
on conflict (version) do nothing returning version, name;"""))
PY
```

Expected: `[{"version":"20260616130000","name":"subsection_inspection_required"}]`.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/20260616130000_subsection_inspection_required.sql
git commit -m "feat(db): add subsections.is_inspection_required (applied to prod)"
```

---

### Task 6: Full verification + deploy

**Files:** none (verification + deploy only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all files. (Was 260; +5 new tests from Tasks 1-2.)

- [ ] **Step 2: Confirm no NEW type errors in changed files**

Run: `npx tsc --noEmit 2>&1 | grep -E "siteHealth|siteDeliverables|Dashboard|capture/route|OverviewTab|subsection-detail" || echo "clean"`
Expected: only the known pre-existing `OverviewTab` `subsectionId` + `Dashboard` setState noise; nothing new from this feature.

- [ ] **Step 3: Push to deploy**

```bash
git push origin main
```

(Vercel auto-deploys `main` → production. Migration from Task 5 is already applied, so the new `is_inspection_required` selects in Dashboard/capture resolve.)

- [ ] **Step 4: Watch the deploy to Ready**

Run: `vercel ls 2>&1 | grep -E "Ready|Building|Error" | head -1`
Expected: newest Production deployment `● Ready` (build ~50-60s). Re-run until Ready.

- [ ] **Step 5: Runtime verification (manual, hard-refresh first — PWA cache)**

On a subsection that can't be inspected: toggle **Inspection Required → No**. Confirm:
1. The site checklist no longer lists an inspection-outstanding item for it.
2. The site grading / inspection KPI no longer counts it as a missing inspection.
3. COC / metering for that subsection are unchanged and still count.

---

## Notes for the implementer

- **Treat `null`/`undefined` `is_inspection_required` as required** (`!== false`) everywhere — legacy rows have no value and must stay inspection-required.
- The generated Supabase types predate this column, so the `.update({ is_inspection_required } as any)` cast in Task 4 and the existing `subs as any[]` cast in Dashboard are intentional (same pattern used for `is_thermal_required`).
- Do **not** touch the server `recompute_subsection_installation_status` / `apply_subsection_recompute` functions — `is_compliant` is deliberately out of scope.
- **Verify `src/components/SiteSummaryReport.tsx`** (Task 3): it uses `select("*")` so it has the column. Confirm it derives any grade/inspection metric from `siteHealth` / `computeSiteDeliverables`. If it counts inspectable subsections directly (its own `subsections.length` for an inspection stat), apply the same `s.is_inspection_required !== false` filter there; otherwise no change needed.
