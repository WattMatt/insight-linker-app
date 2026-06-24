# Reliable Bulk COC Ingestion & Assignment — Design

**Date:** 2026-06-24
**Status:** Approved (design); pending implementation plan
**Scope:** Full build (both phases), top-down, to production. No phasing split.

## Goal

Make ingesting **hundreds** of COC certificate PDFs per site and assigning them to the right subsections fast, reliable, order-independent, and fully visible — eliminating the one-at-a-time manual straggler-fixing that dominates today.

## Decisions (locked)

1. **Full scope in one delivery** — assignment engine + reason codes + re-trigger glue + robust bulk upload + guided Bulk Assign workspace + confidence-ranked suggestions + manual-match protection. Ship everything, then deploy.
2. **No OCR / no PDF-text extraction.** COC filenames reliably contain the cert number, so cert detection stays filename-based (`extractCocNumber`). The failures are downstream of detection, not in it.
3. **Volume target: hundreds of PDFs per site.** Bulk upload and bulk assignment must stay responsive and transparent at that scale.
4. **Re-trigger glue is app-side**, not a DB trigger (avoids the RPC-grant fragility seen elsewhere in this codebase).
5. **Additive schema only.** No destructive migrations.

## Background — current pipeline (two paths meeting at the cert number)

- **Path A — Excel schedule import** (`src/views/site-coc/useSiteCocImport.ts` → `src/lib/siteCoc/parseWorkbooks.ts` → `src/lib/siteCoc/ingest.ts`): parses the DB-Schedule + Verification workbooks into `coc_db_schedule` (one row per shop) and `coc_certificates` (one per cert, SANS matrix in `rules` jsonb). Each row is fuzzy-matched to a subsection by shop/tenant name (`matchSubsection`, `normShop`), giving `subsection_id` + `match_status='matched'|'unmatched'`. This is the **register** — which cert belongs to which subsection. No PDFs.
- **Path B — file-pool upload** (`src/views/site-coc/SiteCocLoadCard.tsx` → `src/views/site-coc/useSiteCocPool.ts` → `src/lib/siteCoc/poolAssign.ts`): admin drags in PDFs; each uploads one-at-a-time to `documents/{siteId}/_pool/...`, inserts a `coc_file_pool` row, and detects the cert number **from the filename** (`src/lib/cocFilename.ts`) + classifies coc/eval (`src/lib/siteCoc/routeUpload.ts`).
- **Where they meet:** `planPoolAutoAssign()` matches `normCert(detected_cert_no)` to `coc_certificates.cert_no_norm` (site-scoped). On an exact, unique hit whose cert already has a `subsection_id`, it writes a `subsection_documents` row (`src/lib/coc/uploadCocFiles.ts`) and back-links `coc_document_id`/`eval_document_id` on the cert (`stampCert`). That `subsection_documents` insert fires `trg_rollup_coc_from_documents` (`supabase/migrations/20260612140000_coc_per_document_rollup.sql`), which sets `subsections.coc_status` + expiry. **Only that rollup makes a subsection show its COC status.**

### Why files fail to assign today (the real problem)
A file reaches a subsection only if Path A already imported its cert **and** matched that cert's shop to a subsection, in the right order. When not, `planPoolAutoAssign` silently skips it, `coc_file_pool.status` is only `pending|assigned` (no reason), and the admin hand-fixes each straggler. At hundreds/site this is the core pain.

## Architecture

Five units. The two pure cores (engine, ranker) carry the logic and are unit-tested; everything else is thin wiring.

### Unit 1 — Assignment engine with reason codes (pure)
**New:** `src/lib/siteCoc/assignmentEngine.ts` — `planPoolAssignment(files, certs)` classifies **every** pooled file, not just the assignable ones:

| Outcome | Condition | Carries |
|---|---|---|
| `assigned` | exactly 1 register cert matches `cert_no_norm` AND that cert has a `subsection_id` | `certId`, `subsectionId` |
| `ambiguous_cert` | ≥2 register certs share the `cert_no_norm` | `candidateCertIds[]`, `candidateSubsectionIds[]` |
| `cert_has_no_subsection` | exactly 1 cert matches but its `subsection_id` is null (Hop-1 failed) | `certId` |
| `cert_not_found` | no register cert matches the number | — |
| `no_cert_detected` | filename yielded no cert token | — |

This subsumes today's `planPoolAutoAssign` (the `assigned` subset drives auto-assignment; the rest drives the workspace). `planPoolAutoAssign` is reimplemented as a thin filter over `planPoolAssignment` to avoid divergence.

### Unit 2 — Re-trigger glue (order-independence)
**New:** `reassignPendingPoolFiles(siteId)` (in `useSiteCocPool.ts` or a small service). Fetches pending pool files + current register certs, runs `planPoolAssignment`, performs the actual assignment for any now-`assigned` (write `subsection_documents` + `stampCert` + mark pool `assigned`), and **persists the reason** (Unit 5 data) for the rest. Called after: `resolveShop`, `rerunAutoMatch`, and schedule import completion. Effect: drop PDFs first or import schedule first — assignment **converges automatically**. This is the relief for "the two-step flow."

