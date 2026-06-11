# Site Health & Marking Redesign — Design Spec

**Date:** 2026-06-11 · **Status:** approved-pending-review · **Owner:** Arno + Claude

## 1. Problem

The app has **no single definition of "compliant."** Five different calculations disagree, so the
same site shows different numbers on the site overview, the compliance dashboard, the DB flag, and
the PDF report:

1. DB trigger `sync_coc_compliance_status` → `subsections.is_compliant` (COC only).
2. Site Health card (`SiteDetail.tsx:493`) — COC + metering + non-rectified snags.
3. `ComplianceDashboard.calculateOverallScore` — COC + metering + open inspection items.
4. `calculateCocComplianceStats` (`lib/complianceCalculations.ts:125`) — COC only, denominator = COC-required.
5. `useUnifiedSiteData.calculateKPIs` (`:248`) — only `coc_status === 'Pass'` counts.

They also use inconsistent valid-status word-lists and rounding (`Math.round` vs `Math.floor`,
integer vs 1-decimal).

**Plus a live correctness bug:** the Open Snags and Snag Resolution cards filter on a `'rectified'`
status, but `snags.status` is constrained to `('Open','Closed')`. If prod snags are `Open`/`Closed`,
"Open Snags" counts closed ones and "Snag Resolution" is stuck at 0%.

## 2. Goals / non-goals

**Goals** (all four confirmed with the user):
- **Correctness/consistency** — one source of truth used by overview, dashboard, and PDF.
- **Redefined marking rules** — see §3.
- **Redesigned cards** — hybrid score + readiness layout (§5, mockups produced 2026-06-11).
- **Revised KPI set** — §5.

**Non-goals:** the COC validation engine itself (`validate-coc`) is unchanged. We only stop COC from
feeding the operational health number. The tenant-isolation/RLS work (GAPS G-SEC-13) is separate.

## 3. The model (decisions locked 2026-06-11)

Two distinct concepts, no longer conflated:

- **COC compliance** = the legal certification fact (unchanged engine). Shown as its **own informational
  card**, NOT part of Site Health. The DB `subsections.is_compliant` flag keeps its current COC meaning
  and should be read as "COC certified," never as "site health."
- **Site Health** = a new operational 0–100 score, built from **metering + snags + inspections only**.

### 3.1 Site-level factor scores (each 0–100)
Computed from site-wide aggregates across the site's subsections:

| Factor | Formula | Notes |
|--------|---------|-------|
| Metering % | `metered_subsections / total_subsections × 100` | metered = `metering_status = 'Installed'` OR `meter_serial_number` present |
| Snag resolution % | `(rectified + closed snags) / total_snags × 100` | **0 snags ⇒ 100** (no defects = perfect) |
| Inspection % | `subsections_with_completed_inspection / total_subsections × 100` | "completed" = an inspection exists with `status ∈ {Complete, Completed, Closed, Done}` |

All `Math.round()`, integers. `total_subsections = 0 ⇒ all factors = 100` (vacuous).

### 3.2 Site Health composite (the hero number)
```
SiteHealth = round( 0.40 × SnagResolution% + 0.35 × Inspection% + 0.25 × Metering% )
```
Safety-weighted (snags + inspections dominate; metering is operational). Weights live in one named
constant so they're tunable in one place.

