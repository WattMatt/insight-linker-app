# Fortress Building Report Pack — spec & build folder

Everything needed to build the Fortress property-management layer for Insight Linker, from gap analysis through a
ready-to-execute build prompt. Produced 2026-06-12.

## Start here
- **`BUILD-PROMPT.md`** — paste this to kick off the coding session. It directs the structured, sprint-by-sprint
  build and the commit protocol.

## Contents

| File | What it is |
|---|---|
| `BUILD-PROMPT.md` | The kickoff prompt for the build session (read first) |
| `01-gap-analysis-and-dashboard.html` | 17-domain gap analysis vs current build + per-building dashboard design + 38-KPI catalogue |
| `02-build-roadmap.html` | Approved build spec: tech stack, architecture, data model, 11 features, 26 file-level tasks across 6 sprints, project structure |
| `03-preflight-review.md` | ADRs (D1–D8), schema validation, migration hardening, pre-mortem (14 modes), security review |
| `04-abaqulusi-ingest-review.md` | What was loaded for review + how it was verified |
| `abaqulusi_review.db` | SQLite mirror of the real Abaqulusi data (463 rows) — open to inspect the shape |
| `sql/` | Read-only **reference copies** of the migrations + seed |

## Canonical SQL (what the build actually applies)

The migrations and seed live in their proper Supabase locations (the `sql/` folder here is reference only, to
avoid drift):

```
supabase/migrations/20260612200000_fortress_building_layer.sql        base: 12 tables + sites profile cols + RLS
supabase/migrations/20260612210000_fortress_layer_hardening.sql       SV-1/SV-2/SV-4/SV-5  (+ .down.sql)
supabase/migrations/20260612220000_fortress_rls_scope.sql             SEC-1 scoped RLS (REQUIRED) (+ .down.sql)
supabase/seeds/fortress_abaqulusi_seed.sql                            real Abaqulusi data (ON CONFLICT-safe)
```

Apply order: `…200000` → `…210000` → `…220000` → seed. All five SQL files validate against the real PostgreSQL
grammar (libpg_query). **Not yet applied to the live DB** — gate on the S0-1 live-schema audit.

## Source data
Parsed from the three client workbooks in `docs/fortress specs/` (OPS Oct 2025, CM Dec 2025, Annual 2025).

## Status
Plan + schema + real seed + preflight complete and validated locally. Build-time skills (code-review, testing,
deploy-checklist) run during the build, against real diffs. Nothing applied to production yet.
