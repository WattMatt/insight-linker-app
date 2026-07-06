# Site Dashboard KPI Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the site Dashboard → KPIs sub-tab (`ComplianceDashboard`) on the existing `computeSiteDeliverables`/`readiness` model — adding readiness, an 8-deliverable grid, snag risk/aging, COC-expiry, drill-down, a visual redesign, and (Part 2) week-over-week trends backed by a new snapshot table.

**Architecture:** Part 1 is frontend-only — the KPIs consume the same read-models as the Checklist sub-tab (one source of truth) plus two new pure helpers in `kpiMetrics.ts`; drill-down reuses `buildActionHref`. Part 2 adds `site_health_snapshots` (DB), a daily Vercel-cron → Next API route that reuses `computeSiteDeliverables` to write one row per site, and wires sparklines into the Trends card.

**Tech Stack:** React + TypeScript, Supabase (Postgres + RLS), Next.js App Router, recharts (already a dep), vitest, shadcn/ui, Vercel cron.

**Decisions to confirm before Part 2 ships:**
- **D1 — capture mechanism:** Vercel cron + first Next API route (reuses the TS model; recommended) vs Supabase edge function (matches existing backend pattern but duplicates the model in Deno).
- **D2 — prod migration:** apply `site_health_snapshots` via the Supabase Management API / SQL editor, NOT `supabase db push` (prod schema is ahead of `schema_migrations` — see the prod-migration-drift note). The migration file in-repo is for record + local.
- **D3 — branch:** given the scope + a DB migration, do this on a feature branch + PR rather than direct-to-main.

---

## File structure

**Part 1 (frontend, no DB):**
- Create `src/lib/kpiMetrics.ts` — pure helpers: `cocExpiryBuckets`, `snagAging`. One responsibility: derive display metrics not already produced by `siteDeliverables`/`siteHealth`.
- Create `src/lib/kpiMetrics.test.ts` — unit tests for the above.
- Modify `src/components/ComplianceDashboard.tsx` — rebuild UI on `deliverablesSummary` (prop) + `readiness()` + `kpiMetrics`; add drill-down. New props: `deliverablesSummary`, `clientId`; extend the `subsections` prop with `coc_expiry_date`.
- Modify `src/views/SiteDetail.tsx` — pass `deliverablesSummary={deliverablesSummary}` and `clientId={clientId!}` into `ComplianceDashboard` (both already in scope).

**Part 2 (trends backend + chart):**
- Create `supabase/migrations/20260616110000_site_health_snapshots.sql` — table + indexes + RLS.
- Create `src/lib/snapshotMetrics.ts` — pure: map a `SiteDeliverablesSummary` + readiness + open-snag count → a snapshot row. Testable.
- Create `src/lib/snapshotMetrics.test.ts`.
- Create `src/app/api/snapshots/capture/route.ts` — cron-authenticated GET; loads all sites' data (mirrors `Dashboard.fetchTriageData`), computes via shared model, upserts snapshots.
- Modify `vercel.json` — add a daily `crons` entry.
- Modify `src/components/ComplianceDashboard.tsx` — the Trends card fetches `site_health_snapshots` and renders sparklines (or a "collecting data" state).

---

## Part 1 — Frontend KPI upgrade

### Task 1: Pure KPI helpers (`kpiMetrics.ts`)

