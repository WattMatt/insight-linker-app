# Fortress Build — Preflight Review

**Date:** 2026-06-12 · **Status:** review artifacts (not applied) · **Owner:** Arno + Claude

Consolidated output of the plan/DB-time skills run against the roadmap and the migration:
**(1) Architecture ADRs**, **(2) Schema validation**, **(3) Migration hardening**, **(4) Pre-mortem**,
**(5) Security review**. Build-time skills (code-review, testing, deploy-checklist) run later, against code.

---

# 1 · Architecture Decision Records

> Format: context · decision · options · consequences. Statuses carry over from the roadmap;
> reversals are new dated entries, never edits in place.

## ADR-001 — Buildings modelled on existing `sites`
**Status:** Accepted · **Date:** 2026-06-12 · **Deciders:** Arno

**Context.** Fortress reporting is per-building. The app already has Client → Site → Subsection with RLS,
portals, inspections, COC and PDF wired to `sites`.

**Decision.** Extend `sites` with a building profile (13 columns) rather than introduce a `buildings` entity.

**Options.**

| Option | Complexity | Reuse | Risk |
|---|---|---|---|
| A. Extend `sites` (chosen) | Low | All RLS/portals/PDF | Low — reversible |
| B. New `buildings` table | High | Re-wire everything | High |
| C. 1-1 `site_profiles` extension table | Med | Full | Med — extra join |

**Consequences.** + Zero re-wiring; every child table FKs `site_id`. − `sites` widens; if multi-site-per-building
ever emerges, revisit toward Option C. Revisit trigger: a building that spans >1 site.

## ADR-002 — `building_assets` is the property-layer spine
**Status:** Accepted · **Date:** 2026-06-12

**Context.** The Annual report is fundamentally an asset register; PPM, OHS critical-equipment and
service-cost KPIs all derive from asset service data.

**Decision.** Build `building_assets` first (Sprint 1); `ppm_tasks` references it.

**Consequences.** + One source for asset/service KPIs. − Assets must be populated (import) before those
KPIs read true. Sequencing depends on the import framework (F2) landing alongside.

## ADR-003 — OHS compliance % is separate from electrical COC
**Status:** Accepted · **Date:** 2026-06-12

**Context.** The Site-Health redesign established COC ≠ operational health. OHS Act compliance is a broader,
weighted, whole-building measure.

**Decision.** `ohs_compliance_items` + a pure `buildingCompliance.ts` weighted rollup. COC stays the legal fact.

**Options.** A. Separate rollup (chosen). B. Fold OHS into COC status — rejected: conflates legal cert with
operational compliance, the exact bug Site-Health fixed.

**Consequences.** + Two clear numbers. − Weights need an owner (open item). Revisit if the client defines an
official OHS scoring formula.

## ADR-004 — Reuse the inspection engine for building condition
**Status:** Proposed (decide in Sprint 2) · **Date:** 2026-06-12

**Context.** Building condition (Good/Fair/Poor + action timeframe) resembles the existing inspection-item model.

**Decision (proposed).** Prefer adding `condition` + `action_timeframe` to `inspection_items` and seeding a
Building-Condition template, over a standalone table — *if* the inspection scaffold (template→subsection→item)
isn't too heavy for building-level capture. Fall back to the already-built `building_condition_items` table.

**Options.**

| Option | Reuse | Capture weight | Verdict |
|---|---|---|---|
| A. Extend `inspection_items` | High | Needs template/subsection scaffold | Prefer if scaffold acceptable |
| B. `building_condition_items` (built) | Low | Lightweight | Fallback, already migrated |

**Consequences.** Decision deferred to real `inspection_items` usage in Sprint 2-3. Either path feeds Group B
identically via the KPI module. **Action:** spike both in S2-3 before locking.

## ADR-005 — Commercial domains are import-only in v1
**Status:** Accepted (LOCKED 2026-06-12)

**Context.** Trading, density, COO, arrears, footfall, toilet fund originate in the centre manager's finance
systems (MDA/Nimbus/Broll), not WM's engineering work.

