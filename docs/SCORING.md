# Site Scoring — the one process

_Last updated: 2026-07-08._

## The canonical number

A site's **health score** is computed by exactly one canonical entry point, [`src/lib/siteHealth.ts`](../src/lib/siteHealth.ts):

```
computeSiteHealth(subsections, snags, inspections)  →  { score, factors }
```

(0 for an empty site, see convention 1; internally `siteHealthScore(factorScores(...))`).

Weighted factors (defaults): **snags 40%** (resolved / total snags), **inspections 35%**
(photo-populated / inspection-required subsections), **metering 25%** (metered / total
subsections). COC certification is tracked separately (`complianceCalculations.ts`) and is
NOT part of this score.

### Conventions every scoring surface must follow

1. **An unpopulated SITE scores 0%.** The health score measures progress toward a
   fully captured, compliant site — a site with zero subsections is zero progress by
   definition (product decision, 2026-07-08). It must NEVER display 100%: empty
   denominators once scored vacuously-100, making 40 of 76 production sites read as
   perfect with nothing captured. `factorScores()` returns all-zero factors for an
   empty site and snapshots store `health_score = 0`, so every surface shows 0% (red
   band) until the site is populated.
2. **Inside a populated site, an empty factor scope is vacuously 100.** No snags → 100.
   No inspection-required subsections → 100. No COC-required subsections → 100% COC
   compliance (`cocComplianceRate()` in `complianceCalculations.ts` is the shared
   helper). "Nothing wrong" is legitimately a perfect factor; never render 0 for
   "nothing to do".
3. **Full rows in, score out.** `factorScores` needs `is_inspection_required` (waivers)
   and inspections' `json_data` (photo detection). Projecting those fields away silently
   zeroes the inspection factor — pass the fetched rows through unmodified.
4. **Snag openness** is decided only by `isSnagOpen()` / `isSnagResolved()`
   (case-insensitive; `rectified`/`closed` are terminal). No inline status lists.
5. **Reports never invent a health number.** `calculateMetrics()` requires
   `overallHealth` as an input (0 for an empty site); the caller must pass the
   canonical `computeSiteHealth()` result. There is deliberately no fallback formula.

## Where scores come from at runtime

| Surface | Source |
| --- | --- |
| Admin site dashboard (`ComplianceDashboard`) | live compute from fetched rows |
| Site summary report (preview + PDF) | live compute, passed into `calculateMetrics` |
| Nightly trend snapshots | `/api/snapshots/capture` cron (2AM UTC) → `site_health_snapshots` |
| Client portal (sites list, dashboard cards, site detail header) | `useSiteScores` hook |
| Admin sites grid (`Sites.tsx`) and client detail site cards (`ClientDetail.tsx`) | `useSiteScores` hook |

`useSiteScores` ([`src/hooks/useSiteScores.ts`](../src/hooks/useSiteScores.ts)) is
snapshot-first with a live fallback, both canonical (see
[`src/lib/siteScores.ts`](../src/lib/siteScores.ts)):

1. Latest `site_health_snapshots` row per site within a 30-day window — the capture job
   computed it with `siteHealth.ts`, so it IS the canonical score, at most 24h stale.
   The badge tooltip shows the capture date.
2. Sites with no usable snapshot (e.g. created after the last capture) are computed live
   in the browser through the same functions, and labelled "computed just now".
3. Sites with neither render a "—" pending badge — never a fabricated number.

Rendering goes through one component,
[`SiteHealthBadge`](../src/components/SiteHealthBadge.tsx), banded by
`getHealthBand` (≥80 green, ≥50 amber, else red — same palette as the PDF reports).

## Security model

`site_health_snapshots` is written only by the service-role capture job. Reads
(migration `20260708090000_site_health_snapshots_scoping.sql`):

- **Staff** (`Admin` / `User` / `Moderator`): all rows (affirmative allowlist — NOT-based
  policies would include role-less users).
- **Clients**: only rows whose `site_id` belongs to their client
  (`get_user_client_id()`), same shape as the sites/subsections/snags policies.
- **Contractors / anon**: no access; no contractor or public surface consumes snapshots.

The live-fallback queries (subsections / snags / inspections) ride the existing
client-scoped RLS policies from migration `20251017054255`. Public share-link surfaces
(`get_public_portfolio`) intentionally do NOT expose health scores.

## Guardrails

- `src/lib/siteHealth.test.ts` — factor/weight/band semantics.
- `src/lib/siteScores.test.ts` — snapshot-vs-live equivalence, grouping, pending states.
- `src/lib/siteSummaryRenderSpec.test.ts` — cross-library COC consistency (report and
  dashboard literally share `cocComplianceRate`, and the tests fail if they ever drift).
- `src/components/SiteHealthBadge.test.tsx` — banding + pending rendering.

When adding a new scoring surface: fetch full rows, call the `siteHealth.ts` /
`siteScores.ts` functions (or `useSiteScores`), render with `SiteHealthBadge`, and add
the surface to the table above.
