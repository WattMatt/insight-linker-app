# Architecture Review: WM Compliance (Insight Linker)

**Date:** 2026-07-07 · **Scope:** full repo at commit `c293076` (main) · **Method:** five parallel deep-dive audits (data flow, offline sync, PDF pipeline, Supabase backend, app shell/auth) over ~87,400 lines of TypeScript, 176 migrations, 16 edge functions.

## Assumptions

- **Team:** solo developer / very small team (single git author, 2,928 commits, Lovable-origin project).
- **Scale target:** low hundreds of concurrent users — field inspectors (Capacitor/PWA, often offline), admin staff, client-portal and contractor users, plus anonymous token-link visitors. Data volumes in the thousands of sites/subsections and tens of thousands of inspections/photos within 1–2 years.
- **Hosting:** Vercel (web) + Supabase project `oltzgidkjxwsukvkomof` (Postgres, Auth, Storage, Edge Functions). The Capacitor apps load the deployed Vercel URL remotely (`server.url` in capacitor.config.ts).
- **Domain constraint:** SANS 10142-1 compliance records (COCs, signatures, inspection evidence) — auditability and integrity of records is a business requirement, not a nice-to-have.
- Bucket public/private state below is inferred from migrations; the live dashboard state should be confirmed before acting (migration `20251120083541` set **all** buckets public; a code comment in Sites.tsx believes `site-images` is private — one of the two is wrong).

## Architecture Summary

A fully client-rendered SPA hosted inside Next.js 15: all 49 `page.tsx` files are `"use client"` one-line wrappers around legacy Vite-era views in `src/views/`, which talk to Supabase directly from the browser (621 inline `supabase.from()` calls in 130 files). RLS is the sole security boundary — there is no middleware, no server-side auth, and one API route. A bespoke offline engine (localStorage mutation queue + IndexedDB blobs, last-write-wins) supports field work, and all PDF reports are generated in the browser main thread via pdfmake. The same screens are re-implemented per audience (admin / client portal / contractor / public token links).

---

## Critical Findings

### TIER 1 — Fix Before Anything Else

#### 1. Storage buckets flipped public — compliance documents downloadable anonymously
**Component:** Supabase Storage
**Problem:** Migration `20251120081347` made `documents` public and `20251120083541` ran `UPDATE storage.buckets SET public = true` across **all** buckets — inspection photos, client documents, COC evidence. Code still generates signed URLs for `site-images` (Sites.tsx:73 comments "bucket is private"), so the codebase itself disagrees about the security posture.
**Failure Condition:** Today, with one leaked/guessed object URL. Public buckets serve objects to anyone with the path — no auth, no RLS. QR codes and shared reports circulate exactly these URLs.
**Impact:** Client compliance records (POPIA-relevant) exposed to the internet; unmetered anonymous egress on ~1M-photo scale is also a cost/DoS vector.
**Recommendation:** Verify live bucket state in the dashboard; set every bucket except `company-logos`/`client-logos` back to private; route all reads through the new batched helper `src/lib/data/signedUrls.ts`; add storage RLS scoping uploads to `auth.uid()` folder prefixes. Delete the `findCorrectImageUrl` self-healing hack once URLs are stable.
**Effort:** M (2–4 days: bucket flip is minutes; sweeping `getPublicUrl` call sites is the work).

#### 2. Twelve "fortress" tables ship with no RLS at all
**Component:** Database — migration `20260612200000_fortress_building_layer.sql`
**Problem:** 12 new tables (`building_assets`, `ppm_tasks`, `tenants`, `tenant_trading`, `expense_recoveries`, `security_incidents`, …) are created with zero `ENABLE ROW LEVEL SECURITY` statements. The file is marked "Reviewed-not-applied".
**Failure Condition:** The moment this migration is applied to production, every authenticated user — including client-portal and contractor accounts — can read and write every tenant's building, financial and security-incident data.
**Impact:** Total cross-tenant exposure of the newest data domain.
**Recommendation:** Block application of this migration until a companion policy migration exists. Pattern (matches the existing COC fix in `20260623120000`):
```sql
ALTER TABLE public.building_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff full access" ON public.building_assets
  FOR ALL USING (has_role(auth.uid(), 'Admin') OR has_role(auth.uid(), 'User'));
CREATE POLICY "clients read own sites" ON public.building_assets
  FOR SELECT USING (
    has_role(auth.uid(), 'Client')
    AND site_id IN (SELECT id FROM public.sites WHERE client_id = get_user_client_id())
  );
-- repeat per table; add the composite indexes from Tier 2 finding #7 at the same time
```
**Effort:** S–M (1–2 days for 12 tables + tests).