**Files:**
- Create: `src/lib/kpiMetrics.ts`
- Test: `src/lib/kpiMetrics.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { cocExpiryBuckets, snagAging } from "./kpiMetrics";

describe("cocExpiryBuckets", () => {
  const today = "2026-06-16";
  it("buckets Pass certs by days-to-expiry; ignores blanks and non-Pass", () => {
    const subs = [
      { coc_status: "Pass", coc_expiry_date: "2026-06-01" }, // expired
      { coc_status: "Pass", coc_expiry_date: "2026-07-01" }, // <=30
      { coc_status: "Pass", coc_expiry_date: "2026-08-20" }, // <=90
      { coc_status: "Pass", coc_expiry_date: "2027-01-01" }, // beyond 90 -> none
      { coc_status: "Pass", coc_expiry_date: null },          // ignored
      { coc_status: "Fail", coc_expiry_date: "2026-06-01" },  // not Pass -> ignored
    ];
    expect(cocExpiryBuckets(subs, today)).toEqual({ expired: 1, within30: 1, within90: 1 });
  });
});

describe("snagAging", () => {
  const today = "2026-06-16";
  it("counts high-risk open, oldest open age, and median resolve days", () => {
    const snags = [
      { status: "Open", risk_level: "Critical", created_at: "2026-05-01" }, // open 46d, high-risk
      { status: "open", risk_level: "Low", created_at: "2026-06-10" },       // open 6d
      { status: "Rectified", created_at: "2026-06-01", rectified_at: "2026-06-05" }, // 4d
      { status: "closed", created_at: "2026-06-01", rectified_at: "2026-06-11" },    // 10d
    ];
    const r = snagAging(snags, today);
    expect(r.criticalOpen).toBe(1);
    expect(r.oldestOpenDays).toBe(46);
    expect(r.medianResolveDays).toBe(7); // median of [4,10]
  });
  it("returns nulls when there are no open / no resolved snags", () => {
    expect(snagAging([], today)).toEqual({ criticalOpen: 0, oldestOpenDays: null, medianResolveDays: null });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/kpiMetrics.test.ts`
Expected: FAIL — module `./kpiMetrics` not found.

- [ ] **Step 3: Implement `kpiMetrics.ts`**

```ts
// Pure KPI helpers for the site dashboard — metrics NOT already produced by
// siteDeliverables.ts / siteHealth.ts. No I/O. See kpiMetrics.test.ts.
import { snagStatusBucket } from "./subsectionStatus";
import { BLOCKING_RISK_LEVELS } from "./siteHealth";

const DAY = 86_400_000;
const daysBetween = (fromISO: string, toISO: string) =>
  Math.floor((Date.parse(toISO) - Date.parse(fromISO)) / DAY);

export interface SubsectionForExpiry {
  coc_status?: string | null;
  coc_expiry_date?: string | null;
}
export interface CocExpiryBuckets { expired: number; within30: number; within90: number; }

export function cocExpiryBuckets(subs: SubsectionForExpiry[], today: string): CocExpiryBuckets {
  const b: CocExpiryBuckets = { expired: 0, within30: 0, within90: 0 };
  for (const s of subs) {
    if (!s.coc_expiry_date) continue;
    if ((s.coc_status || "").toLowerCase() !== "pass") continue;
    const days = daysBetween(today, s.coc_expiry_date);
    if (days < 0) b.expired++;
    else if (days <= 30) b.within30++;
    else if (days <= 90) b.within90++;
  }
  return b;
}

export interface SnagForAging {
  status?: string | null;
  risk_level?: string | null;
  created_at?: string | null;
  rectified_at?: string | null;
}
export interface SnagAging { criticalOpen: number; oldestOpenDays: number | null; medianResolveDays: number | null; }

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function snagAging(snags: SnagForAging[], today: string): SnagAging {
  let criticalOpen = 0;
  let oldestOpenDays: number | null = null;
  const resolveDurations: number[] = [];
  for (const s of snags) {
    const open = snagStatusBucket(s.status) !== "closed";
    if (open) {
      if (BLOCKING_RISK_LEVELS.includes(s.risk_level || "")) criticalOpen++;
      if (s.created_at) {
        const age = daysBetween(s.created_at, today);
        oldestOpenDays = oldestOpenDays === null ? age : Math.max(oldestOpenDays, age);
      }
    } else if (s.created_at && s.rectified_at) {
      resolveDurations.push(daysBetween(s.created_at, s.rectified_at));
    }
  }
  return { criticalOpen, oldestOpenDays, medianResolveDays: median(resolveDurations) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/kpiMetrics.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiMetrics.ts src/lib/kpiMetrics.test.ts
git commit -m "feat(kpi): add cocExpiryBuckets + snagAging pure helpers"
```

### Task 2: Thread the deliverables model + clientId into ComplianceDashboard

**Files:**
- Modify: `src/views/SiteDetail.tsx` (the `<ComplianceDashboard .../>` render in the KPI inner tab)
- Modify: `src/components/ComplianceDashboard.tsx` (props interface only, this task)

- [ ] **Step 1: Extend the props interface** in `ComplianceDashboard.tsx` — add `clientId: string`, `deliverablesSummary: SiteDeliverablesSummary` (import the type from `@/lib/siteDeliverables`), and add `coc_expiry_date?: string | null` to each entry of the `subsections` array type.

