# Site "Get Compliant" Deep-Linking Checklist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-site Overview tab's KPI cards + inspections list with a "get this site compliant" category checklist where every outstanding item is an act-ready deep-link to the exact upload/input.

**Architecture:** Reuse the Phase-1 `computeSiteDeliverables` read-model. A pure `buildActionHref` turns each outstanding item into a URL (a query-param contract); a new presentational `SiteComplianceChecklist` renders the grouped checklist and navigates via those URLs. Destination pages (SiteDetail, SubsectionDetail + its tabs, SiteReports) read the params on mount/change to switch tabs and open the right dialog / focus the input.

**Tech Stack:** Next.js App Router + React + TypeScript, navigation via `@/lib/navigation` (`useNavigate`, `useSearchParams`, `useParams`), vitest (node env), Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-13-site-compliance-checklist-design.md`

---

## File Structure

**New**
- `src/lib/buildActionHref.ts` — pure: `OutstandingItem` → deep-link URL. + `buildActionHref.test.ts`.
- `src/components/site/SiteComplianceChecklist.tsx` — grouped checklist with act-ready action rows.

**Modified**
- `src/views/SiteDetail.tsx` — Overview renders the checklist; remove the 3 old Overview widgets + their imports + the Phase-1 `handleSelectDeliverable`/`TAB_FOR_CATEGORY`; add a `searchParams` effect (tab-sync + `upload=thermal` dialog); pass `autoOpenGenerate` to SiteReports.
- `src/components/site/SiteReports.tsx` — `autoOpenGenerate?: boolean` opens the generate dialog on mount.
- `src/views/subsection-detail/useSubsectionDetail.ts` — init active tab from `?tab=`; `create=1` opens the create-inspection dialog.
- `src/views/subsection-detail/CocMeteringTab.tsx` — `focus=meter` focuses the meter-serial input.
- `src/views/subsection-detail/OverviewTab.tsx` — `snag={id}` scrolls to / highlights that snag.

**Deleted (orphaned after Overview swap — verified used only in SiteDetail)**
- `src/components/site/SiteReadinessPanel.tsx`, `src/components/site/SiteOverview.tsx`, `src/components/site/SiteLevelInspections.tsx`.

---

## Task 1: `buildActionHref` (pure)

**Files:**
- Create: `src/lib/buildActionHref.ts`
- Test: `src/lib/buildActionHref.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/buildActionHref.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildActionHref } from './buildActionHref';
import type { OutstandingItem } from './siteDeliverables';

const ctx = { clientId: 'c1', siteId: 's1' };
const item = (over: Partial<OutstandingItem>): OutstandingItem => ({
  id: 'i', category: 'schematic', label: 'x', severity: 'none', blocking: false, ...over,
});

