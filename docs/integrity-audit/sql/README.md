# Stage 4b SQL — execution order

> Strategy: [`2026-05-27-remediation-strategy.md`](../2026-05-27-remediation-strategy.md)

| # | File | What it does | Side-effects | Reversible? |
|---|---|---|---|---|
| 1 | [`01-create-proposal-table.sql`](./01-create-proposal-table.sql) | Creates `integrity` schema, `inspection_remediation_proposals` table, indexes, and `apply_remediation_proposal` / `revert_remediation_proposal` / `apply_approved_at_or_above` functions. | New schema + table + 3 functions. No data mutated. | `DROP SCHEMA integrity CASCADE;` (only if you want to start over). |
| 2 | [`02-discovery-fuzzy-match.sql`](./02-discovery-fuzzy-match.sql) | Populates proposals for orphans that have recoverable shop info (60 expected) at confidence bands 60–100. | Inserts rows into `integrity.inspection_remediation_proposals`. No `inspections` rows touched. | `DELETE FROM integrity.inspection_remediation_proposals WHERE source = 'fuzzy_match';` |
| 3 | [`03-park-dark-orphans.sql`](./03-park-dark-orphans.sql) | Files one `needs_decision` proposal per dark orphan (173 expected). Triages each as `inspector_outreach` (recent Completed at top-4 sites) or `archive_candidate`. | Inserts rows into `integrity.inspection_remediation_proposals`. No `inspections` rows touched. | `DELETE FROM integrity.inspection_remediation_proposals WHERE source = 'needs_decision';` |

## How to run

Open the Supabase SQL Editor for project `oltzgidkjxwsukvkomof` (WM Compliance, production). Run each file in order. Each is idempotent — safe to re-run.

After running all three, the discovery reports at the bottom of files 2 and 3 give you:

- Confidence histogram for the fuzzy-match candidates (use this to decide where to set the auto-approve floor — default per strategy is 95).
- Top-30 sample of fuzzy candidates with the matched rule and the orphan/proposed values side-by-side (sanity-check before auto-approve).
- Triage histogram for the dark orphans (inspector_outreach vs archive_candidate).
- Inspector-outreach CSV-ready SELECT (export as CSV from the SQL Editor; hand to ops).

## What does NOT live in this folder yet

- **Phase 2 (review + apply)** — see strategy doc. The apply functions are in file 1; the workflow (auto-approve ≥95, batch apply, satisfaction window) is operational, not SQL.
- **Phase 3 (inspector outreach + archive)** — the `inspector_outreach` triage is just a CSV export; the archive operation needs a separate `04-archive-dark-orphans.sql` (deferred until iOS Stage 4c-1/4c-2 are merged to main + shipped to TestFlight, per the strategy doc's sequencing constraint).
- **Phase 4 (cleanup + Stage 4a NOT NULL promotion)** — `05-promote-not-null.sql`, gated on the 30-day no-orphans clock.

## Sequencing constraint

Per the strategy doc, **Stage 4c-1 must be in production before Phase 2 (apply) begins**. Otherwise, every apply could be immediately overwritten by a fresh push from an unfixed iOS client. As of this commit:

- Stage 4c-1 (push DTO coalesce): **done in worktree** `feat/stage4c-1-coalesce-fk-on-push`, awaiting merge + TestFlight.
- Stage 4c-2 (photo path filter): **done in worktree** `feat/stage4c-2-block-local-photo-paths-from-jsondata`, awaiting merge + TestFlight.

Phase 1 discovery (files 1–3) is safe to run NOW — it only inserts into the proposal table and doesn't touch live `inspections`. Wait on Phase 2 apply until iOS is shipped.