- [ ] **Step 2: Pass the new props** in `SiteDetail.tsx`. The KPI inner tab currently renders:

```tsx
<ComplianceDashboard siteId={siteId!} subsections={subsections} inspections={inspections} />
```

Change to:

```tsx
<ComplianceDashboard siteId={siteId!} clientId={clientId!} subsections={subsections} inspections={inspections} deliverablesSummary={deliverablesSummary} />
```

(`deliverablesSummary` is already computed at `SiteDetail.tsx:601`; `clientId` is from `useParams`; `subsections` rows already carry `coc_expiry_date` at runtime.)

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit 2>&1 | grep ComplianceDashboard` → expect no NEW errors beyond the project's pre-existing baseline. Commit.

```bash
git add src/views/SiteDetail.tsx src/components/ComplianceDashboard.tsx
git commit -m "feat(kpi): thread deliverablesSummary + clientId into ComplianceDashboard"
```

### Task 3: Rebuild the ComplianceDashboard UI on the shared model + drill-down

**Files:**
- Modify: `src/components/ComplianceDashboard.tsx`

Build the sections from the approved mockup. Keep the existing snag-fetch `useEffect` (it already loads `healthSnags`/`healthInspections`/snag counts and the `snagError` state). Add `readiness()` (from `@/lib/siteHealth`) and `kpiMetrics` derivations. Each task below is one section; verify `tsc` + render after each.

- [ ] **Step 1: Readiness hero** — compute `const r = readiness(subsections, healthSnags, healthInspections);` Render a card: `r.ready` / `r.total` ready, a progress bar at `Math.round(r.ready / Math.max(r.total,1) * 100)`%, and three chips from `r.failing` (`{metering}`, `{snags}`, `{inspection}`) using `--color-*-danger/warning` tokens. This replaces the old "Overall Site Health" headline number — keep the weighted health score as a small secondary stat if desired (`siteHealthScore(factorScores(...))`).

- [ ] **Step 2: Handover completion + 8-deliverable grid** — from `deliverablesSummary`: hero shows `completionPct`%, `completeCount`/`applicableCount` deliverables, `blockingCount` (red) and `outstandingCount` chips. Below it, map `deliverablesSummary.deliverables` to a grid; each cell shows `label`, `done`/`total` (or a check when `status==='complete'`), status colour (`complete`→success, `outstanding`→warning, `blocking`→danger, `not_required`→dimmed/hidden), and is a button that drills down (Step 5).

- [ ] **Step 3: Snag risk & aging** — keep the open/in-progress/closed segmented display from `snagCounts`; add `const aging = snagAging(<snags>, todayISO);` Show `aging.criticalOpen` (high-risk open), `aging.oldestOpenDays` and `aging.medianResolveDays` as small stats. NOTE: `snagAging` needs the raw snag rows — extend the existing snag fetch to keep them in state (today only counts are kept). Add `const [snagRows, setSnagRows] = useState<SnagForAging[]>([])` and set it alongside `setSnagCounts`.

- [ ] **Step 4: COC expiry card** — `const exp = cocExpiryBuckets(subsections, todayISO);` render the three buckets (`expired`, `within30`, `within90`) with danger/warning tokens; hide the card if all zero and there are no COC-required subs.

- [ ] **Step 5: Drill-down** — add `const navigate = useNavigate();` (from `@/lib/navigation`). For deliverable cells, navigate via `buildActionHref` using the deliverable's first `outstandingItems[0]` (or a synthetic item `{category: d.key}` for binary deliverables): `navigate(buildActionHref(item, { clientId, siteId }))`. For the snag card, navigate to `?tab=subsections` (or the snags surface); for COC expiry, to a COC-required subsection's `coc-metering` tab. Mirror the pattern in `SiteComplianceChecklist.tsx:90`.

- [ ] **Step 6: Trends card placeholder** — render a card titled "Trends" with a muted "Collecting data — weekly trends appear here once snapshots accrue." (Part 2 replaces the body.)

- [ ] **Step 7: Verify + commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "ComplianceDashboard|kpiMetrics"` (expect none) and `npm test` (expect 252+ pass).
Manually: load a site → Dashboard → KPIs; confirm readiness, deliverables grid (8), snag aging, COC expiry render and that clicking a deliverable navigates.

