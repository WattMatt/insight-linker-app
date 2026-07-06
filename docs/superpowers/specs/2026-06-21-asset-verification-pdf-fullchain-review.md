# Asset Verification PDF — Full-Chain Engineering Review

**Date:** 2026-06-21
**Subject:** Does commit `344661a` change what the user sees, and why does the Asset Verification PDF "still look the same"?
**Status of inputs:** repo verified at `HEAD == origin/main == 344661a` (see §0). Runtime/deploy/DB-config layers NOT verifiable from the repo and are flagged accordingly.

Every claim below cites `file:line` or a named input artifact. Findings are partitioned into **VERIFIED** (read directly this session or in the trace), **NEEDS USER/RUNTIME CONFIRMATION**, and **ROOT CAUSE (ranked)**.

---

## 0. Ground truth established this session

- `git rev-parse HEAD` == `git rev-parse origin/main` == `344661a89d61e55522a49ba1620aff0343f16ba8`. The branch is neither ahead nor behind origin. **VERIFIED** (this session).
- `git log --oneline -5` shows `344661a feat(pdf): Asset Verification report adopts shared pdfBars (visible upgrade)` at the tip. **VERIFIED** (this session).
- `git show --stat 344661a` touched exactly **3 files**: `src/lib/assetVerificationReportGenerator.ts`, `src/lib/pdfBars.test.ts`, `src/lib/pdfBars.ts`. `SiteSummaryReport.tsx` was **NOT** in the diff. **VERIFIED** (this session).

---

## 1. Full-chain map of the Asset Verification PDF pipeline

Each layer is marked verified / partial / unverified, with evidence. The chain is **100% client-side** — there is no server/edge generator for this report (trace: "PDF Generation Path", layer "Client vs Server Generation": grep of `/src/app/api/**` and `supabase/functions/api-reports` returned no asset-verification endpoint).