#### 3. Offline queue survives logout and loses conflicting edits silently
**Component:** Offline sync engine (`useOfflineSync.ts`, `offlineQueue.ts`)
**Problem:** (a) Nothing clears `offline_mutation_queue` (localStorage) or IndexedDB on `signOut` — a shared field device can replay User A's queued mutations under User B's session. (b) Conflict resolution is last-write-wins with no `updated_at` check: two inspectors editing the same inspection offline silently destroy one side's work. (c) A 401 mid-drain burns the 3-retry budget and **discards the mutation** — captured field data is deleted.
**Failure Condition:** (a) any shared device with two users; (b) any two-device edit of the same inspection — routine for a multi-inspector site visit; (c) any token expiry during a long offline stint (guaranteed after refresh-token expiry).
**Impact:** Silent loss/corruption of compliance evidence — the single worst outcome for this product.
**Recommendation:** Three surgical changes: wipe queue + blob stores in the `signOut` path (and tag queued mutations with `user_id`, dropping mismatches at drain time); park auth-failed mutations in a "needs re-auth" state instead of discarding (drain them after the next successful login); send `updated_at` as an optimistic-concurrency token (`.eq('updated_at', localCopy.updated_at)`) and on zero-row updates keep the local copy as a conflict record surfaced in the existing offline-review screen.
**Effort:** M (3–5 days including tests; the vitest offline harness already exists and is good).

#### 4. Zero production observability
**Component:** Whole app
**Problem:** 425 raw `console.*` statements, no Sentry/error reporting, one root ErrorBoundary whose recovery is `window.location.reload()`. Production failures — including the offline data-loss scenarios above — are invisible.
**Failure Condition:** Already failing: any error in the field today leaves no trace.
**Recommendation:** Add `@sentry/nextjs`; wire it through the new `src/lib/logger.ts` (already provides `installErrorReporter()`), then migrate `console.*` call sites incrementally. Add per-route-group `error.tsx` boundaries so one widget crash stops reloading the whole app.
**Effort:** S (½–1 day for Sentry + boundaries; logger migration is incremental).

### TIER 2 — Fix Before Growth