### Unit 3 — Robust bulk upload
**Modify:** `useSiteCocPool.ts` upload path; **new pure helper** `src/lib/siteCoc/uploadQueue.ts` for outcome aggregation. Bounded-concurrency queue (e.g. 5 parallel) over the file list; live progress (X/N); a per-file outcome list (uploaded · detected cert · auto-assigned vs pending+reason · failed-with-message); **retry-failed**. Replaces the opaque one-at-a-time loop that toasts a nameless error on failure.

### Unit 4 — Bulk Assign workspace (new sub-tab)
**New:** `src/views/site-coc/AssignSubTab.tsx` (added to `SiteCocTab.tsx`). Renders pending pool files **grouped by reason** (from persisted data), each group with the right tool:
- `cert_has_no_subsection` / `ambiguous_cert` → **confidence-ranked subsection candidates** (Unit 5 ranker) with one-click pick.
- `cert_not_found` / `no_cert_detected` → inline cert-number correction (re-runs the engine for that file) or assign-to-subsection directly.
- **Multi-select → "assign these N files to subsection Y"** in a single batch write.
Each assignment reuses the existing write path (`uploadCocFiles`/`stampCert`) → fires the rollup. A header shows ingest status (total · assigned · pending-by-reason · schedule-imported?). Drag-to-assign is **out of scope** (optional future polish).

### Unit 5 — Confidence-ranked suggestions (pure) + persisted reasons
**New:** `src/lib/siteCoc/rankCandidates.ts` — `rankSubsectionCandidates(query, subsections, topN)` returns top-N by a similarity score (normalized Levenshtein + token-overlap), used by the workspace and the schedule resolver. Adds a third matching tier beyond today's exact/word-run.
**Persisted reasons (data):** the engine's outcome is written back to `coc_file_pool` so the workspace and the upload report read one source of truth.

## Data model (additive migration)

`supabase/migrations/20260624HHMMSS_coc_pool_reasons.sql`:
- `alter table coc_file_pool add column if not exists reason text;`
- `alter table coc_file_pool add column if not exists candidate_ids jsonb not null default '[]'::jsonb;`
- `notify pgrst, 'reload schema';`

No change to `match_status` (text) — the `'manual'` value below is just a new literal.

## Manual-match protection on re-import

Carry forward the known data-loss fix: `resolveShop()` stamps `match_status='manual'`; `applyPriorMatches`/`rerunAutoMatch` (`src/lib/siteCoc/reimport.ts`, `useSiteCoc.ts`) **never overwrite `'manual'` rows**; and `useSiteCocImport.ts` shows a **diff confirm** ("will delete X / add Y / preserve Z manual") before the destructive delete. Prevents re-import from silently destroying human assignments.

## Error handling & edge cases
- Upload failures are per-file and retryable; one bad file never aborts the batch.
- Duplicate cert numbers never silently stamp the wrong subsection — they become `ambiguous_cert` with candidates, resolved in the workspace.
- A file uploaded before its cert exists stays `cert_not_found` and is picked up automatically by the glue once the schedule imports.
- `coc_expiry_date` propagation gap (rollup) is noted but **out of scope** here unless it falls out naturally.

## Testing
- **Pure cores, unit-tested hard:** `planPoolAssignment` (every outcome branch, ambiguity, no-subsection, dedupe), `rankSubsectionCandidates` (ordering, ties, near-miss names), `uploadQueue` aggregation (concurrency, mixed success/fail).
- **Glue:** a test that resolving a shop reassigns a previously `cert_has_no_subsection` file (logic-level, against the engine).
- **Wiring/UI:** `npm test` full suite + `npm run build` green; manual runtime verification at volume.

## Out of scope
- OCR / PDF-text extraction (filenames carry cert numbers).
- Drag-to-assign onto subsection cards (multi-select batch assign covers the need).
- Full single-screen re-architecture (Approach 3).
- `coc_expiry_date` rollup propagation (separate concern).

## Files (new / modified)
- **New:** `src/lib/siteCoc/assignmentEngine.ts` (+test), `src/lib/siteCoc/rankCandidates.ts` (+test), `src/lib/siteCoc/uploadQueue.ts` (+test), `src/views/site-coc/AssignSubTab.tsx`, the pool-reasons migration.
- **Modify:** `src/lib/siteCoc/poolAssign.ts` (reimplement over the engine), `src/views/site-coc/useSiteCocPool.ts` (bulk queue + `reassignPendingPoolFiles` + persist reasons), `src/views/site-coc/useSiteCoc.ts` (`resolveShop` stamps `manual`, calls glue), `src/lib/siteCoc/reimport.ts` (protect manual), `src/views/site-coc/useSiteCocImport.ts` (diff confirm + call glue), `src/views/site-coc/SiteCocTab.tsx` (add Assign sub-tab), `src/views/site-coc/SiteCocLoadCard.tsx` (bulk progress/outcome/retry).
