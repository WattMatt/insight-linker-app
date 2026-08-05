# 01 — Application Inventory (Phase 1)

- App: **wm-compliance-inspector** (`package.json` name) — Next.js App Router + Capacitor + PWA frontend, Supabase backend (Postgres + storage + Deno edge functions), deployed on Vercel.
- Date: 2026-07-29. Engagement: read-only; all output under `./review/` only.
- Method: 14 parallel read-only inventory agents (one per slice) + 1 orchestrator addendum. Per-file detail (classification, LOC, public surface with file:line, notes, ASSUMED lists) lives in `./review/inventory/01…15-*.md`. This document is the roll-up.

---

## 1. Tool-generated counts

```
$ git ls-files | wc -l
936

$ git ls-files | awk -F/ '{print $1}' | sort | uniq -c | sort -rn | head -6
 496 src
 203 supabase
 199 docs
  10 public
   1 vitest.setup.ts     (…root files, 28 total)

$ git ls-files 'src/*' | awk -F/ '{print $1"/"$2}' | sort | uniq -c | sort -rn
 185 src/lib   148 src/components   74 src/views   59 src/app   25 src/hooks
   2 src/integrations   1 src/types   1 src/test   1 src/index.css

$ git ls-files 'supabase/migrations/*' | wc -l
183            (+17 supabase/functions files, +config.toml, +1 seed, +1 template = 203)

$ git ls-files | grep -v / | wc -l
28             (root config/docs/scripts)
```

Slice coverage reconciliation: slices 01–14 covered 932 files; 4 files in single-file `src/components/{coc,dashboard,pdf-preview,templates}/` subdirs were missed by the slice partition and are covered in the addendum (`inventory/15-…`). **932 + 4 = 936 = git ls-files.**

### Classification totals (summed from slice reports)

| Classification | Count |
|---|---|
| source | 618 |
| docs | 182 |
| tests | 78 |
| generated | 18 |
| assets | 13 |
| scripts | 11 |
| config | 11 |
| build-deploy | 5 |
| **Total** | **936** |

(78 test files are vitest suites co-located with sources; "generated" includes the 3,342-line `src/integrations/supabase/types.ts` schema types and Lovable-era artifacts; classification per file is in the part files.)

### Part-file index

| Part | Slice | Files |
|---|---|---|
| `inventory/01-src-lib-siteCoc.md` | src/lib/siteCoc | 34 |
| `inventory/02-src-lib-report.md` | src/lib/{report,documents,pdf,coc} | 32 |
| `inventory/03-src-lib.md` | src/lib root, alphabetical 1–54 | 54 |
| `inventory/04-src-lib.md` | src/lib root, alphabetical 55–107 | 53 |
| `inventory/05-src-lib-fortress-data-auth.md` | src/lib/{fortress,data,auth} + integrations/types/test/index.css | 17 |
| `inventory/06-src-hooks.md` | src/hooks | 25 |
| `inventory/07-src-components-ui.md` | src/components/ui (shadcn kit) | 49 |
| `inventory/08-src-components.md` | src/components domain subdirs | 47 |
| `inventory/09-src-components.md` | src/components root-level | 48 |
| `inventory/10-src-views.md` | src/views | 74 |
| `inventory/11-src-app.md` | src/app route tree | 59 |
| `inventory/12-supabase-functions.md` | supabase/functions | 17 |
| `inventory/13-supabase-migrations.md` | supabase/{migrations,seeds,templates,config.toml} | 186 |
| `inventory/14-platform.md` | root files + public/ + docs/ + untracked | 237 |
| `inventory/15-src-components-missed-addendum.md` | 4 single-file component subdirs | 4 |

---

## 2. Runtime process map

**Web entry & rendering.** Server `RootLayout` at src/app/layout.tsx:32 (PWA manifest layout.tsx:9); client `Providers` (react-query client, ServiceWorkerUpdater, OfflineIndicator, SessionWatcher) at src/app/providers.tsx:12–23. Every `page.tsx` in the tree is a `"use client"` component; the only server-side files are the root layout and the one API route. No `middleware.ts` exists (`git ls-files src/middleware*` → empty) — auth gating is layout-based: `ProtectedRoute` (src/app/(admin)/layout.tsx:12), `ClientProtectedRoute` ((client-portal)/layout.tsx:10), `ContractorProtectedRoute` ((contractor)/layout.tsx:9). No `loading.tsx`/`error.tsx` anywhere.

**Route surfaces (58 pages/layouts).** Five audiences: `(admin)` staff app (27 files, sidebar shell); `(client-portal)` (6); `(contractor)` (4); `auth/` (6); unauthenticated share/QR surfaces `public/`, `portfolio/[token]`, `review/[token]`, `download/[requestId]`, `install`, `offline` (10). Several views are mounted at multiple URLs (see §3).

