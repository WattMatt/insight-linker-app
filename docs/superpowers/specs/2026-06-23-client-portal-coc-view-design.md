# Client-Portal COC View — Design

**Date:** 2026-06-23
**Status:** Approved (design); pending implementation plan
**Author:** brainstormed with Claude

## Goal

Make the site-level COC information available to **client users** in the client portal as a **read-only, curated compliance summary**, and close a pre-existing cross-tenant RLS leak on the COC tables as part of the same change.

## Decisions (locked)

1. **Scope = curated compliance summary.** Clients see per-shop COC status, COC-required (Y/N), verdict badge, expiry, and a downloadable COC report. They do **not** see the SANS pass/fail grid, engineer names, source files, or confidence/`reasons` detail on screen.
2. **RLS leak fix is bundled** into this feature's migration (not shipped as a separate standalone patch).
3. **Report download = the existing full report PDF** (the same one admins generate), client-side and download-only — no curated report variant is built. Accepted tradeoff: the on-screen view hides SANS detail but the downloadable PDF contains it; the report is treated as a formal deliverable clients are meant to have in full.

## Background — current state

### Admin Site COC tab
- Lives only in admin `SiteDetail.tsx` via `src/views/site-coc/SiteCocTab.tsx`.
- An Excel-ingestion + document system, scoped per site. Admins import two workbooks (DB Schedule + Verification/SANS) via `useSiteCocImport.ts` → `parseWorkbooks.ts` → `ingest.ts`/`reimport.ts`, which **replace-on-reimport** populate `coc_db_schedule` (one row per shop) and `coc_certificates` (one row per cert, with the SANS matrix stored as a `rules` jsonb).
- Rows auto-match to `subsections` by fuzzy shop/tenant name; admins resolve unmatched shops via a dropdown (`useSiteCoc.ts → resolveShop` / `rerunAutoMatch`).
- Four sub-tabs: **Schedule** (`ScheduleSubTab.tsx`), **Certificates** (`CertificatesSubTab.tsx`), **Verification** SANS grid (`VerificationSubTab.tsx`) — all pure read-only displays — plus **Report** (`ReportSubTab.tsx`) which builds a pdfmake PDF (`cocReportModel.ts` → `siteCocReport.ts`) and **saves** it to `site_documents` under category `"Site COC Reports"`.
- A separate file pool (`SiteCocLoadCard.tsx` / `useSiteCocPool.ts` / `uploadCocFiles.ts` / `poolAssign.ts` / `routeUpload.ts`) lets admins upload COC PDFs + eval reports that auto-link to certs and write `subsection_documents`.
- The compliance verdict is gated in the DB (`subsections.coc_status` + `coc_expiry_date` trigger, migration `20260611160000`); `cocCompliance.ts` / `cocHierarchy.ts` are read-only display helpers.
- All of `src/lib/siteCoc/*` (`cocHierarchy`, `cocCompliance`, `cocReportModel`, `siteCocReport`, `reportKpis`, `statusDisplay`, `sansRules`, `coverage`) are pure functions with **no write side**.

### Client portal
- Clients authenticate via Supabase session, gated by `role='Client'` in `ClientProtectedRoute.tsx`, mapped 1:1 to a `client_id` via `user_clients` (`get_user_client_id()` SECURITY DEFINER, migration `20251017054255`).
- Every client read is scoped at the DB layer by RLS of the form `has_role(auth.uid(),'Client') AND site_id IN (SELECT id FROM sites WHERE client_id = get_user_client_id())`.
- `ClientPortalSiteDetail.tsx` queries `subsections`, `site_documents`, `subsection_documents`, `inspections` with only `.eq('site_id', siteId)` — **no `client_id` filter in app code**; isolation depends entirely on RLS.
- The portal site view currently has 5 tabs (overview, schematic, asset-verification, documents, subsections) and **no COC tab**. Admins can preview a client via `?preview=CLIENT_ID`.
- Established read-only pattern: dedicated lean client components such as `ClientPortalDocuments.tsx` (preview/download, no write surface). This is the precedent we follow.

### Pre-existing cross-tenant leak (to be fixed here)
The three COC tables have `SELECT ... TO authenticated USING (true)` policies (migration `20260619130000`):
- `coc_import_batches`
- `coc_db_schedule`
- `coc_certificates`

Any logged-in client can therefore read **every site's** COC rows via a direct query, even with no COC tab in their portal. This is a live data-isolation bug independent of this feature, and it must be closed before (or as part of) any client COC exposure.