```bash
git add src/components/ComplianceDashboard.tsx
git commit -m "feat(kpi): rebuild site KPIs on deliverables+readiness with drill-down and COC expiry"
```

### Task 4: Part 1 verification gate

- [ ] Run `npx tsc --noEmit 2>&1 | grep -E "src/" | wc -l` → confirm count == project baseline (no new errors).
- [ ] Run `npm test` → all pass.
- [ ] Runtime: KPIs sub-tab matches the mockup; drill-down works; empty-site and failed-fetch states are honest.

---

## Part 2 — Trends backend

### Task 5: `site_health_snapshots` migration

**Files:**
- Create: `supabase/migrations/20260616110000_site_health_snapshots.sql`

- [ ] **Step 1: Write the migration** (mirror existing RLS conventions in `supabase/migrations/`)

```sql
create table if not exists public.site_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  captured_at date not null default current_date,
  health_score int,
  completion_pct int,
  outstanding_count int,
  blocking_count int,
  open_snags int,
  ready_count int,
  total_subsections int,
  created_at timestamptz not null default now(),
  unique (site_id, captured_at)
);

create index if not exists idx_site_health_snapshots_site_date
  on public.site_health_snapshots (site_id, captured_at desc);

alter table public.site_health_snapshots enable row level security;

create policy "site_health_snapshots_read_authenticated"
  on public.site_health_snapshots for select to authenticated using (true);
```

- [ ] **Step 2 (GATE — D2):** Do NOT `supabase db push`. Apply to prod via the Supabase Management API / SQL editor after confirming with the user (prod schema drift). Verify with: `select count(*) from public.site_health_snapshots;` returns 0.
- [ ] **Step 3: Commit the migration file** (record only).

```bash
git add supabase/migrations/20260616110000_site_health_snapshots.sql
git commit -m "feat(db): add site_health_snapshots table + RLS (migration record)"
```

### Task 6: Snapshot mapping helper (`snapshotMetrics.ts`)

**Files:**
- Create: `src/lib/snapshotMetrics.ts`
- Test: `src/lib/snapshotMetrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { toSnapshotRow } from "./snapshotMetrics";

describe("toSnapshotRow", () => {
  it("maps a summary + readiness + score + open snags to a snapshot row", () => {
    const row = toSnapshotRow({
      siteId: "s1", capturedAt: "2026-06-16",
      summary: { completionPct: 63, outstandingCount: 31, blockingCount: 4 } as any,
      readiness: { ready: 12, total: 18 } as any,
      healthScore: 71, openSnags: 14,
    });
    expect(row).toEqual({
      site_id: "s1", captured_at: "2026-06-16",
      health_score: 71, completion_pct: 63, outstanding_count: 31,
      blocking_count: 4, open_snags: 14, ready_count: 12, total_subsections: 18,
    });
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/lib/snapshotMetrics.test.ts`

- [ ] **Step 3: Implement**

```ts
import type { SiteDeliverablesSummary } from "./siteDeliverables";
import type { ReadinessResult } from "./siteHealth";

export interface SnapshotInput {
  siteId: string; capturedAt: string;
  summary: SiteDeliverablesSummary; readiness: ReadinessResult;
  healthScore: number; openSnags: number;
}
export interface SnapshotRow {
  site_id: string; captured_at: string; health_score: number;
  completion_pct: number; outstanding_count: number; blocking_count: number;
  open_snags: number; ready_count: number; total_subsections: number;
}

export function toSnapshotRow(i: SnapshotInput): SnapshotRow {
  return {
    site_id: i.siteId, captured_at: i.capturedAt,
    health_score: i.healthScore, completion_pct: i.summary.completionPct,
    outstanding_count: i.summary.outstandingCount, blocking_count: i.summary.blockingCount,
    open_snags: i.openSnags, ready_count: i.readiness.ready, total_subsections: i.readiness.total,
  };
}
```

- [ ] **Step 4: Run → PASS. Commit.**

```bash
git add src/lib/snapshotMetrics.ts src/lib/snapshotMetrics.test.ts
git commit -m "feat(kpi): snapshot row mapping helper"
```

### Task 7: Capture API route (D1 = Vercel cron + Next route)

**Files:**
- Create: `src/app/api/snapshots/capture/route.ts`

