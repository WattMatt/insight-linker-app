# A02 — snapshots-capture-api

- Unit id: A02
- Slug: snapshots-capture-api
- Spec mode: full
- Date: 2026-07-29
- Files: 1 (matches review/unit-files.json "A02")

## Unit header

**Unit purpose.** The application's sole App Router API route: a `GET` handler at `/api/snapshots/capture` that reads eight tables with a service-role Supabase client, computes per-site deliverables/readiness/health metrics using the pure calculators in L17, and upserts one row per site into `site_health_snapshots` keyed on `(site_id, captured_at)`. It is invoked daily at 02:00 UTC by a Vercel cron (vercel.json:7, unit P01) and guarded by a `Bearer ${CRON_SECRET}` header check.

**Module-level observations.**
- Single-file unit; the only non-client, non-page module under `src/app` besides `layout.tsx` (cross-checked against review/inventory/11-src-app.md:35).
- All metric math is delegated to L17 modules (`siteDeliverables`, `siteHealth`, `subsectionStatus`, `snapshotMetrics`); the route itself only fetches, groups, and maps rows.
- The route's inline comment "0 for an empty site — nothing captured is zero progress, never a fabricated 100" (route.ts:86) matches the verified behavior of `factorScores` (src/lib/siteHealth.ts:66: `if (total === 0) return { metering: 0, snags: 0, inspections: 0 }`) and the product-decision migration supabase/migrations/20260708170000_empty_sites_score_zero.sql:1-9, which backfilled empty-site rows to 0 after an interim NULL backfill (20260708150000).
- Writes to `site_health_snapshots` are service-role only by design: the table has no INSERT/UPDATE policies, only scoped SELECT policies (supabase/migrations/20260708090000_site_health_snapshots_scoping.sql:12-14 states "Writes remain service-role only (the nightly capture job)").

**External contract.** The rest of the app never imports this file; it consumes the route's *output data*: `site_health_snapshots` rows read by `src/components/ComplianceDashboard.tsx:110` (unit C14, trend card), `src/hooks/useSiteScores.ts:26` (unit H03, fast-path site scores with live fallback), and documented as the fast path in `src/lib/siteScores.ts:5` (unit L17). The HTTP trigger is the Vercel cron entry in vercel.json:7 (unit P01).

## src/app/api/snapshots/capture/route.ts

- Purpose: CRON_SECRET-guarded Next.js route handler that snapshots every site's deliverables/readiness/health metrics into `site_health_snapshots` once per invocation, upserting on `(site_id, captured_at)`.

- Public surface:
  - `export const dynamic = "force-dynamic"` (route.ts:8).
  - `export const maxDuration = 60` (route.ts:9).
  - `export async function GET(req: Request): Promise<NextResponse>` (route.ts:36).
  - No `export const runtime` (grep-verified) — default Node.js runtime.
  - Module-private helpers: `fetchAll(supabase: SupabaseClient, table: string, columns: string): Promise<any[]>` (route.ts:12) — pages `.select(columns).range(from, from+999)` in 1000-row windows until a short page (route.ts:15-20); `groupBy<T>(rows: T[], key: (r: T) => string | undefined | null): Map<string, T[]>` (route.ts:24) — skips rows whose key resolves falsy (route.ts:28).

- Inputs & outputs:
  - In: HTTP GET with `Authorization: Bearer ${CRON_SECRET}` header (route.ts:37). No query params or body are read.
  - Env vars: `CRON_SECRET` (route.ts:37), `SUPABASE_URL` with fallback `NEXT_PUBLIC_SUPABASE_URL` (route.ts:41), `SUPABASE_SERVICE_ROLE_KEY` (route.ts:42).
  - Tables read (service role, full-table pagination, route.ts:50-59): `sites(id, name, client_id)`, `subsections(id, site_id, name, coc_status, is_coc_required, is_thermal_required, is_inspection_required, metering_status, meter_serial_number)`, `snags(id, subsection_id, status, risk_level, title)`, `inspections(subsection_id, status, site_id, json_data)`, `site_schematics(site_id)`, `site_assets(site_id)`, `site_documents(site_id, category)`, `subsection_documents(subsection_id, document_categories(name))` — the last uses a PostgREST embedded select on `document_categories`.
  - Table written: `site_health_snapshots` via `.upsert(rows, { onConflict: "site_id,captured_at" })` (route.ts:92-94). The conflict target matches `UNIQUE (site_id, captured_at)` in supabase/migrations/20260616110000_site_health_snapshots.sql:15. Row shape is `SnapshotRow` (src/lib/snapshotMetrics.ts:16-26): `site_id, captured_at, health_score, completion_pct, outstanding_count, blocking_count, open_snags, ready_count, total_subsections` — the same columns (minus defaults) as the table DDL (20260616110000_site_health_snapshots.sql:3-16).
  - `captured_at` is `new Date().toISOString().slice(0, 10)` — the UTC calendar date at run time (route.ts:47).
  - Out (HTTP): 200 `{ ok: true, captured: <rows.length>, capturedAt }` (route.ts:97); 401 `{ error: "unauthorized" }` (route.ts:38); 500 `{ error: "missing supabase env" }` (route.ts:44); 500 `{ error: e?.message ?? "capture failed" }` (route.ts:100).
  - No localStorage/IndexedDB/buckets touched.