| # | Layer | Status | Evidence |
|---|-------|--------|----------|
| 1 | **UI entry — route** | VERIFIED | Admin: `/clients/{clientId}/sites/{siteId}` → `SiteDetail.tsx:26` (import), `:664-666` (TabsTrigger `value='asset-verification'`), `:721` (mount). Client portal: `/client-portal/sites/{siteId}` → `ClientPortalSiteDetail.tsx:20,269-271,348-349` (readOnly). Public: `/review/{token}` → `PublicSiteReview.tsx:28,396-398,477-478` (TabsTrigger `value='assets'` — different value, same component). All three page files are `"use client"` (verified this session: each `page.tsx` line 1) — **no ISR/SSG, no `generateStaticParams`, no `revalidate`**. |
| 2 | **Tab → component** | VERIFIED | All three views mount the single `AssetVerification` wrapper (`src/components/site/AssetVerification.tsx:60-502`), whose internal tabs are `verification`=AssetComparisonTable (`:429-438`), `meter-register`=MeterRegister (`:441-442`), `electrical`=AssetTable (`:445-446`). |
| 3 | **Button** | VERIFIED | "Generate PDF" button at `AssetComparisonTable.tsx:500` (`onClick={handlePreviewReport}`), label text at `:508` (`{generating ? "Generating..." : "Generate PDF"}`). Confirmed this session via grep. This is the **only** Asset-Verification PDF button; a second, unrelated "Generate PDF" exists in the Site Summary Report (see §2). |
| 4 | **Handler** | VERIFIED | `handlePreviewReport` at `AssetComparisonTable.tsx:263-286` calls `generateInspectionBasedReport({ siteName, comparisonResults, stats, companyLogoUrl })` (`:266-271`), then `URL.createObjectURL(result.blob)` (`:273`) and stores `{url, blob, filename, complianceChecks}` in state (`:274-279`). **The same blob feeds both preview and save.** |
| 5 | **Generator (client)** | VERIFIED | `generateInspectionBasedReport` at `assetVerificationReportGenerator.ts:101-416`. **This is the sole generator for this report.** Imports `pdfBars` at `:41` (verified this session): `import { tintedKpiCard, gaugeBar, toneForPct, TONE_TINT } from "./pdfBars";`. |
| 6 | **Data — assets** | VERIFIED | `site_assets` fetched in `AssetVerification.tsx:93-106`; filtered client-side to `asset_category === 'electrical_meter'` at `:150`. `site_assets` has **no `deleted_at` column** (trace: "Asset Verification Data Flow", layer "Asset Fetching"). |
| 7 | **Data — inspections** | VERIFIED (with a data bug) | `inspections` fetched in `AssetVerification.tsx:113-122`, selecting `id, title, subsection_id, json_data` where `site_id = siteId` and `json_data IS NOT NULL`. **Confirmed this session: the query has NO `deleted_at` filter** (the select line and `.not("json_data","is",null)` are the only constraints). Same omission in the public RPC `get_public_site_review` (`supabase/migrations/20260614100000_public_site_review_schematic_assets.sql:64-68`). Soft-deleted inspections therefore contaminate matching. **This is a DATA-correctness bug, orthogonal to "the format looks the same" — see §3 note.** |
| 8 | **Data → comparison** | VERIFIED | `buildComparisonResults` (`assetVerification.ts:160-183`) + `buildInspectionMeterMatches` (`:120-157`); stats derived in `AssetComparisonTable.tsx:120-133`. Logic is sound given clean input. |
| 9 | **pdfmake doc-def (the visual change)** | VERIFIED | At HEAD (read this session, lines confirmed): KPI cards via `tintedKpiCard(...)` ×4 at `:161-164`; tone via `toneForPct(matchRate)` at `:151`; gauge via `gaugeBar(matchRate, TONE_TINT[rateTone].accent)` at `:174`; rate label `Verification rate — ${matchRate}%` at `:173`. The whole block is wrapped in `if (isSectionEnabled('asset-summary'))` at `:144`. Footer rewritten to per-page `${siteName} · Page X of Y` (diff lines `:382-394`). `pdfBars` primitives are **canvas-free / table-based** (verified this session: `pdfBars.ts:4` "canvas-free", `:54/:72/:89/:113` use `table:`+`fillColor`, never `canvas`). |
| 10 | **doc-def assembly** | VERIFIED | `createBaseDocDefinition` / `generatePdfBlob` from `pdfMakeConfig`; `generatePdfBlob` calls `pdfMake.createPdf(...)` in-browser (`pdfMakeConfig.ts:389-406`, per trace). |
| 11 | **Template gateway (hidden gate)** | VERIFIED (table name corrected) | `fetchPDFTemplate('asset_verification')` at `assetVerificationReportGenerator.ts:107`; `isSectionEnabled` at `:110-113` returns `section?.enabled ?? true`. **The trace named the wrong table (`pdf_template_definitions`). The actual table is `pdf_report_templates`** — confirmed this session: `usePDFTemplateGateway.ts:234` and `:359` both `.from("pdf_report_templates")`. |
| 12 | **Preview** | VERIFIED | `DocumentPreviewDialog` imported at `AssetComparisonTable.tsx:24`, mounted at `:666`. Renders the in-memory blob via react-pdf / pdf.js; preview is faithful because it is the **exact same blob** that gets saved (trace: "Document Generation and Preview Flow", layers "In-Memory Preview Dialog" + "Preview Rendering"). |
| 13 | **Save** | VERIFIED | `handleSaveToDocuments` (`AssetComparisonTable.tsx:288-316`) → `savePDFToDocuments({ blob, fileName, siteId, categoryName: getReportCategoryName("asset-verification") })` (`:296-301`) → `site_documents`, category "Asset Verification Reports" (`SiteReports.tsx:48`). Blob uploaded as-is, no re-encode (trace: "Save to Storage"). |
| 14 | **Deploy / serving** | PARTIAL → see §3 | Single authoritative build = Next.js app, Vercel project `wm_compliance` (`.vercel/project.json:1`), domain `insight-linker-app.vercel.app` (`qrBaseUrl.ts:14`). A **separate, orphaned Vite build** exists at `wm-compliance.lovable.app` that does **not** receive these deploys (`qrBaseUrl.ts:11-13` explicit warning; `migration-events-09.json:220-225`). next-pwa `skipWaiting:true` + `clientsClaim:true` (`next.config.mjs:31,42`). **Whether 344661a is actually live on Vercel is runtime-only — not verifiable from the repo.** |

**Chain verdict:** layers 1–13 are VERIFIED in-code as a single, coherent, client-side path that emits the new pdfBars visuals into the document the user previews and saves. Layer 14 (delivery) is the only place where "code is correct but user sees old" can originate.

---

## 2. Does commit 344661a affect what the user actually sees?

### Verdict: **YES — at the code level, conditionally visible at runtime.**

**VERIFIED (in-code):**
- `344661a` is committed at HEAD and pushed to `origin/main` (§0).
- It sits on the **sole live path**: `AssetComparisonTable.tsx:500` → `handlePreviewReport:263` → `generateInspectionBasedReport:101`.
- The diff (read this session) **removes** the old `createKpiDashboard` flat cards and the plain-text `text: 'Verification Rate: ${matchRate}%'`, and **adds** the `tintedKpiCard` ×4 + `gaugeBar` + per-page footer. The old imports `createPageFooter` and `createKpiDashboard` were deleted from the import block.
- The new output is the same blob shown in the pdf.js preview and saved/downloaded → the visual upgrade is **faithful** to what is generated.

