# Fortress Building Layer — Abaqulusi Plaza ingest (for review)

**Date:** 2026-06-12 · **Status:** built & validated locally — **NOT applied to live DB**

This package adds the property/facilities-management data layer behind the Fortress report
pack and loads Abaqulusi Plaza into it as the first building, for review.

## Files

| File | What it is |
|---|---|
| `supabase/migrations/20260612200000_fortress_building_layer.sql` | Schema migration — 12 new tables + 13 building-profile columns on `sites`, RLS, triggers, indexes |
| `supabase/seeds/fortress_abaqulusi_seed.sql` | Seed — 463 rows of **real** Abaqulusi data parsed from the 3 workbooks |
| `docs/sessions/abaqulusi_review.db` | SQLite mirror, populated — open it to query the data directly |
| `docs/sessions/fortress-dashboard-2026-06-12-plan.html` | The gap analysis, dashboard design, KPI catalogue & build plan |

## What was loaded (row counts)

| Table | Rows | Table | Rows |
|---|---|---|---|
| sites (Abaqulusi) | 1 | tenants | 69 |
| building_assets | 45 | tenant_shop_specs | 58 |
| ohs_compliance_items | 57 | tenant_trading | 11 |
| building_condition_items | 138 | tenant_movements | 3 |
| utilities_readings | 1 | security_incidents | 6 |
| ppm_tasks | 25 | masterfile_index | 42 |
| expense_recoveries | 6 | clients | 1 |
| **Total** | | | **463** |

## Verification — what was actually run

- **DID** — both SQL files validated against the real PostgreSQL grammar (`pglast` / libpg_query):
  migration = 47 statements valid, seed = 16 statements valid.
- **DID** — seed arity-checked: every row's value count matches its column list (0 mismatches across 463 rows).
- **DID** — all 463 rows loaded into a SQLite mirror with the same shape; KPI queries return sensible values:
  solar yield 90.7%, 7 condition items needing action, 145 incidents (Jul–Dec), 42/42 masterfile docs on file,
  4 anchors joined to shop specs, 2 tenants missing evac plans.
- **NOT done** — the migration was **not executed against a live Postgres/Supabase** (no Postgres in the build
  sandbox). libpg_query confirms syntax; it does not prove it runs against the live schema.

## To apply (after review)

1. **Pre-audit** the live `sites`, `subsections`, `snags`, `document_categories` schemas — the system-reference
   docs are partly stale post-Vite migration. Confirm `public.has_role`, `app_role`, `update_updated_at_column` exist.
2. Run the migration (`supabase db push` / your migration runner).
3. The seed uses fixed UUIDs + `ON CONFLICT (id) DO NOTHING` — safe to re-run. **Note:** it inserts a `clients`
   row for "Fortress / Capital Propfund"; if that client already exists, point `sites.client_id` at the existing id
   instead before loading.

## Assumptions & caveats

- **ASSUME** buildings = existing `sites`; one building = one site.
- **ASSUME** the OHS Yes/No/N-A and condition Y/N marks read from the workbooks are correct; a few sheets had
  merged-cell / offset layouts — values were parsed defensively and rounded. Spot-check against the source workbook
  before treating as authoritative.
- `building_condition_items` is a dedicated table here; in production it may instead fold into `inspection_items`
  with new `condition` + `action_timeframe` fields (Decision D4, still open).
- Commercial tables (`tenant_trading`, `tenant_movements`) are import-only in v1 (Decision D5).

## Recommend

Confirm scope (full pack vs engineering slice) and capture-vs-import, then apply P0/P1 from the plan
(audit + asset register). The naming clash with the existing electrical `fortressTemplate.ts` should be resolved
(Decision D6) before building UI.