**HTTP handlers.**
- 1 Next API route: `GET /api/snapshots/capture` (src/app/api/snapshots/capture/route.ts:36) — Bearer `CRON_SECRET` guard (:37–39), Supabase **service-role** client (:46), pages 8 tables and upserts `site_health_snapshots` (:92–94).
- 17 Supabase edge functions, each a `serve()` entry, **all** using `SUPABASE_SERVICE_ROLE_KEY` clients. Auth models vary: JWT+Admin-role (invite-user, delete-user); JWT+getUser (compress-image, batch-compress-images, send-email, offline-review); static-key/OAuth-style (templates, save-template, template-sync, api-reports, oauth-token); anonymous (qr-redirect, report-issue with Turnstile, log-auth-event, fix-inspection-photos). Per-function detail in `inventory/12-…`.
- Anon-granted `SECURITY DEFINER` RPCs are a parallel public API: `_share_link`, `get_public_subsection`, `get_public_portfolio`, `get_public_site_review`, `get_public_subsection_review`, `get_public_site_register` (supabase/migrations/20260610113000_public_rpcs_phase1.sql:9 ff., redefined 20260727101000).

**Scheduled / background.**
- Vercel cron: daily 02:00 UTC → `/api/snapshots/capture` (vercel.json:7). **Zero pg_cron usage in migrations** — the snapshot scheduler exists only in vercel.json; the DDL comment in 20260616110000_site_health_snapshots.sql:2 references "scheduled capture job" without defining one.
- In-DB triggers: `on_auth_user_created` → `handle_new_user()` (first user auto-Admin, 20251020093607:23,33–37); recompute pipeline `trg_recompute_from_inspections` / `trg_rollup_coc_from_documents` (20260615120000, 20260612140000); `cleanup_activity_logs()` keeps last 20 rows (20251020070622:1).
- `qr-redirect` defers `qr_scans` inserts past the 302 via `EdgeRuntime.waitUntil` (qr-redirect/index.ts:79–84). In-memory per-isolate rate limits in 3 anon functions (non-durable, documented in-file).
- Client-side offline engine: localStorage mutation queue with 16 mutation types drained by `useOfflineSync` (src/hooks), IndexedDB `wm_compliance_offline` v5 for offline stores.
- Realtime: `floor_plan_pins` is the only table in the `supabase_realtime` publication (20251120103640:2).

**External integrations.** Supabase project `oltzgidkjxwsukvkomof.supabase.co` (sole allowed image host, next.config.mjs:117–125); 9 storage buckets (company-logos, client-logos, site-images, inspection-photos, documents, profile-images, issue-screenshots, suggestion-screenshots, coc-photos); Resend (invite-user, send-password-reset); Gmail SMTP via denomailer (send-email); Cloudflare Turnstile (report-issue + optional frontend captcha); Lovable AI Gateway `google/gemini-3-flash-preview` (offline-review); outbound `DOCBUILDER_WEBHOOK_URL` (template-sync); pdf.js workers from cdnjs (src/lib/pdf/advancedProcessor.ts:13) and unpkg (2 components).

**Build/deploy pipeline.** `next build` with `NODE_OPTIONS --require ./server-polyfills.js` (package.json:6–8, vercel.json:4); PWA via @ducanh2912/next-pwa + workbox (offline fallback `/offline`, NetworkFirst 24h for supabase REST, CacheFirst 7d for storage; disabled in dev) — next.config.mjs:28–100; `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds` with in-file recorded baselines (109 type errors; ~524 lint findings downgraded) — next.config.mjs:110–113, eslint.config.mjs:26–30; Capacitor native shell `com.wattmatt.compliance` loads the **remote** `https://insight-linker-app.vercel.app` (`server.url`, cleartext) instead of bundled assets — capacitor.config.ts:6–10; no `android/`/`ios/` directories are tracked. Vitest (node+jsdom) for the 78 test files.

---

## 3. Observed oddities (factual roll-up — no recommendations; full lists in part files)

**Untracked ` 2` duplicates.** 38 untracked entries; 32 are Finder-style `<name> 2.<ext>` duplicates of tracked files across root/src/docs/supabase (dated May 28). Notable: `supabase/migrations/20260525120000_auth_events_audit 2.sql` sits **inside the migrations dir** (shell globs double-count its DDL); `supabase/functions/log-auth-event/index 2.ts` is byte-identical to its tracked twin; two views (`IssueReports 2.tsx`, `OfflineSyncTest 2.tsx`) have **no tracked counterpart**.

