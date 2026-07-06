# Compliance Tab Review + Dashboard Split-View — Design

**Date:** 2026-06-16
**Status:** Approved, implementing
**Scope:** Frontend-only. No DB migrations, no edge-function deploys.

## Background

A battle-test of the site-level **Compliance tab** (`src/views/SiteDetail.tsx` → `ComplianceDashboard.tsx` + `SiteCocHierarchy.tsx`) found that it shows up to three differently-computed "compliance" numbers that can openly disagree, has a snag-undercount bug, and a per-subsection COC list that is redundant with the COC scorecard and the Subsections/Documents tabs — and can contradict them (it reads `subsection_documents.coc_status` per file, while the scorecard reads the canonical `subsection.coc_status`).

Separately, the main **Dashboard** (`src/views/Dashboard.tsx`) is one long scroll mixing vanity KPIs with actionable outstanding-work widgets.

## Three threads

### Thread A — Drop the COC list
- Remove `<SiteCocHierarchy>` render + import + the inline `subsections.map(...)` props in `SiteDetail.tsx`.
- Delete `src/components/coc/SiteCocHierarchy.tsx`.
- **Verify before deleting the lib:** grep usages of `src/lib/cocHierarchy.ts` (`toCocDoc`/`groupCocDocuments`/`cocDocFails`). If only `SiteCocHierarchy` used it → delete the lib too. If a report or other view uses it → keep the lib, remove only the tab component.
- Result: the Compliance tab keeps the aggregate COC scorecard (canonical `subsection.coc_status`); per-certificate detail remains owned by the Subsections + Documents tabs.

### Thread B — Fix correctness bugs (`ComplianceDashboard.tsx`)
- **H1:** Closed-snag bucket drops lowercase `'rectified'` (line ~166) → undercounts resolved snags in pie, summary, and resolution-rate denominator. Reuse a shared snag-status normalizer if one exists (e.g. `subsectionStatus.ts`); otherwise add `'rectified'` to the filter.
- **H2:** "Metering Status" denominator is `is_coc_required` subsections (line ~113). Change denominator to **all subsections**, consistent with `siteHealth.ts`'s metering factor.
- **H3:** "X of Y subsections compliant" (line ~278) uses COC-gated `is_compliant` inside the "Overall Site Health (COC tracked separately)" card → contradiction. **Remove that line.** COC compliance is already shown in its own scorecard.
- **M4:** "Snag Resolution" category card actually measures inspection items passed (lines ~121-140), not snags. **Relabel** to "Inspection Pass Rate" and swap the AlertTriangle icon. No logic change.
- **L4:** Fetch errors are swallowed → renders green "No snags recorded" (false all-clear). Add an `error` state; on failure show "Couldn't load snag data" instead of the green checkmark.
- **Out of scope (design calls, not correctness bugs):** the double snag-fetch (M1) and whether floor-plan pins belong in the health score (M2).

### Thread C — Dashboard split-view (KPI-first, MVP)
Wrap `Dashboard.tsx` content in shadcn `Tabs` (same pattern as `SiteDetail`), default **KPIs**:
- **Tab "KPIs" (default):** Primary KPI grid (Sites / Subsections / Clients) + Secondary KPI grid (COC Compliance / Open Snags / Snag Resolution) + the Upcoming Schedule / Recent Activity / Recent Assignments widgets.
- **Tab "Outstanding Items":** `SitesNeedingAttention` + High-Risk Snags Tracker.
- Persist active tab to URL via `searchParams` (matches `SiteDetail`).
- Count badge on the Outstanding trigger (number of sites needing attention) so urgency surfaces even though KPIs is the default landing.
- Pure layout move — no new queries, no new components. Activity widgets stay on the KPIs tab (two-tab MVP, not a third "Activity" tab).

## Verification
`tsc` clean → full `vitest` suite passes (no regressions) → runtime: Compliance tab (COC list gone, numbers reconcile, Metering denominator sane); Dashboard (lands on KPIs, Outstanding tab shows the two widgets, badge count correct).

## Sequence
A (drop COC) → B (bug fixes) → C (split-view), each verified before the next.

## Revision — 2026-06-16 (same day, after first ship `28e29ad`)
User clarified the split-view belonged on the **per-site** dashboard, not the main app home page. Course-correction:
- **Reverted** the `Dashboard.tsx` (home `/`) KPI/Outstanding split back to its original single-scroll layout (`git checkout 5b46e54 -- src/views/Dashboard.tsx`).
- **Consolidated at the site level instead:** the SiteDetail **"Dashboard" (overview)** tab now hosts inner sub-tabs — **KPIs** (`ComplianceDashboard`, default landing) and **Checklist** (`SiteComplianceChecklist`). The top-level **Compliance** tab is removed; stale `?tab=compliance` URLs redirect to `overview`. `ComplianceDashboard` + its bug fixes (Thread B) are unchanged — just relocated.

## KPI Full Upgrade — design (2026-06-16, approved via mockup)
Target: the site Dashboard → **KPIs** sub-tab (`ComplianceDashboard`). Scope = all four user-chosen dimensions, **built in one go** (frontend + trends backend together).

**Core principle:** rebuild the KPIs on `computeSiteDeliverables()` (+ `siteHealth.readiness()`) so the KPIs and the Checklist sub-tab share ONE source of truth (kills the current parallel ad-hoc stats).

**Sections (per approved mockup):**
1. **Readiness hero** ← `siteHealth.readiness()`: ready/total subsections + failing breakdown (metering/snags/inspection). Honest replacement for the deleted "X of Y compliant" line.
2. **Handover completion hero + 8-deliverable grid** ← `computeSiteDeliverables()`: `completionPct`, `blockingCount`, `outstandingCount`, per-deliverable `done/total/status/blocking`. Covers all 8 deliverables, not today's 4.
3. **Snag risk & aging** ← snags (`risk_level`, `created_at`, `rectified_at`): open/in-progress/closed (reuse `snagStatusBucket`) + critical-open + oldest-open age.
4. **COC expiry** ← `subsection.coc_expiry_date` bucketed ≤30 / ≤90 / expired.
5. **Trends (last 8 weeks)** ← NEW `site_health_snapshots` table (health score, outstanding, completion). Empty until data accrues; "collecting data" state when <2 points.

**Drill-down:** every card click-throughs via `OutstandingItem.subsectionId` + the existing `buildActionHref` deep-links (or switches to the Checklist sub-tab scoped to that category). 

**Data threading:** pass the already-computed `deliverablesSummary` from `SiteDetail` into `ComplianceDashboard` as a prop; add `coc_expiry_date` to the subsections prop; compute readiness from the `healthSnags`/`healthInspections` it already fetches.

**Trends backend (proposed default — confirm at plan review):** Vercel cron → Next API route that reuses `computeSiteDeliverables` and upserts one `site_health_snapshots` row per site per day. RLS: authenticated read, service-role write. No backfill (trends start at first capture).
- **GATE:** the prod migration for `site_health_snapshots` must be reviewed before push — see [[prod-migration-drift]] (prod schema is ahead of `schema_migrations`; reconcile first; API-applied SQL).

**Verification:** new pure helpers (COC-expiry bucketing, snag-aging, snapshot mapping) unit-tested; tsc touched-files clean + full vitest; runtime check of the KPIs sub-tab; capture route tested locally before the cron is wired.