- [ ] **Step 1: Implement the route** — cron-authenticated GET; load all sites' data the same way `Dashboard.fetchTriageData` does (sites, subsections, snags, inspections, schematics, assets, site_documents); for each site run `computeSiteDeliverables`, `readiness`, `siteHealthScore(factorScores(...))`, count open snags; `toSnapshotRow`; upsert on `(site_id, captured_at)`.

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeSiteDeliverables, type SiteDeliverablesInput } from "@/lib/siteDeliverables";
import { factorScores, siteHealthScore, readiness } from "@/lib/siteHealth";
import { isSnagOpen } from "@/lib/subsectionStatus";
import { toSnapshotRow } from "@/lib/snapshotMetrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const capturedAt = new Date().toISOString().slice(0, 10);
  // ... load + group per site exactly as Dashboard.fetchTriageData (build SiteDeliverablesInput[]) ...
  // For each input: const summary = computeSiteDeliverables(input);
  //   const rd = readiness(input.subsections, input.snags, input.inspections);
  //   const score = siteHealthScore(factorScores(input.subsections, input.snags, input.inspections));
  //   const openSnags = input.snags.filter(s => isSnagOpen(s.status)).length;
  //   rows.push(toSnapshotRow({ siteId: input.siteId, capturedAt, summary, readiness: rd, healthScore: score, openSnags }));
  // const { error } = await supabase.from("site_health_snapshots").upsert(rows, { onConflict: "site_id,captured_at" });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Add env vars** — document that `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel (Production). Do not commit secrets.
- [ ] **Step 3: Test locally** — `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/snapshots/capture` → `{ ok: true }`; verify rows appear in a dev/staging DB.
- [ ] **Step 4: Commit.**

```bash
git add src/app/api/snapshots/capture/route.ts
git commit -m "feat(kpi): daily snapshot capture route reusing computeSiteDeliverables"
```

### Task 8: Vercel cron entry

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add the cron** (merge into existing JSON):

```json
{ "crons": [ { "path": "/api/snapshots/capture", "schedule": "0 2 * * *" } ] }
```

- [ ] **Step 2: Commit.** (Vercel runs crons only on Production after deploy; it sends the `CRON_SECRET` bearer automatically when the env var is set.)

```bash
git add vercel.json
git commit -m "feat(kpi): schedule daily site health snapshot capture"
```

### Task 9: Wire the Trends card to snapshots

**Files:**
- Modify: `src/components/ComplianceDashboard.tsx` (Trends card body)

- [ ] **Step 1: Fetch** `site_health_snapshots` for `siteId`, ordered `captured_at` desc, limit ~56, in the existing `useEffect`. Store in state.
- [ ] **Step 2: Render** three recharts `LineChart` sparklines (health_score, outstanding_count, completion_pct) reversed to chronological order. If `< 2` rows, render the "Collecting data" placeholder from Part 1.
- [ ] **Step 3: Verify + commit** — `npx tsc --noEmit | grep ComplianceDashboard` (none), `npm test` (pass), runtime: card shows placeholder on an empty DB, sparklines once ≥2 snapshots exist.

```bash
git add src/components/ComplianceDashboard.tsx
git commit -m "feat(kpi): render real trend sparklines from site_health_snapshots"
```

### Task 10: Deploy + verify (gated)

- [ ] Apply the migration to prod (D2) with user confirmation.
- [ ] Set Vercel env vars (CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
- [ ] Deploy; manually trigger the capture route once to seed a first snapshot.
- [ ] Confirm the KPIs sub-tab renders end-to-end; trends show the placeholder until the second daily capture.

---

## Self-review notes
- **Spec coverage:** consolidate+actionable → Tasks 2,3,5 (drill-down via buildActionHref). New metrics → Tasks 1,3 (readiness, COC expiry, snag aging) + the 8-deliverable grid. Visual redesign → Task 3. Trends → Tasks 5–9. All four dimensions covered.
- **Type consistency:** `toSnapshotRow` row shape == migration columns == `SnapshotRow`. `SnapshotInput.readiness` uses `ReadinessResult` from siteHealth. `snagAging` consumes `SnagForAging`; the snag rows fetched in ComplianceDashboard must be kept (Task 3 Step 3), not just counted.
- **Open risk:** Task 7's per-site data loading duplicates `Dashboard.fetchTriageData` — consider extracting a shared `loadSiteDeliverablesInputs()` if it drifts; not required for first ship.