`subsection_documents` (COC/eval files) and `site_documents` (saved report PDF) are **already correctly client-scoped** — no change needed.

## Architecture

A new **lean read-only `ClientCocView`** component, rendered as a **6th tab** in `ClientPortalSiteDetail.tsx`, mirroring the `ClientPortalDocuments` precedent. It imports **zero write modules** — there is no structural path for an import/upload/resolve/save action to leak in. It reuses the pure `src/lib/siteCoc/*` libs so the client's verdict is identical to the admin source of truth.

### Components & data flow
1. Client opens a site in the portal → `ClientPortalSiteDetail` → **COC** tab → `ClientCocView({ siteId })`.
2. `ClientCocView` queries `coc_db_schedule` (shops) + `coc_certificates` (verdicts) with `.eq('site_id', siteId)`. RLS scopes to the client's own site (same pattern as the other client queries in that file).
3. Rows are mapped through `cocHierarchy.ts` / `cocCompliance.ts` / `statusDisplay.ts` into a **curated per-shop summary table**:
   - Shop / tenant name
   - COC required (Y/N)
   - Verdict badge (reusing `statusDisplay` tone/labels)
   - Expiry date
   - "View COC" link → the certificate PDF from `subsection_documents`, opened in the existing **in-app viewer** (never a new tab).
   - (Exact column set to be confirmed against available fields during planning; derived only via the existing libs, no new verdict logic.)
4. **Download COC report** button reuses `cocReportModel.ts` → `siteCocReport.ts` to generate the full PDF **client-side, download-only** — no `handleSave`, no `handleDelete`, no `site_documents` write.

### New / touched files
- **New:** `src/components/client-portal/ClientCocView.tsx`
- **New:** unit test for the curated row mapper (location per repo test convention, e.g. `src/components/client-portal/__tests__/` or a `src/lib/siteCoc` mapper test).
- **Edit:** `src/views/ClientPortalSiteDetail.tsx` — add the 6th COC tab.
- **New migration:** RLS hardening on the three `coc_*` tables (see below).
- **Reused unchanged:** `src/lib/siteCoc/*`, the in-app document viewer.

## RLS migration (bundled)

Replace the broad `USING (true)` SELECT policy on each of `coc_certificates`, `coc_db_schedule`, `coc_import_batches` with a staff policy plus a client-own-site policy. Pattern (repeat per table):

```sql
DROP POLICY "auth read coc_certificates" ON public.coc_certificates;

CREATE POLICY "staff read coc_certificates" ON public.coc_certificates
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'Admin') OR has_role(auth.uid(),'Contractor'));

CREATE POLICY "clients read own site coc_certificates" ON public.coc_certificates
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'Client') AND
    site_id IN (SELECT id FROM public.sites WHERE client_id = public.get_user_client_id())
  );
```

(Exact existing policy names to be confirmed against migration `20260619130000` before writing the DROP.)

**Deploy note:** prod migrations are applied via the Supabase Management API `database/query`, **not** `db push`, due to known schema drift (per project memory). The migration file is still committed for repo history.

## Explicitly excluded from the client view

Not imported into the client bundle / not rendered:
- SANS Verification grid (`VerificationSubTab`)
- Engineer names, source files, confidence / `reasons` fields
- Import & workbook parsing (`useSiteCocImport`, `parseWorkbooks`, `ingest`, `reimport`)
- File-pool upload (`SiteCocLoadCard`, `useSiteCocPool`, `uploadCocFiles`, `poolAssign`, `routeUpload`)
- Manual shop resolution (`resolveShop`, `rerunAutoMatch`)
- Report save / delete (`handleSave`, `handleDelete`) — generate/download only
- Import provenance ("last import" metadata, unmatched shops)

## Error / empty states
- No COC data for the site → friendly empty state ("No COC information available for this site yet").
- Loading / error states mirror `ClientPortalDocuments`.

## Testing & verification
- **Unit:** curated row mapper (schedule + cert → summary row; COC-required logic; verdict + expiry derivation).
- **Security (static):** a grep-assert / review that `ClientCocView` imports no write module from the exclusion list above.
- **Security (RLS):** verify a client session reads only its own site's `coc_*` rows and cannot read another site's (manual / dataCheck — RLS policies aren't unit-testable in vitest).
- Full existing test suite + build green.

## Out of scope
- Curated report-variant PDF (explicitly declined; full report reused).
- Token-scoped public COC page (contradicts the public-RPC privacy intent; not for an authenticated client portal).
- Any change to the admin COC tab behavior.