#### 5. No data-access layer; unbounded queries; refetch storms
**Component:** Client data layer
**Problem:** 621 inline `supabase.from()` calls; the Dashboard fetches **entire** `sites`, `subsections`, `snags`, `inspections` tables in two `useEffect` blocks (Dashboard.tsx:99–176); ~70–80% of list views are unbounded; the QueryClient has no `defaultOptions` (staleTime 0 → every focus refetches everything); `useOfflineSync.ts:465` invalidates the entire cache after every sync; query keys are ad-hoc strings.
**Failure Condition:** At ~5–10k subsections and ~20 concurrent users, dashboard mounts pull tens of MB, p95 loads exceed 5–10s, and Supabase egress/DB CPU costs spike. The 24h NetworkFirst service-worker cache on REST responses then hides the slowness behind *stale* data, which the offline engine can write back over fresher server state.
**Recommendation:** Adopt the repository + hook pattern shipped in `src/lib/data/` (`queryKeys.ts`, `sites.ts`, `useSites.ts`, `README.md`); set QueryClient defaults (providers.tsx):
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, retry: 2, refetchOnWindowFocus: false },
  },
});
```
Convert Dashboard's triage to a Postgres RPC returning pre-aggregated counts (one round trip, no row shipping). Drop the Supabase REST entry from the Workbox `runtimeCaching` config — IndexedDB is the app's offline source of truth; two disagreeing caches are worse than one.
**Effort:** M for defaults/RPC (2–3 days); L for full repository migration (incremental, weeks — order in `src/lib/data/README.md`).

#### 6. RLS policies with per-row subqueries + missing composite indexes
**Component:** Database
**Problem:** Client-scoping policies run `site_id IN (SELECT id FROM sites WHERE client_id = get_user_client_id())` per row (`20260623120000`); `get_public_portfolio` nests `jsonb_agg` with per-site snag-count subqueries; no composite indexes for the dominant access paths.
**Failure Condition:** ~10k snag/COC rows per client query → seconds of DB CPU per portal page; portfolio links with 500+ sites → full snags scans per site.
**Recommendation:**
```sql
CREATE INDEX IF NOT EXISTS idx_subsections_site_created ON public.subsections (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snags_subsection_status ON public.snags (subsection_id, status);
CREATE INDEX IF NOT EXISTS idx_inspections_site_status ON public.inspections (site_id, status);
CREATE INDEX IF NOT EXISTS idx_sites_client ON public.sites (client_id);
```
Postgres caches the InitPlan for `get_user_client_id()` per statement, so the bigger win is making the `IN (SELECT …)` semi-join index-backed (`idx_sites_client`) and maintaining a trigger-updated `snag_counts` column (or materialized view) for the portfolio RPC instead of counting live.
**Effort:** S for indexes (hours); M for portfolio rollups (2–3 days).

#### 7. ~2 MB of avoidable JavaScript on first load
**Component:** Bundle
**Problem:** `pdfjs-dist`/`react-pdf` (~1.2 MB gz) statically imported by `FloorPlanViewer` and `DocumentPreviewDialog`; pdfmake + embedded vfs fonts (~500 KB gz) pulled in by report generators; `xlsx` (~200 KB gz) static in `AssetVerification.tsx` — on a field app used on cellular.
**Failure Condition:** Now, on every cold load; worst on rural 3G where TTI degrades by 10–30s.
**Recommendation:** `next/dynamic(() => import(...), { ssr: false })` for `DocumentPreviewDialog`, `FloorPlanViewer`, `BulkInspectionReportGenerator`; `await import('xlsx')` inside the export handler (the codebase already does this correctly for `heic2any` and `qrcode` — extend the same pattern). Then delete dead deps: `jspdf`, `pdf-lib`, `docx-preview` are in package.json but never imported.
**Effort:** S–M (1–2 days incl. bundle-analyzer verification).

#### 8. Bulk PDF generation freezes the WebView and grows memory unboundedly
**Component:** `BulkInspectionReportGenerator.tsx` + pdfmake stack
**Problem:** Sequential main-thread loop; every generated PDF blob is retained in a React state array; per-photo canvas compression at ~100ms+ each.
**Failure Condition:** ~20–30 reports × 5–10 photos each freezes the Capacitor WebView for minutes; iOS will kill the app under memory pressure around a few hundred MB of retained blobs.
**Recommendation:** Upload each PDF as it's produced and keep only `{name, status, url}` in state (drop the blob); yield to the event loop between reports (`await new Promise(r => setTimeout(r, 0))`); cap concurrent photo decompression. Move generation into a Web Worker as the follow-up (pdfmake runs in workers; this also removes the need for careful yielding).
**Effort:** M (2–3 days for streaming/upload; +3–4 days for worker).

#### 9. Multi-tab double-drain of the offline queue
**Component:** `useOfflineSync.ts:19–46`
**Problem:** The drain lock (`isDraining`) is a module-level in-memory variable, but the queue is in shared localStorage — two tabs (or PWA window + browser tab) can drain concurrently and clobber the queue.
**Failure Condition:** Any user with the app open twice while mutations are queued — common with "install as app" + a bookmarked tab.
**Recommendation:** Wrap the drain in the Web Locks API — minimal, no dependency, supported everywhere the app runs:
```ts
const processQueue = async () => {
  await navigator.locks.request("wm-offline-drain", { ifAvailable: true }, async (lock) => {
    if (!lock) { drainAgain = true; return; }   // another tab is draining
    await drainQueueLocked();
  });
};
```
**Effort:** S (½–1 day + a race test alongside the existing queueRaces suite).

#### 10. Capacitor/static-export configuration contradiction
**Component:** capacitor.config.ts / next.config.mjs
**Problem:** `webDir: 'out'` implies a static export that the build never produces (`output: 'export'` is not set); the app actually works because `server.url` points at the Vercel deployment — i.e., the "native" apps are remote-loading shells. First launch requires network, app-store review risks apply, and the offline story on native rests entirely on the service worker having been primed.
**Failure Condition:** Fresh install opened offline (field reality) → blank screen; or an Apple review rejection for a thin webview wrapper.
**Recommendation:** Decide the architecture explicitly. Given zero server-side rendering is used, the cleanest fix is `output: 'export'` + ship the static bundle inside the app (delete `server.url`), which also makes web hosting nearly free (see Cost notes). The single API route (`api/snapshots/capture`) moves to a Supabase Edge Function where the other 16 already live.
**Effort:** M (3–5 days incl. device testing).

### TIER 3 — Fix for Long-Term Health

#### 11. God views
`InspectionDetail.tsx` (3,102 lines, 23 queries, offline branching + rendering + PDF triggers in one file), `Users.tsx` (1,514), `useSubsectionDetail.ts` (1,193), `Calendar.tsx` (1,090). Split along the seams that already exist: data hooks (→ `src/lib/data/`), offline behaviour (→ shared engine), and presentational sections. Follow the `views/subsection-detail/` folder precedent. **Effort:** L, incremental.

#### 12. PDF stack consolidation
One real engine (pdfmake) but three conflicting color palettes (`pdfMakeConfig.COLORS`, `pdfMakeUtils.ACCENT_COLORS`, `usePDFTemplateGateway.ACCENT_COLOR_PALETTE` — different hex values for "the" brand colors), two logo loaders, and a "MANDATORY" template gateway that ~70% of generation bypasses (`pdfmakeInspectionReport.ts`). Merge inspection generation into `pdfEngine.generateReport()`, single palette in `pdfMakeConfig`, route everything through the gateway. Also remove the fake `DOMMatrix`/`Path2D` polyfills in next.config.mjs whose identity-matrix `transformPoint()` can silently corrupt pdfjs text/image extraction — isolate pdfjs parsing in a worker or gate those code paths to the browser. **Effort:** M–L (1–2 weeks).

#### 13. Offline hooks share no abstraction
Five `useOffline*` hooks re-implement online detection (5 copies of 4 listeners each), try-online-fallback, and enqueue logic (~1,875 lines). Start with `src/hooks/useOnlineStatus.ts` (shipped) to delete the five listener copies; then extract a generic `createOfflineEntityStore(entity, endpoints)` so a new offline entity is configuration, not a 300-line hook. **Effort:** M.

#### 14. Audience-duplicated views
Admin / client-portal / contractor / public variants of the same screens duplicate data fetching (and drift — the signed-URL N+1 was copy-pasted into four of them). Unify on shared data hooks + role-aware presentation components; keep separate routes. **Effort:** L, incremental with #5.

#### 15. Type and hygiene debt
272 `: any` in a strict-mode codebase; 33 macOS `" 2"` duplicate files were committed historically; migration count (176) warrants a squashed baseline schema for readability. Add ESLint budget rules (`no-explicit-any` as warn with a ratchet), delete dead deps and files. **Effort:** S–M, incremental.

---

## Scalability Analysis

### What Breaks First
At 10× data volume, the **dashboard/triage unbounded fetches (#5) hit first** — tens of MB per admin mount, multiplied by staleTime 0 refetching — followed immediately by **per-row RLS subqueries (#6)** turning portal pages into seconds of DB CPU. Both degrade the same shared Postgres, so they compound: the SPOF is the single Supabase project (auth + DB + storage + functions, single region). An outage there takes down every audience including public links; only offline-primed field devices keep working.

### Database Layer
Solid foundations (has_role/security-definer helpers, 93 indexes, updated_at triggers, token-validated public RPCs) undermined by the four issues above: missing composite indexes, live-aggregation RPCs, per-row semi-joins in policies, and the unapplied no-RLS fortress migration.

### Application Layer
The browser is the application server: report generation, image compression, and sync all compete for one main thread on mid-range Android hardware. Stateless web tier (good — Vercel scales it), but the offline engine's in-memory locks make each tab a stateful island (#9).

### Network & Service Boundaries
Three caches with no coherence protocol: Workbox SW (REST, 24h), TanStack Query (staleTime 0), IndexedDB (offline source of truth). Recommendation: SW caches static assets + storage images only; TanStack Query owns server state; IndexedDB owns offline state. Signed-URL N+1 (4 files) is the main chatty-interface pattern — fixed by `signedUrls.ts`.

## Security Surface

| Risk | Severity | Component | Recommendation |
|------|----------|-----------|----------------|
| All storage buckets public (migration `20251120083541`) | **CRITICAL** | Storage | Private + signed URLs (Tier 1 #1) |
| 12 fortress tables without RLS (unapplied) | **HIGH** | Database | Policy migration gate (Tier 1 #2) |
| Offline queue replays across user sessions | **HIGH** | Offline engine | Wipe on signOut + user-tag mutations (Tier 1 #3) |
| No rate limiting on `send-email` / `invite-user` edge functions | MEDIUM | Edge functions | Per-user quota table or Upstash Ratelimit; both functions already auth-check |
| Client-only route guards, no middleware; protected UI ships in public bundle | MEDIUM | App shell | Acceptable *only if* RLS stays airtight; add middleware.ts session check for defense-in-depth if staying SSR-hosted |
| `USING (true)` read policies (73) on config tables | LOW | Database | Intentional for settings/currencies; audit list once |
| Public token links | OK | RPC layer | Well designed: 256-bit tokens, `is_active` revocation, expiry, audit counters, SECURITY DEFINER validation |

## Operational Readiness

| Dimension | Current State | Target State |
|-----------|--------------|--------------|
| Error tracking | None (425 console.*) | Sentry via `src/lib/logger.ts` reporter hook |
| Metrics/tracing | None | Vercel Analytics + Supabase query insights review, monthly |
| Error containment | Single root boundary → full reload | Per-route-group `error.tsx` |
| Testing | 69 vitest files, offline core well covered; RLS untested | Keep; add pgTAP/`supabase test` RLS suite + CI gate |
| Deployment | Vercel auto; migrations pushed manually | CI applies migrations (`supabase db push`) with the type-regen workflow already drafted in docs/ci/ |
| Disaster recovery | Unverified | Enable Supabase PITR; document + test a restore quarterly |
| Backups of local work | Just failed you (dataless-file incident) | Everything through git; secrets in Vercel/Supabase env, pulled via `vercel env pull` |

## Redesign Roadmap

### Phase 1 (Week 1–2): Stop the bleeding
1. Buckets private + signed-URL sweep (#1); verify live state first.
2. Fortress RLS companion migration written and reviewed before anything applies (#2).
3. Logout queue wipe + auth-failure parking (#3a/c). 4. Sentry + error boundaries (#4).
5. QueryClient defaults; remove Supabase REST from SW cache (#5, config part). 6. Web Locks drain lock (#9). 7. Delete dead PDF deps (#7 part).

### Phase 2 (Month 1): Scale preparation
1. Composite indexes + dashboard-triage RPC + portfolio rollups (#5/#6).
2. Dynamic imports for PDF/xlsx/viewer components (#7).
3. Bulk PDF streaming-upload rewrite (#8).
4. Conflict detection via `updated_at` CAS + offline-review surfacing (#3b).
5. Migrate Dashboard, Sites, SiteDetail to `src/lib/data/` repositories.

### Phase 3 (Quarter): Architectural evolution
1. Finish repository migration; delete inline queries as views are touched (#5/#14).
2. Split InspectionDetail along data/offline/presentation seams (#11).
3. PDF consolidation behind the gateway; single palette; worker generation (#12, #8 follow-up).
4. Generic offline entity store (#13). 5. Decide static-export vs SSR-hosted once, implement (#10). 6. Squash migration baseline; type-debt ratchet (#15).

## CAP Theorem Trade-off Summary
Supabase Postgres is CP (single-region, consistent). The offline layer deliberately chooses AP for field work — correct for this domain — but implements convergence as silent last-write-wins, which is the wrong consistency model for compliance records that carry signatures and legal weight. The fix isn't abandoning AP; it's making conflicts *visible* (CAS + conflict records) so a human converges them. The service-worker REST cache adds a third, incoherent consistency domain and should be removed from the API path.

## Cost Efficiency Notes
- **Vercel:** every page is client-rendered, so SSR compute is pure overhead — static export (Tier 2 #10) reduces hosting to CDN + one edge function and removes the polyfill hacks.
- **Supabase egress:** unbounded selects (tens of MB per dashboard visit) and public-bucket hotlinking are the two egress leaks; #5 and #1 fix both.
- **Client-side PDF generation is the right call economically** (zero server compute for the heaviest workload) — keep it, just bound its memory (#8).
- **node_modules:** jspdf + pdf-lib + docx-preview are dead weight in every install and build.

---

## Improved code shipped with this review (additive only — nothing existing was modified)

| File | Replaces |
|---|---|
| `src/lib/data/queryKeys.ts` | Ad-hoc query-key strings; enables targeted invalidation |
| `src/lib/data/signedUrls.ts` | Four copies of the per-row signed-URL N+1 (one batch call per bucket) |
| `src/lib/data/sites.ts` | Inline queries in Sites.tsx et al. — reference repository (typed, bounded, framework-free) |
| `src/lib/data/useSites.ts` | `useEffect`+`useState` fetching — reference React Query hook |
| `src/lib/data/README.md` | Rules + migration order for the data layer |
| `src/lib/logger.ts` | 425 raw console.* calls; Sentry-ready via `installErrorReporter()` |
| `src/hooks/useOnlineStatus.ts` | Five duplicate online/offline listener implementations |

Wiring these in (imports in views, QueryClient defaults, SW config change, SQL migrations) intentionally requires review — see tier items above for the exact snippets.