- Dependencies:
  - uses -> `next/server` (`NextResponse`, route.ts:1); `@supabase/supabase-js` (`createClient`, `SupabaseClient` type, route.ts:2) — a fresh service-role client with `auth: { persistSession: false }` (route.ts:46), not the app's browser singleton (L19); `@/lib/siteDeliverables` (L17): `computeSiteDeliverables`, `categoryMatches`, `THERMAL_CATEGORY_PATTERNS`, type `SiteDeliverablesInput` (route.ts:3); `@/lib/siteHealth` (L17): `computeSiteHealth`, `readiness` (route.ts:4); `@/lib/subsectionStatus` (L17): `isSnagOpen` (route.ts:5); `@/lib/snapshotMetrics` (L17): `toSnapshotRow` (route.ts:6).
  - used by <- none found as a code import (grep-verified: `grep -rn "snapshots/capture" src supabase` matches only the file itself, vercel.json:7, and a generated graph-cache artifact `src/graphify-out/cache/80b244…json` which records the file's own symbols). HTTP trigger: Vercel cron `{ "path": "/api/snapshots/capture", "schedule": "0 2 * * *" }` at vercel.json:7 (unit P01). Data consumers of the written table (not of this file): src/components/ComplianceDashboard.tsx:110 (C14), src/hooks/useSiteScores.ts:26 (H03), src/lib/siteScores.ts:5 comment (L17).

- Side effects: network reads of 8 Supabase tables in one `Promise.all` (route.ts:50-59, paginated — multiple round-trips per table over 1000 rows); one upsert write to `site_health_snapshots` (route.ts:92-94), bypassing RLS via the service-role key; `console.error("snapshot capture failed:", e)` on failure (route.ts:99). No events, subscriptions, or filesystem I/O.

- Error handling:
  - Auth header mismatch → immediate 401 JSON, nothing else runs (route.ts:37-39). Comparison is a plain `!==` string equality against the template `` `Bearer ${process.env.CRON_SECRET}` `` (route.ts:37).
  - Missing Supabase URL or service key → 500 `{ error: "missing supabase env" }` before any client is created (route.ts:43-45).
  - Any `fetchAll` page error → `throw error` (route.ts:17), caught by the outer try/catch.
  - Upsert error → `throw error` (route.ts:95), caught by the same catch.
  - Catch-all: logs to console and returns 500 with `e?.message ?? "capture failed"` (route.ts:98-101). No partial-success reporting — one failed table read fails the whole capture; nothing is written in that case (the upsert is the last step).

- Tests: none. No test file references this route (grep for `snapshots/capture` and `api/snapshots` across `*.test.ts`/`*.test.tsx`: zero hits). The imported calculators are tested in their own unit (L17: src/lib/siteHealth.test.ts, siteDeliverables.test.ts, snapshotMetrics.test.ts, subsectionStatus.test.ts per review/unit-files.json "L17") — those cover the math, not this handler's auth, fetching, grouping, or upsert.

- Observed issues (factual):
  1. When `CRON_SECRET` is unset, the guard's expected value is the literal string `Bearer undefined` (route.ts:37 template interpolation of `process.env.CRON_SECRET`); a request carrying exactly that header would satisfy the comparison. `CRON_SECRET` appears nowhere else in the repo (grep-verified) and is absent from .env.example (which lists only three `NEXT_PUBLIC_SUPABASE_*` vars and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, .env.example:1-10).
  2. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are likewise absent from .env.example (.env.example:1-10).
  3. `fetchAll` paginates with `.range()` and no `.order()` clause (route.ts:16); cross-page row order is whatever the server returns per request.
  4. `fetchAll` returns `any[]` (route.ts:12); all row access in `GET` is untyped, including explicit `(d: any)` casts at route.ts:69-70 and route.ts:81.
  5. `assetCount` is collapsed to presence: `assetSites.has(site.id) ? 1 : 0` (route.ts:80), not a count of `site_assets` rows. The only downstream read is the boolean test `input.assetCount > 0` (src/lib/siteDeliverables.ts:306).
  6. `thermalDocSubsectionIds` is computed once across ALL sites (route.ts:68-70) and the identical array is passed into every site's `SiteDeliverablesInput` (route.ts:82); per-site scoping happens downstream, where `buildThermal` intersects the set with that site's own subsection ids (src/lib/siteDeliverables.ts:257-260).

- ASSUMED:
  - The Vercel cron is the sole production caller; nothing in the repo proves no other holder of the secret calls the route (same caveat recorded at review/inventory/11-src-app.md:191).
  - `maxDuration = 60` is assumed effective on the deployed Vercel plan; plan limits are not verifiable from the repo.
  - The embedded select `document_categories(name)` (route.ts:58) is assumed to resolve via a foreign key from `subsection_documents` to `document_categories`; the FK lives in D-era migrations not re-verified for this spec.
  - The production `site_health_snapshots` schema is assumed to match migration 20260616110000 as amended by 20260708090000/150000/170000 (policies and data backfills only — those three files contain no column or constraint changes, verified by reading them); drift between migrations and the live database is not verifiable from the repo.