describe('buildActionHref', () => {
  it('site-level document deliverables', () => {
    expect(buildActionHref(item({ category: 'schematic' }), ctx)).toBe('/clients/c1/sites/s1?tab=schematic');
    expect(buildActionHref(item({ category: 'asset_register' }), ctx)).toBe('/clients/c1/sites/s1?tab=asset-verification');
    expect(buildActionHref(item({ category: 'thermal' }), ctx)).toBe('/clients/c1/sites/s1?tab=documents&upload=thermal');
    expect(buildActionHref(item({ category: 'summary_report' }), ctx)).toBe('/clients/c1/sites/s1?tab=reports&generate=1');
  });
  it('subsection-level deliverables route into the subsection', () => {
    const sub = { subsectionId: 'sub9' };
    expect(buildActionHref(item({ category: 'coc', ...sub }), ctx)).toBe('/clients/c1/sites/s1/subsections/sub9?tab=coc-metering&focus=coc');
    expect(buildActionHref(item({ category: 'metering', ...sub }), ctx)).toBe('/clients/c1/sites/s1/subsections/sub9?tab=coc-metering&focus=meter');
    expect(buildActionHref(item({ category: 'inspections', ...sub }), ctx)).toBe('/clients/c1/sites/s1/subsections/sub9?tab=inspections&create=1');
    expect(buildActionHref(item({ id: 'snag5', category: 'snags', ...sub }), ctx)).toBe('/clients/c1/sites/s1/subsections/sub9?tab=overview&snag=snag5');
  });
  it('subsection deliverable without subsectionId falls back to the subsections tab', () => {
    expect(buildActionHref(item({ category: 'coc' }), ctx)).toBe('/clients/c1/sites/s1?tab=subsections');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/buildActionHref.test.ts`
Expected: FAIL — "Cannot find module './buildActionHref'".

- [ ] **Step 3: Implement**

Create `src/lib/buildActionHref.ts`:

```ts
/**
 * Pure: turns a deliverables OutstandingItem into a deep-link URL (query-param contract).
 * Destination pages read these params (tab, upload, generate, focus, create, snag) to land the
 * user on the exact tab/subsection with the right dialog open / input focused. See
 * docs/superpowers/specs/2026-06-13-site-compliance-checklist-design.md.
 */
import type { OutstandingItem } from './siteDeliverables';

export interface ActionHrefContext {
  clientId: string;
  siteId: string;
}

export function buildActionHref(item: OutstandingItem, ctx: ActionHrefContext): string {
  const base = `/clients/${ctx.clientId}/sites/${ctx.siteId}`;
  const sub = item.subsectionId ? `${base}/subsections/${item.subsectionId}` : null;
  switch (item.category) {
    case 'schematic':       return `${base}?tab=schematic`;
    case 'asset_register':  return `${base}?tab=asset-verification`;
    case 'thermal':         return `${base}?tab=documents&upload=thermal`;
    case 'summary_report':  return `${base}?tab=reports&generate=1`;
    case 'coc':             return sub ? `${sub}?tab=coc-metering&focus=coc` : `${base}?tab=subsections`;
    case 'metering':        return sub ? `${sub}?tab=coc-metering&focus=meter` : `${base}?tab=subsections`;
    case 'inspections':     return sub ? `${sub}?tab=inspections&create=1` : `${base}?tab=subsections`;
    case 'snags':           return sub ? `${sub}?tab=overview&snag=${item.id}` : `${base}?tab=subsections`;
    default:                return `${base}?tab=overview`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/buildActionHref.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/buildActionHref.ts src/lib/buildActionHref.test.ts
git commit -m "feat(checklist): buildActionHref — deep-link URL per deliverable"
```

---

## Task 2: `SiteComplianceChecklist` component

**Files:**
- Create: `src/components/site/SiteComplianceChecklist.tsx`

No unit test (vitest env is `node`; no DOM infra). Typechecked by `next build` in Task 3.

- [ ] **Step 1: Create the component**

Create `src/components/site/SiteComplianceChecklist.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, AlertTriangle, ChevronRight } from "lucide-react";
import { useNavigate } from "@/lib/navigation";
import {
  DELIVERABLE_ORDER,
  type SiteDeliverablesSummary,
  type DeliverableResult,
  type DeliverableKey,
} from "@/lib/siteDeliverables";
import { buildActionHref } from "@/lib/buildActionHref";

const ACTION_VERB: Record<DeliverableKey, string> = {
  schematic: "Upload",
  asset_register: "Upload",
  thermal: "Upload",
  summary_report: "Generate",
  coc: "Set COC",
  metering: "Enter meter",
  inspections: "Create",
  snags: "Open",
};

function statusBadge(d: DeliverableResult) {
  if (d.status === "complete") return <Badge className="bg-emerald-500/15 text-emerald-700">✓</Badge>;
  if (d.status === "not_required") return <Badge variant="secondary">N/A</Badge>;
  if (d.kind === "count") return <Badge className="bg-amber-500/15 text-amber-700">{d.done}/{d.total}</Badge>;
  return <Badge className="bg-red-500/15 text-red-700">✕</Badge>;
}

function bucket(d: DeliverableResult): number {
  if (d.blocking) return 0;
  if (d.status === "outstanding") return 1;
  if (d.status === "not_required") return 2;
  return 3; // complete
}

interface Props {
  summary: SiteDeliverablesSummary;
  clientId: string;
  siteId: string;
}

export function SiteComplianceChecklist({ summary, clientId, siteId }: Props) {
  const navigate = useNavigate();
  const groups = [...summary.deliverables].sort(
    (a, b) => bucket(a) - bucket(b) || DELIVERABLE_ORDER.indexOf(a.key) - DELIVERABLE_ORDER.indexOf(b.key),
  );

  return (
    <Card className="glass-card border-none">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Get this site compliant</CardTitle>
          <div className="flex items-center gap-2">
            {summary.blockingCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {summary.blockingCount} blocking
              </Badge>
            )}
            <span className="text-sm font-semibold text-muted-foreground">
              {summary.completeCount} of {summary.applicableCount} complete · {summary.completionPct}%
            </span>
          </div>
        </div>
        <Progress value={summary.completionPct} className="mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.map((d) => {
          const done = d.status === "complete" || d.status === "not_required";
          return (
            <div key={d.key} className="rounded-lg border overflow-hidden">
              <div className={`flex items-center gap-2 px-3 py-2 ${done ? "opacity-70" : ""} bg-muted/30`}>
                {statusBadge(d)}
                <span className="text-sm font-medium">{d.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {d.status === "complete" ? "complete"
                    : d.status === "not_required" ? "not required"
                    : `${d.outstandingItems.length} outstanding`}
                </span>
              </div>
              {!done && d.outstandingItems.length > 0 && (
                <div className="p-2 space-y-1">
                  {d.outstandingItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => navigate(buildActionHref(item, { clientId, siteId }))}
                      className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {item.blocking
                          ? <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" aria-hidden="true" />
                          : <Circle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />}
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0 text-xs font-semibold text-primary">
                        {ACTION_VERB[item.category]}
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/site/SiteComplianceChecklist.tsx
git commit -m "feat(checklist): SiteComplianceChecklist grouped deep-link component"
```

---

## Task 3: Wire checklist into SiteDetail Overview (+ remove old widgets, deep-link params)

**Files:**
- Modify: `src/views/SiteDetail.tsx`

- [ ] **Step 1: Swap imports**

Remove these three imports (they're at lines ~13, ~19, ~32):
```tsx
import { SiteOverview } from "@/components/site/SiteOverview";
import { SiteLevelInspections } from "@/components/site/SiteLevelInspections";
import { SiteReadinessPanel } from "@/components/site/SiteReadinessPanel";
```
Change the Phase-1 deliverables import from:
```tsx
import { computeSiteDeliverables, type OutstandingItem, type DeliverableKey } from "@/lib/siteDeliverables";
```
to:
```tsx
import { computeSiteDeliverables, categoryMatches, THERMAL_CATEGORY_PATTERNS } from "@/lib/siteDeliverables";
import { SiteComplianceChecklist } from "@/components/site/SiteComplianceChecklist";
```
Ensure `useEffect` and `useRef` are imported from "react" (add to the existing react import if missing).

- [ ] **Step 2: Remove the Phase-1 `handleSelectDeliverable` + `TAB_FOR_CATEGORY`**

Delete this block (added in Phase 1, before the `return (`):
```tsx
  const TAB_FOR_CATEGORY: Record<DeliverableKey, string> = {
    snags: "subsections",
    inspections: "subsections",
    metering: "subsections",
    coc: "compliance",
    schematic: "schematic",
    asset_register: "asset-verification",
    thermal: "documents",
    summary_report: "reports",
  };
  const handleSelectDeliverable = (item: OutstandingItem) => {
    setActiveTab(TAB_FOR_CATEGORY[item.category]);
  };
```
Keep the `const deliverablesSummary = computeSiteDeliverables({...})` block immediately above it.

- [ ] **Step 3: Add the deep-link param effect**

Immediately after the `const deliverablesSummary = computeSiteDeliverables({...})` block, add:
```tsx
  // Deep-link params: sync the active tab on every change; open the thermal upload dialog once.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const thermalDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (thermalDeepLinkHandled.current) return;
    if (searchParams.get('upload') === 'thermal' && documentCategories.length > 0) {
      const thermalCat = documentCategories.find((c: any) => categoryMatches([c?.name], THERMAL_CATEGORY_PATTERNS));
      if (thermalCat) {
        setUploadCategoryId(thermalCat.id);
        setUploadDialogOpen(true);
        thermalDeepLinkHandled.current = true;
      }
    }
  }, [searchParams, documentCategories]);
```

- [ ] **Step 4: Replace the Overview tab body**

Find (lines ~654–658):
```tsx
        <TabsContent value="overview" className="space-y-6 mt-6">
          <SiteReadinessPanel summary={deliverablesSummary} onSelectItem={handleSelectDeliverable} />
          <SiteOverview site={site} stats={stats} onTabChange={setActiveTab} />
          <SiteLevelInspections inspections={inspections} siteId={siteId!} clientId={clientId} onCreateClick={() => setIsCreateInspectionOpen(true)} />
        </TabsContent>
```
Replace with:
```tsx
        <TabsContent value="overview" className="space-y-6 mt-6">
          <SiteComplianceChecklist summary={deliverablesSummary} clientId={clientId!} siteId={siteId!} />
        </TabsContent>
```

- [ ] **Step 5: Pass the generate deep-link to SiteReports**

Find (lines ~712–714):
```tsx
        <TabsContent value="reports">
          <SiteReports site={site} />
        </TabsContent>
```
Replace with:
```tsx
        <TabsContent value="reports">
          <SiteReports site={site} autoOpenGenerate={searchParams.get('generate') === '1'} />
        </TabsContent>
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds. NOTE: `tsconfig.json` has `noUnusedLocals: false`, so any symbol left unused by removing the three widgets (e.g. the `stats` value, the orphaned site-level inspection dialog state) will NOT break the build — leave them; the orphaned dialog is handled in Task 7. Just make sure the three removed imports are gone and the new `SiteComplianceChecklist` import is present. (`inspections` is still used — passed to `computeSiteDeliverables` and to `ComplianceDashboard` on the compliance tab.)

- [ ] **Step 7: Commit**

```bash
git add src/views/SiteDetail.tsx
git commit -m "feat(checklist): SiteDetail Overview becomes the compliance checklist + deep-link params"
```

---

## Task 4: `SiteReports` auto-open generate dialog

**Files:**
- Modify: `src/components/site/SiteReports.tsx`

- [ ] **Step 1: Add the prop + effect**

Change the props interface (lines ~30–33) from:
```tsx
interface SiteReportsProps {
    site: Site;
    readOnly?: boolean;
}
```
to:
```tsx
interface SiteReportsProps {
    site: Site;
    readOnly?: boolean;
    autoOpenGenerate?: boolean;
}
```
Change the component signature (line ~53) from:
```tsx
export const SiteReports: React.FC<SiteReportsProps> = ({ site, readOnly = false }) => {
```
to:
```tsx
export const SiteReports: React.FC<SiteReportsProps> = ({ site, readOnly = false, autoOpenGenerate = false }) => {
```
After the `const [settingsOpen, setSettingsOpen] = useState(false);` line (~54), add:
```tsx
    useEffect(() => {
        if (autoOpenGenerate) setSettingsOpen(true);
    }, [autoOpenGenerate]);
```
Ensure `useEffect` is imported from "react" (add to the existing react import if missing).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds, no type errors in SiteReports. (If `settingsOpen` turns out to gate a different dialog than the generate one, the report deep-link still lands on the Reports tab with the Generate button visible — acceptable fallback; note it.)

- [ ] **Step 3: Commit**

```bash
git add src/components/site/SiteReports.tsx
git commit -m "feat(checklist): SiteReports opens generate dialog on autoOpenGenerate deep-link"
```

---

## Task 5: SubsectionDetail — init tab from params + auto-open create-inspection

**Files:**
- Modify: `src/views/subsection-detail/useSubsectionDetail.ts`

- [ ] **Step 1: Read params in the hook**

At the top of `useSubsectionDetail` (near the other hooks; the file already calls `useParams()` and `useNavigate()`), add `useSearchParams`:
```tsx
import { useParams, useNavigate, useSearchParams } from "@/lib/navigation";
```
(merge into the existing `@/lib/navigation` import if one exists). Inside the hook body add:
```tsx
  const [searchParams] = useSearchParams();
```

- [ ] **Step 2: Initialize the active tab from `?tab=`**

Change (line ~42):
```tsx
  const [activeTab, setActiveTab] = useState("overview");
```
to:
```tsx
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");
```

- [ ] **Step 3: Auto-open the create-inspection dialog on `create=1`**

After the `isCreateInspectionOpen` state is declared (line ~47), add this effect (place it with the other effects in the hook body):
```tsx
  useEffect(() => {
    if (searchParams.get("create") === "1") setIsCreateInspectionOpen(true);
  }, [searchParams]);
```
Ensure `useEffect` is imported from "react".

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/views/subsection-detail/useSubsectionDetail.ts
git commit -m "feat(checklist): subsection reads ?tab= and create=1 deep-link params"
```

---

## Task 6: Focus the meter input + highlight the snag

**Files:**
- Modify: `src/views/subsection-detail/CocMeteringTab.tsx`
- Modify: `src/views/subsection-detail/OverviewTab.tsx`

- [ ] **Step 1: CocMeteringTab — focus the meter input on `focus=meter`**

In `src/views/subsection-detail/CocMeteringTab.tsx`, add imports at top:
```tsx
import { useEffect, useRef } from "react";
import { useSearchParams } from "@/lib/navigation";
```
(merge with existing react import). Inside the component body (near the top), add:
```tsx
  const [searchParams] = useSearchParams();
  const meterInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchParams.get("focus") === "meter") {
      meterInputRef.current?.focus();
      meterInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [searchParams]);
```
Add the ref to the meter-serial `<Input>` (lines ~212–218):
```tsx
                <Input
                  ref={meterInputRef}
                  value={meterSerialNumber || subsection.meterSerialNumber || ''}
                  onChange={(e) => setMeterSerialNumber(e.target.value)}
                  placeholder="Enter meter serial number"
                  className="mt-1"
                />
```
(The shadcn `Input` forwards refs.)

- [ ] **Step 2: OverviewTab — scroll to / highlight a snag on `snag={id}`**

In `src/views/subsection-detail/OverviewTab.tsx`, add imports at top:
```tsx
import { useEffect } from "react";
import { useSearchParams } from "@/lib/navigation";
```
(merge with existing react import). Inside the component body add:
```tsx
  const [searchParams] = useSearchParams();
  const highlightSnagId = searchParams.get("snag");
  useEffect(() => {
    if (!highlightSnagId) return;
    const el = document.querySelector(`[data-snag-id="${highlightSnagId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("ring-2", "ring-primary");
    const t = setTimeout(() => el?.classList.remove("ring-2", "ring-primary"), 2500);
    return () => clearTimeout(t);
  }, [highlightSnagId]);
```
Add `data-snag-id` to the snag row (lines ~343):
```tsx
      <div key={snag.id} data-snag-id={snag.id} className="flex items-center justify-between p-2 border rounded text-sm">
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/views/subsection-detail/CocMeteringTab.tsx src/views/subsection-detail/OverviewTab.tsx
git commit -m "feat(checklist): focus meter input and highlight snag on deep-link"
```

---

## Task 7: Delete orphaned components + full verification

**Files:**
- Delete: `src/components/site/SiteReadinessPanel.tsx`, `src/components/site/SiteOverview.tsx`, `src/components/site/SiteLevelInspections.tsx`

- [ ] **Step 1: Confirm the three components are unreferenced**

Run: `grep -rn "SiteReadinessPanel\|SiteOverview\|SiteLevelInspections" src --include="*.tsx" --include="*.ts"`
Expected: no remaining references (Task 3 removed the imports/usages). If any remain, resolve them before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/site/SiteReadinessPanel.tsx src/components/site/SiteOverview.tsx src/components/site/SiteLevelInspections.tsx
```

- [ ] **Step 3: Leave the orphaned site-level inspection dialog (scope note)**

After removing `SiteLevelInspections`, SiteDetail's site-level create-inspection dialog (`isCreateInspectionOpen` + `<InspectionDialogs>` + `handleCreateInspection`) has no UI trigger. Because `noUnusedLocals: false`, this does NOT break the build, and removing it cleanly would mean unpicking ~6 scattered symbols — out of scope for "clean up the *visible* Overview". **Leave it in place** (invisible dead UI) and note it as a follow-up. Do not chase it.

- [ ] **Step 4: Full verification**

Run: `npm test`
Expected: PASS — the existing suites plus the new `buildActionHref` tests (3).

Run: `npm run build`
Expected: exit 0, no type errors.

- [ ] **Step 5: Manual verification (auth-gated; do what you can)**

Run `npm run dev`; on a site's Overview confirm: the checklist renders (groups, blocking first, done collapsed); clicking "Upload" on Schematic switches to the schematic tab; "Upload" on Thermal opens the documents upload dialog; a COC/metering item jumps to that subsection's COC tab (meter item focuses the meter field); a Create item opens the subsection's create-inspection dialog. (If you can't authenticate, note it and rely on the build.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(checklist): delete orphaned Overview widgets (SiteReadinessPanel/SiteOverview/SiteLevelInspections)"
```

---

## Verification summary (whole feature)

- [ ] `npm test` — green (incl. new `buildActionHref` tests).
- [ ] `npm run build` — exit 0, no type errors.
- [ ] No dangling references to the deleted components.
- [ ] Manual: checklist renders; each action deep-links to the right tab/subsection with the dialog/input ready.

## Notes for the executor

- **Deep-link param vocabulary:** `tab`, `upload=thermal`, `generate=1`, `focus=meter|coc`, `create=1`, `snag={id}`. `buildActionHref` is the only place that emits them; the destinations read them.
- **Same-page vs cross-page:** site-level items (schematic/asset/thermal/report) stay on SiteDetail — the `searchParams` tab-sync effect (Task 3 Step 3) switches the tab when the query changes. Subsection items navigate to a different route, so SubsectionDetail/its hook read the params on fresh mount (Task 5/6).
- **`focus=coc`** intentionally needs no extra wiring — the COC section is already at the top of the `coc-metering` tab, so landing there is act-ready. Only `focus=meter` focuses an input.
- **Snags** land-and-highlight (rectification lives in the inspection flow); honest verb is "Open". Per the spec's out-of-scope, a rectify-deep-link is a follow-up.
- Do NOT touch `src/lib/siteDeliverables.ts` (read-model) or the global dashboard widget.