### 3.3 Readiness gate (the supporting breakdown)
A subsection is **ready** when ALL hold:
1. Metered (metering installed), AND
2. **No open snag of risk `Critical` or `High`** (minor/medium open snags lower the score but don't block), AND
3. Has a completed inspection.

Site readiness = `count(ready) / total_subsections`, shown as "X of Y ready" plus the count failing
each gate. "Open" snag = `status = 'Open'` (not Rectified/Closed).

### 3.4 Bands (consistent everywhere)
`≥ 80 green (success) · ≥ 50 amber (warning) · < 50 red (danger)` — one `getHealthBand()` helper.

## 4. Architecture — single source of truth

One module owns the math; everything else calls it.

- **`src/lib/siteHealth.ts`** (new) — pure functions, no I/O:
  - `factorScores(subsections, snags, inspections) → { metering, snags, inspections }`
  - `siteHealthScore(factors, weights = DEFAULT_WEIGHTS) → number`
  - `readiness(subsections, snags, inspections) → { ready, total, failing: {metering, snags, inspection} }`
  - `getHealthBand(score) → 'success' | 'warning' | 'danger'`
  - `DEFAULT_WEIGHTS = { snags: 0.40, inspections: 0.35, metering: 0.25 }`
  - Pure → unit-testable without a DB (seeds the project's first tests; ref GAPS G-TEST-04/05).
- **COC stays in `complianceCalculations.ts`** — `calculateCocComplianceStats` is reused ONLY for the
  COC informational card. It is removed from the Site Health path.
- **Replace** the divergent calculators: `SiteDetail.tsx` inline compliantCount, `ComplianceDashboard.calculateOverallScore`/`calculateCategoryScores`, `useUnifiedSiteData.calculateKPIs` → all call `siteHealth.ts`. Delete the dead/duplicated logic they leave behind.
- **PDF parity:** `complianceReportGenerator` / the PDF data hooks consume the same `siteHealth.ts`
  outputs so the report matches the screen. (Server-side PDF edge fns that recompute independently are
  out of scope — they're being retired; ref Phase-2 cleanup.)

## 5. The overview card set (final layout)

Hero row (two cards): **Site Health** (score + 3 factor mini-stats + band bar) and **Readiness**
(X of Y ready + the three failing-gate counts). Supporting row: **COC** (validated/required,
informational), **Subsections** (total + metered), **Open snags** (Open count + critical + resolved),
**Inspections** (completed/total + pending). Dropped from the current 8: Documents and Floor Plan
Items move off the headline (still reachable on their tabs); Snag Resolution and Site Health merge
into the hero. Thresholds via `getHealthBand`.

## 6. Data model changes

- **`snags.status` lifecycle → `Open → Rectified → Closed`.** Migration:
  1. **Pre-audit** the live distinct `status` values (needs DB access — Arno or a read query) before altering.
  2. `ALTER TABLE snags DROP CONSTRAINT` old check; map any legacy values (`'rectified'`→`'Rectified'`, etc.); add `CHECK (status IN ('Open','Rectified','Closed'))`.
  3. Backfill: rows with `rectified_at` set but `status='Closed'`/legacy → set to `Rectified` or `Closed` per the audit.
- Optional (nice-to-have): a `site_health(site_id)` SQL function/view so RPCs and any server reporting
  share the exact math. Decide during planning — the lib is the primary SoT; the SQL mirror is a
  consistency convenience, not required for v1.

## 7. Error handling / edge cases
- Division-by-zero: 0 subsections ⇒ factors = 100, readiness = 0/0 shown as "—"; 0 snags ⇒ snag factor = 100.
- Null `metering_status` ⇒ fall back to `meter_serial_number` presence.
- Snag with null/unknown `risk_level` ⇒ treated as non-blocking for the gate (counts toward score only).
- Inspection with null status ⇒ not "completed."
- All displayed numbers rounded (`Math.round`); percentages integer.

## 8. Testing
- Unit tests for `siteHealth.ts` (pure): factor formulas, weight blend, band cutoffs (79/80/49/50
  boundaries), and every edge case in §7. First tests in the repo.
- Migration verification: assert post-migration `snags.status` ∈ allowed set; row counts preserved;
  spot-check a Rectified and a Closed snag.
- Visual check: overview hero matches `siteHealth.ts` for a known fixture site.

## 9. Open items for planning
- Exact "inspection completed" status set — confirm `{Complete, Completed, Closed, Done}` against real data.
- The snag-status pre-audit (needs a DB read) gates the migration.
- Whether to add the `site_health()` SQL mirror in v1 or defer.