**Two caveats that make visibility CONDITIONAL at runtime:**

1. **DB section gate.** The entire new KPI/gauge block is wrapped in `if (isSectionEnabled('asset-summary'))` (`:144`). If a row in `pdf_report_templates` for `report_type='asset_verification'` (default) has a section `id='asset-summary'` with `enabled:false`, the cards+gauge are skipped. Default is enabled, and absence also defaults true (`section?.enabled ?? true`, `:112`). **Disabling it would make the cards DISAPPEAR (a noticeable absence), not show the old format** — so this fits "cards missing" better than "looks the same."

2. **Wrong report.** `SiteSummaryReport.tsx:503` still emits `text: 'Verification Rate: ${assetMetrics.verificationRate}%'` (verified this session) — the exact legacy plain-text style. It was **not** in the 344661a diff. If the user generated the **Site Summary Report** rather than the **Asset Verification tab's** report, "same format" is literally correct and expected.

---

## 3. Ranked root causes for "still looks the same"

Because the in-code path is correct and faithful (§1–§2), the cause almost certainly lives in delivery/observation. None of the top candidates is resolvable from the repo alone.

### RC1 — Deploy carrying 344661a is not actually live (likelihood: HIGH)
- **For:** "deploy includes 344661a" was an explicit *assumption* in the trace ("Whether the production deploy includes commit 344661a (assumed yes, but not runtime-verified)"). A pushed commit guarantees nothing about what Vercel serves. Commit time 2026-06-21 06:46; deploy status is runtime-only.
- **Against:** repo + `vercel.json:4` build config are consistent; app-source typechecks clean; pdfBars tests 10/10 (per critic).
- **How to confirm:** Vercel dashboard / `vercel ls` → production deployment SHA == `344661a`, status Ready/Promoted. OR DevTools → Network → open the `assetVerificationReportGenerator` chunk and grep for new symbol `tintedKpiCard` / `Verification rate —` (present) vs old `createKpiDashboard` / `Verification Rate:` (absent).

### RC2 — Stale service worker / no hard refresh (likelihood: HIGH)
- **For:** next-pwa precaches chunks with revision hashes (`next.config.mjs:28-100`). An already-controlled, un-reloaded tab keeps serving old precached chunks. `skipWaiting` removes the install-wait phase but **does not force an active client to reload** (the trace overstated "activated immediately on reload"). Trace itself lists "stale SW / no hard refresh" as a primary failure mode.
- **Against:** once `sw.js` updates and the page reloads, new chunk hashes = new immutable URLs, so no stale-chunk problem persists.
- **How to confirm:** DevTools → Application → Service Workers → Unregister (or hard-reload Cmd+Shift+R), then regenerate. Compare Cache Storage workbox precache revisions before/after. If the report changes after unregister+reload, this was it.

### RC3 — Wrong report clicked (Site Summary, not Asset Verification) (likelihood: MEDIUM)
- **For:** `SiteSummaryReport.tsx:503` still emits the legacy `Verification Rate: X%` (verified this session); 344661a never touched it. The app has multiple "Generate PDF" buttons.
- **Against:** the complaint names "Asset Verification"; if precise about the tab, they're on the changed generator.
- **How to confirm:** ask exactly which tab/screen + button. If SiteDetail → Dashboard/Site-Summary report rather than the Asset Verification tab's Verification sub-tab, the unchanged format is expected.

### RC4 — Wrong build/domain: lovable Vite build instead of Vercel (likelihood: MEDIUM)
- **For:** repo documents a separate divergent Lovable Vite build (`qrBaseUrl.ts:11-13`); memory notes QR base URL was historically pointed there. If the user has lovable bookmarked, no commit ever reaches them.
- **Against:** memory says `qr_base_url` was flipped to the Vercel URL and lovable is orphaned; Asset Verification may not even exist on lovable.
- **How to confirm:** ask for the exact address-bar URL when clicking Generate PDF. Must be `insight-linker-app.vercel.app` or the intended custom domain — NOT `*.lovable.app`.

### RC5 — DB `pdf_report_templates` row disables `asset-summary` (likelihood: LOW)
- **For:** the new block is wrapped in `isSectionEnabled('asset-summary')` (`:144`); the gateway reads sections from the DB row.
- **Against:** default ships enabled and absence also defaults true (`?? true`, `:112`); disabling would remove the cards (noticeable absence), not reproduce the OLD format.
- **How to confirm:** query prod `select sections from pdf_report_templates where report_type='asset_verification' and is_default=true;` and inspect `id='asset-summary'` for `enabled:false`. OR read browser console `[fetchPDFTemplate] Final config` enabledSections.