**Decision.** Capture via Excel import (CM Page 2); no native data-entry UI in v1. Tables exist
(`tenant_trading`, `tenant_movements`) for display/report.

**Consequences.** + WM doesn't own/verify data outside its mandate; engineering build stays unblocked.
− Commercial tiles depend on import freshness. Revisit if a finance-system API becomes available.

## ADR-006 — Rename the electrical `FORTRESS` template
**Status:** Accepted (do in Sprint 0) · **Date:** 2026-06-12

**Context.** `src/lib/fortressTemplate.ts` is WM's *electrical* scope-of-works. The new building pack also says
"Fortress" → two different "Fortress" things confuse every future dev.

**Decision.** Rename to `wmElectricalScope.ts` ("WM Electrical Scope") in S0-3, before any new UI references land.

**Consequences.** + Clear namespace: "Fortress" = the property pack. − One rename PR touching template refs;
do it early while the blast radius is small.

## ADR-007 — One pure KPI module per score; screen + PDF share it
**Status:** Accepted (LOCKED 2026-06-12)

**Context.** 38 KPIs on screen + 3 PDF report types is a textbook setup for screen/PDF divergence — the bug the
Site-Health redesign exists to kill.

**Decision.** `buildingCompliance.ts`, `ppm.ts`, `utilities.ts`, `reportKpis.ts` are the *only* calculators,
pure and unit-tested; dashboards and report generators import them. A parity test asserts equality.

**Consequences.** + Single source of truth, testable without a DB. − Discipline required: PR review must reject
any inline KPI math. Enforced by the code-review gate.

## ADR-008 — Excel-import-first capture
**Status:** Accepted (LOCKED 2026-06-12)

**Context.** Workbook layouts are stable templates; fastest path to populated data is to parse them.

**Decision.** Build server-side importers (SheetJS in an edge function) with versioned column-maps + a
validate/preview/commit flow. Native forms follow per table in V2.

**Options.** A. Import-first (chosen). B. Native-forms-first — rejected: slower to value, and the workbooks are
the authoritative source today. C. Both per table — rejected for v1: doubles per-sprint cost.

**Consequences.** + Fast population; idempotent re-runs. − Load-bearing assumption that layouts stay stable;
mitigated by versioned maps + preview validation (see Pre-mortem PM-1).

---

# 2 · Schema validation (data-schema-designer)

Checklist applied to `20260612200000_fortress_building_layer.sql`. The schema is broadly sound (UUID PKs,
`timestamptz`, `numeric` for money, RLS on every table, CHECK enums, `updated_at` triggers). Findings below by
priority.

## Must-fix before build

**SV-1 · PPM/service-due KPIs can't read text dates.** `building_assets.last_service` / `next_service_due` are
`text` ("12/2024", "As per SLA", "01/2027") — correct for raw import, but the "services due ≤30 days" and
"overdue" KPIs (ppm.ts) need a real date. → **Add a parsed `next_service_date date` (nullable)** to
`building_assets`, populated by the importer where the text parses; the KPI reads the date column, the text stays
as the human-entered evidence. (`ppm_tasks.scheduled_month` is already `date` ✓.)