**Unimported code (grep-verified zero importers).** `src/lib/pdf/` (4 files, 1,261 LOC; OCR explicitly stubbed at ocrEngine.ts:121–125); `src/lib/data/` repository layer (self-described reference implementation, no consumer); 9 views totalling 2,784 LOC (both admin previews, both access simulators, APIClients, SiteAssignments — the `/site-assignments` route renders `PortalManagement` instead, (admin)/site-assignments/page.tsx:2); 15 of 49 ui-kit files; hooks `useOnlineStatus` and `usePDFTemplate` (the latter duplicates `usePDFTemplateGateway`'s query).

**Duplication.** Two IndexedDB managers both open `wm_compliance_offline` v5 (offlineDB.ts / offlineInspectionDB.ts, with a version-parity test guarding the drift); `pdfMakeUtils.ts` and `pdfTemplates.ts` export 9 identically-named symbols (pdfTemplates has exactly 1 importer); three private canvas `compressImage` implementations + two HEIC converters across hooks; two coexisting toast stacks; three COC status vocabularies (cocCompliance.ts:1, cocHierarchy.ts:13, complianceCalculations.ts:33–38); DOMMatrix/Path2D polyfill duplicated (server-polyfills.js and inline next.config.mjs:7–26); parallel admin URL hierarchies (`clients/[clientId]/sites/…` and `sites/…`) mounting the same four views; `PublicSubsection` and `PublicSiteReview` each reachable at two public URL shapes.

**Registry/config mismatches.** `supabase/config.toml` declares 4 functions with no directory (validate-coc, extract-coc, verify-fix, detect-schematic-regions); `send-password-reset` is deployed but has **no** config.toml entry; 11 of 20 declared functions are anon-callable (`verify_jwt=false`). DocBuilder trio is fail-open-inconsistent: `templates` returns 503 when its token env is unset, `save-template`/`template-sync` allow **all** access when theirs are unset. `fix-inspection-photos` is anonymous **and mutating** (updates inspections.json_data). `oauth-token` compares client_secret by plain DB equality and stores tokens plaintext (oauth-token/index.ts:34–40, 76–83).

**Database history.** 481 `CREATE POLICY` vs 277 `DROP POLICY` across 183 migrations; Nov 2025 contains "Remove ALL RLS restrictions for authenticated users" (20251120080517:1) later reversed by the Jun 2026 lockdown series; 12 tables created-then-dropped (dead feature history: coc_validations v1, signatures, notifications, suggestions…); only 2 migrations have `.down.sql`; Jul 2026 migrations state **prod schema is ahead of schema_migrations** (applied via Management API, not `db push` — 20260727100000:5–6); seed file contains real personal names/contacts and self-declares "NOT applied to live DB"; `sql-import-scripts.md` at repo root embeds runnable SQL with 8 real staff emails.

**Platform.** Two lockfiles tracked (bun.lock + package-lock.json; Vercel installs with npm); favicon.ico/icon-192.png/icon-512.png are byte-identical 512×512 **JPEGs** regardless of extension or manifest declaration; committed SQLite `.db` + hot `.db-journal` under docs/; near-duplicate tracked dirs `docs/fortress-spec/` and `docs/fortress specs/`; QR PNGs upload to the `inspection-photos` bucket (qrCodeGenerator.ts:147–148).

---

## 4. PROPOSED — Phase 2 module grouping and spec granularity

**Granularity proposal:**
- **Full per-file specs** (template in the protocol) for all source/test units below except where marked.
- **Aggregate specs** (one document per unit describing the composite surface, not per-file) for: C01 (vendored ui kit), D01–D03 (spec = resulting schema/RLS surface per era, not 183 individual files), D04.
- **Index-only, no Phase 2 spec** for the five docs corpora (X01–X05) and P04 public assets — they are inventoried in the part files; specs would restate documents, not code.
- Net effect: **71 spec units** (77 manifest units − 5 docs − 1 assets). If you prefer fewer sessions, small sibling units can be merged to ~45 batches at Gate 1 — say so and I'll produce the merged slate.

The full unit table (one row per unit, 77 units, ids stable) is in `./review/manifest.md`. Summary by area:

| Area | Units | Files | Notes |
|---|---|---|---|
| L01–L22 src/lib (+integrations/types) | 22 | 190 | siteCoc 3 units; pdf/report engines 5; offline 1; scoring 2; misc |
| H01–H04 src/hooks | 4 | 25 | offline sync engine isolated as its own unit |
| C01–C17 src/components | 17 | 148 | C01 = 49-file shadcn kit (aggregate) |
| V01–V07 src/views | 7 | 74 | site-coc tab and subsection-detail decompositions kept whole |
| A01–A09 src/app | 9 | 59 | route tree by audience |
| F01–F05 supabase/functions | 5 | 17 | grouped by auth model/purpose |
| D01–D04 supabase db | 4 | 186 | three chronological eras + platform config |
| P01–P04 root/public | 4 | 38 | build pipeline, tooling, root docs/scripts, assets |
| X01–X05 docs/ | 5 | 199 | index-only |
| **Total** | **77** | **936** | |

**STATUS: LOCKED 2026-07-29 (Gate 1).** Grouping and granularity accepted as proposed; the manifest carries the dated lock and Phase 2 proceeds over `pending` units.

---

## 5. Phase 2 correction addendum (2026-07-29)

Phase 2 spec agents re-verified Phase 1 claims against source; where they conflict, **the specs supersede this document**. Corrections (full list in `manifest.md` gate log): SiteAssignments IS imported (PortalManagement.tsx:5 — §3's "unimported" claim for it is wrong; APIClients remains zero-importer); H01 sync engine has 17 mutation types, not 16; `temp_reset_password` IS dropped (20260212144831:26); C08's ReportSettingsDialog/SiteImages have zero importers; ui-kit importer counts in `inventory/07` were undercounts.