### RC6 — Browser/CDN HTTP caching on the custom domain (likelihood: LOW)
- **For:** custom-domain CDN config is not in the repo; trace lists it as an unverified failure mode.
- **Against:** Next.js on Vercel fingerprints chunks with immutable hashes; fresh HTML referencing new hashes defeats chunk staleness. No repo evidence of an external CDN.
- **How to confirm:** `curl -I` the page URL; inspect `cf-cache-status` / cache headers. Compare served-HTML chunk URLs vs latest Vercel manifest. Purge + retest if a CDN is caching the document.

> **Note — "format" vs "data":** the missing `deleted_at` filter (layer 7) is a real data-correctness bug (inflated verified counts / ghost matches), but it is **orthogonal** to "the PDF still has the same format." 344661a does not address it, and it should not be conflated with the formatting complaint unless the user is actually reporting wrong numbers.

---

## 4. Exactly what we must get from the user

**One screenshot + answers to these, in priority order:**

1. **The exact URL** in the address bar when they click Generate PDF. (Disambiguates RC4: `insight-linker-app.vercel.app` / custom domain vs `*.lovable.app`.)
2. **Which button/screen** they used — the Asset Verification tab's **Verification** sub-tab, or the Site Summary Report. (Disambiguates RC3.)
3. **A screenshot of the generated PDF's first content page** (the overview). Tells us at a glance whether they see tinted KPI cards + a gauge bar (new) or flat cards + "Verification Rate: X%" plain text (old), or no cards at all (RC5).
4. Whether they did a **hard refresh / unregistered the SW** after the deploy. (RC2.)

**Runtime checks to run (with the user, or by us against prod):**

- **Vercel:** `vercel ls` / dashboard → production deployment SHA == `344661a`, status Ready. (RC1)
- **Live bundle grep:** DevTools → Network → open the asset-verification chunk → search for `tintedKpiCard` and `Verification rate —` (new) vs `createKpiDashboard` and `Verification Rate:` (old). Definitive proof of which code is live. (RC1/RC2)
- **Service worker:** DevTools → Application → Service Workers → check active SW timestamp; Cache Storage workbox precache revisions; Unregister + hard-reload + regenerate. (RC2)
- **DB template:** `select sections from pdf_report_templates where report_type='asset_verification' and is_default=true;` → check `asset-summary.enabled`. OR console `[fetchPDFTemplate] Final config`. (RC5)
- **CDN (only if custom domain):** `curl -I <url>` → inspect `cf-cache-status` / cache TTL. (RC6)

---

## 5. Remediation plan (NO code yet — gated on confirmed root cause)

1. **If RC1 (deploy not live):** trigger/await a fresh Vercel production deploy of `344661a`; confirm SHA + Ready; re-grep live bundle. No code change.
2. **If RC2 (stale SW):** user-side fix (unregister SW / hard refresh). Optionally, separately, evaluate a deploy-notification "new version available — reload" prompt — but treat as its own scoped task, not part of this report's fix.
3. **If RC3 (wrong report):** decide product intent — either (a) port the same pdfBars KPI/gauge treatment into `SiteSummaryReport.tsx:489-576` so both surfaces match, or (b) clarify to the user which button is the upgraded one. Choice is a design decision for the user, not an automatic code change.
4. **If RC4 (lovable/wrong domain):** redirect the user to `insight-linker-app.vercel.app` / the correct custom domain; revisit whether lovable should be retired/redirected (tracked elsewhere in memory).
5. **If RC5 (DB section disabled):** flip the `asset-summary` section to `enabled:true` in the prod `pdf_report_templates` row (data fix, not code).
6. **If RC6 (CDN):** purge the CDN cache for the document and set/verify a sane TTL; confirm chunk URLs match the latest deploy.
7. **Independent of the above — data-correctness follow-up (separate task):** add `deleted_at IS NULL` filtering to the inspections query (`AssetVerification.tsx:113-122`) and to the public RPC `get_public_site_review` (`...20260614100000...sql:64-68`). This fixes inflated verified counts / ghost public matches but does **not** affect report format; it should not be bundled with the format investigation.

No code is to be written until the user's URL + button + screenshot pin the root cause to one of RC1–RC6.

---

### Inputs cross-check
- Trace's "production deploy includes 344661a" was correctly flagged by it as an assumption — confirmed unverifiable from repo this session.
- Critic correctly caught the **table-name error** in the trace (`pdf_template_definitions` → actually `pdf_report_templates`); verified this session at `usePDFTemplateGateway.ts:234,359`.
- Critic correctly caught the trace's **overstatement of `skipWaiting`** semantics; reflected in RC2.
- Critic correctly flagged the **deleted_at conflation** (data vs format); reflected in §3 note and §5 item 7.