**SV-2 · Two FKs are unindexed.** `ppm_tasks.asset_id` and `tenant_trading.tenant_id` have no index (Postgres
doesn't auto-index FKs). → add `idx_ppm_tasks_asset`, `idx_trading_tenant`. (All `site_id` FKs are indexed ✓.)

## Should-fix

**SV-3 · RLS uses bare `auth.uid()` per row.** Policies call `public.has_role(auth.uid(), …)` — `has_role` is
`STABLE SECURITY DEFINER` so it's cheap, but wrap as `(select auth.uid())` so the planner evaluates once per query
on large tables. (Cosmetic on small tables; matters on `building_condition_items`/`tenant_shop_specs`.)

**SV-4 · No `created_by`/`updated_by` except `building_assets`.** For audit of who imported/edited, add
`created_by uuid REFERENCES auth.users(id)` to the captured tables (not the import-only commercial ones).

**SV-5 · Soft-delete strategy unstated.** Import-replace tables (utilities, trading, incidents, masterfile,
recoveries) → hard delete on re-import is fine. Editable registers (`building_assets`, `tenants`) → add
`deleted_at timestamptz` so a removed asset/tenant is recoverable and history survives. Decide per table.

**SV-6 · Period indexes for trend queries.** `tenant_trading` and `expense_recoveries` are queried by `period`
for trends → add `idx_trading_period`, `idx_recoveries_period`.

## Acceptable as-is (documented, not changed)

- `amps_actual`/`amps_lease`, `install_date`, finishes = `text` — deliberately messy Excel passthrough; the
  over-draw KPI parses leading digits at read time. Fine for v1.
- `tenant_trading` storing both `tenant_id` and `tenant_name` — intentional denormalization (import rows may not
  resolve to a tenant). Documented.
- `CREATE INDEX` (non-CONCURRENTLY) — safe here: all tables are new/empty at create; the only populated-table op
  is `ALTER TABLE sites ADD COLUMN … DEFAULT NULL`, which is instant in PG 11+.

**Net:** 2 must-fix (SV-1 date column, SV-2 indexes) folded into a follow-up migration; the rest are
should/optional. None require a rewrite.

---

# 3 · Migration hardening (data-migration-script)

Produced a reversible, idempotent follow-up migration (both files PG-parser-validated):

- `supabase/migrations/20260612210000_fortress_layer_hardening.sql` (up · 17 statements valid)
- `supabase/migrations/20260612210000_fortress_layer_hardening.down.sql` (down · 14 statements valid)

**Classification:** schema-only DDL · risk **LOW** · 0 rows affected (tables empty at this point) · no downtime.

**What it does:** SV-1 `building_assets.next_service_date date` + index · SV-2/SV-6 `idx_ppm_tasks_asset`,
`idx_trading_tenant`, `idx_trading_period`, `idx_recoveries_period` · SV-5 `deleted_at` + partial live-row indexes
on `building_assets`/`tenants` · SV-4 `created_by` on the nine captured tables (not the import-only commercial ones).

**Safety properties:**
- **Pre-audit guard** — raises and aborts if the base migration (`…200000`) hasn't run.
- **Idempotent** — every statement uses `IF NOT EXISTS` / `IF EXISTS`.
- **Reversible** — paired `.down.sql` drops exactly what the up added.
- **Lock-safe** — `ADD COLUMN … NULL` is instant; plain `CREATE INDEX` is fine on empty tables, **with an
  explicit note** to switch to `CREATE INDEX CONCURRENTLY` (and drop the txn wrapper) if ever applied to a
  populated Fortress dataset.
- **Verify block** — asserts `next_service_date` exists before `COMMIT`.

**Pre-migration checklist (for whoever applies it):** Supabase PITR active · run S0-1 live-schema audit first ·
apply base `…200000` then `…210000` · regenerate TS types (`supabase gen types`) · re-check RLS covers new columns.

---

# 4 · Pre-mortem (pre-mortem-analyst)

**Frame:** It is ~Dec 2026. The Fortress pack shipped late, or shipped but isn't used — reports still get built by
hand in Excel. Looking back, here's what went wrong.

## Failure-mode taxonomy (14 modes)

| # | Category | Failure mode | Root cause (5-whys) | P | Impact | Early-warning signal |
|---|---|---|---|---|---|---|
| 1 | Assumption | Workbook layouts drift; importers silently break | Centre managers edit templates ad-hoc; import maps hard-coded | **H** | H | Import preview shows unmapped columns / arity errors rising |
| 2 | Execution | Scope sprawl — full pack never fully lands | 17 domains, solo dev, no hard MVP cut enforced | **H** | H | Sprint slip; >1 sprint with carry-over |
| 3 | Execution | Screen↔PDF KPI drift returns | A KPI computed inline in a card or report instead of the pure module | M | H | Parity test red, or a card value ≠ PDF value |
| 4 | Security | Tenant data leaks across buildings (G-SEC-13) | RLS left at blanket `authenticated` read | M | **H** | Portal/contractor user sees another building's tenants |
| 5 | Assumption | OHS % distrusted — weights are guessed | No owner for the section weights; 85/10/5 was illustrative | M | M | CM disputes the dashboard number vs their report |
| 6 | Execution | Dependency stall — Site-Health redesign not merged | P0 dependency treated as optional | M | M | S0-2 still open at Sprint 1 start |
| 7 | Resource | Solo-dev key-person risk; build stalls on absence | One engineer holds all context | M | M | No second reviewer on PRs; bus-factor 1 |
| 8 | Execution | Tenant double-source: `subsections.tenant_name` vs `tenants` diverge | Backfill done once, not kept in sync | M | M | Tenant counts differ between modules |
| 9 | Org | Users keep using Excel; app ignored | Reports don't match the familiar format exactly | M | **H** | Low dashboard usage; reports still emailed as .xlsx |
| 10 | Execution | Condition modelling thrash (D4 flip-flops) | Decision deferred then reopened mid-build | L | M | Rework PRs touching condition fields |
| 11 | Assumption | Import-first never gives way to native entry | V2 forms perpetually deferred; stale imported data | M | M | Data age on tiles grows; manual re-imports lapse |
| 12 | External | Load-shedding / offline gaps during field capture | New tables lack offline parity (deferred to S5) | L | M | Field users report lost asset/condition entries |
| 13 | Execution | PDF report parity underestimated (3 report types) | Report generators treated as a thin task | M | H | S4-3 balloons; reports look unlike the originals |
| 14 | Org | Stakeholder/scope confusion from the “Fortress” name clash | Electrical template never renamed | L | L | Devs/users confuse the two “Fortress” things |

## Top 5 (probability × impact)

**#1 · Importers break on template drift — CRITICAL (P:H I:H).** Root cause: hard-coded column indices.
*Prevention:* versioned column-map per sheet + preview/validate/reject-on-mismatch (F2 already specifies this — make
it non-negotiable, not a nice-to-have). *Cost:* ~2–3 extra days in S1.

**#2 · Scope sprawl, never fully lands — CRITICAL (P:H I:H).** Root cause: no enforced MVP cut for a 17-domain pack.
*Prevention:* ship per-domain behind a feature flag; Sprint 1 (asset register + dashboard read) must be independently
useful; commercial stays import-only (D5). Stage-gate at each sprint: domain works end-to-end or it's cut to V2.

**#3 · Tenant data leaks across buildings — HIGH (P:M I:H).** Root cause: blanket RLS.
*Prevention:* S0-5 membership-scoped RLS + `/security-review` gate before apply (see §5). *Cost:* ~3 days.

**#4 · Users keep using Excel — HIGH (P:M I:H).** Root cause: generated reports don't match the familiar format, so
adoption fails. *Prevention:* build the PDF generators to mirror the actual OPS/CM/Annual layouts (use the real
workbooks as the visual spec); pilot with one building (Abaqulusi) and one CM before rolling out. *Cost:* design time
in S4.

**#5 · Screen↔PDF KPI drift — HIGH (P:M I:H).** Root cause: inline KPI math. *Prevention:* ADR-007 single pure
modules + parity test in CI (S4-4); code-review rejects inline calc. *Cost:* low (discipline).

## Pre-mortem action list

| Action | Addresses | Owner | When |
|---|---|---|---|
| Make versioned column-map + preview/validate a hard gate of F2 | #1 | Dev | S1 |
| Feature-flag each domain; per-sprint stage-gate “works E2E or cut” | #2 | Dev/Arno | every sprint |
| Membership-scoped RLS + `/security-review` before apply | #3 | Dev | S0 |
| Build PDF generators to match real report layouts; pilot 1 building+CM | #4 | Dev/Arno | S4 |
| Parity test in CI; PR rule: no inline KPI math | #3/#5 | Dev | S4 |
| Confirm Site-Health redesign merged before S1 | #6 | Arno | S0 |
| Name an OHS-weights owner; treat 85/10/5 as placeholder until confirmed | #5 | Arno | S2 |
| Keep `tenant_name`↔`tenants` in sync (trigger or single read path) | #8 | Dev | S3 |

## Assumptions to validate before committing
| Assumption | Validation | When |
|---|---|---|
| Workbook layouts are stable enough to map once | Diff 2–3 months of each report; lock column-maps to observed variance | before S1 |
| OHS 85/10/5 is the real scoring formula | Confirm with the client/CM | S2 |
| Reusing inspection_items for condition is acceptable | Spike against real inspection usage | S2-3 |

## What the plan does well (balanced)
Reuse-first (inspection/snag/COC/siteHealth/PDF) keeps net-new surface small; the single-KPI-module pattern is a
proven fix for the exact drift risk; value-first sequencing means Sprint 1 is independently useful; the schema is
already built, validated and seeded with real data, so the riskiest "does the model hold real data" question is
already answered.

---

# 5 · Security review (manual — `/security-review` tool needs a git cwd, unavailable here)

Reviewed the RLS posture of `…200000_fortress_building_layer.sql` against the app's portal model.

## Findings

**SEC-1 · CRITICAL — cross-tenant read (G-SEC-13).** Every Fortress table shipped with
`"auth_read_*" … USING (true)`. Client- and Contractor-role portal users authenticate, so they could read **every
building's** assets, tenants, trading, incidents and masterfile — not just their own. The existing `sites` table
is already scoped (clients via `get_user_client_id()`, contractors via `user_sites`); the new tables broke that
boundary. → **Fixed** by `20260612220000_fortress_rls_scope.sql`: blanket SELECT replaced with a membership-scoped
policy mirroring `sites` (Admin/User full; Contractor→`user_sites`; Client→their client's sites). Writes stay
Admin/User. Both up/down PG-parser-validated.

**SEC-2 · MEDIUM — per-row `auth.uid()` in policies.** Base policies call `has_role(auth.uid(), …)` (evaluated per
row). The new scoped policy uses `(select auth.uid())` so it's evaluated once per query. Recommend back-porting the
wrapper to the base `manage_*` policies too.

**SEC-3 · LOW — import edge function will use the service role (RLS bypass).** The workbook importer (F2/S1-1)
must run as `service_role` to upsert across tables. *Mitigation:* validate `site_id` ownership in the function
before writing; never accept a client-supplied `site_id` without checking the caller's membership. Document this
as a service-role operation.

**SEC-4 · LOW — `meta jsonb` on `building_assets` is free-form.** No injection risk (parameterised), but avoid
storing secrets/PII there; it's covered by the same RLS as the row.

## Verdict
With `20260612220000_fortress_rls_scope.sql` applied, the critical cross-tenant exposure is closed and the Fortress
tables match the app's established portal boundary. **Gate:** apply this RLS migration in the **same release** as
the base + hardening migrations — never ship the tables with blanket read. When the automated `/security-review`
can run in-repo (git cwd), re-run it on the actual diff before merge.

---

## Preflight summary

| Skill | Output | Artifact |
|---|---|---|
| engineering:architecture | 8 ADRs (D1–D8) | §1 here |
| data-schema-designer | 6 findings (2 must-fix) | §2 here |
| data-migration-script | hardening up/down (PG-valid) | `…210000_fortress_layer_hardening.sql(.down)` |
| pre-mortem-analyst | 14 failure modes, top-5, actions | §4 here |
| security-review (manual) | SEC-1 critical fixed | `…220000_fortress_rls_scope.sql(.down)` §5 here |

**Build-time skills not yet run (need code):** api-endpoint-generator, frontend-design, engineering:code-review,
refactor-readability, engineering:testing-strategy, unit-test-writer, codebase-audit-cleanup,
engineering:deploy-checklist. These run during/after the sprints, against real diffs.

