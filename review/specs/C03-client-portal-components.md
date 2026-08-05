# C03 — client-portal-components

- Unit id: C03
- Slug: client-portal-components
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 5 (matches ./review/unit-files.json "C03")

## Unit header

**Unit purpose.** Components rendered inside the client-facing portal surfaces: an admin-side generator/manager for shareable public access links (`client_access_links`), a read-only COC compliance view with on-device PDF report generation, a presentational unified document browser, and a site summary card linking into site detail. Two of the four components fetch their own data via Supabase + react-query; the other two are pure props-in/JSX-out.

**Module-level observations.**
- None of the four `.tsx` files contains a `"use client"` directive (grep for `use client` in `src/components/client-portal/*.tsx` returns no hits); all use React hooks and browser APIs and are mounted from view components in V02/V03/V04.
- The barrel `index.ts` re-exports only `AccessLinkGenerator` and `SiteOverviewCard` (index.ts:1-2) and has zero importers: grep for `from "@/components/client-portal"` (exact, no trailing path) across `src` returns nothing — every consumer imports the component file directly (`@/components/client-portal/<File>`).
- No test file anywhere in `src` references any of the four components (grep for `AccessLinkGenerator|ClientCocView|ClientPortalDocuments|SiteOverviewCard` across `src/**/*.test.*` returns no hits).
- Data-owning components (AccessLinkGenerator, ClientCocView) share the same error-display pattern: react-query `useQuery` with no `error`/`isError` branch in the JSX, so a failed fetch renders the same empty-state UI as "no data" (AccessLinkGenerator.tsx:410-417; ClientCocView.tsx:125-131).

**External contract.** The rest of the app gets: `AccessLinkGenerator` (full CRUD card over `client_access_links`, used by the Portal Management admin page), `ClientCocView` (COC tab body for the client portal site detail), `ClientPortalDocuments` (documents tab body for both the authenticated client portal and the token-based public review page), and `SiteOverviewCard` (dashboard grid card). Consumers: V02 `src/views/PortalManagement.tsx`, V03 `src/views/ClientPortalSiteDetail.tsx` and `src/views/ClientPortalDashboard.tsx`, V04 `src/views/PublicSiteReview.tsx` (all grep-verified below).

---

## src/components/client-portal/AccessLinkGenerator.tsx

- Purpose: Card-based admin UI that lists, creates, copies, opens, enables/disables, and deletes shareable public access links stored in `client_access_links`.
- Public surface:
  - `AccessLinkGenerator({ siteId?: string, clientId?: string }): JSX.Element` — named export (AccessLinkGenerator.tsx:84) and default export (AccessLinkGenerator.tsx:553). Props interface `AccessLinkGeneratorProps` (AccessLinkGenerator.tsx:79-82).
  - Local (non-exported) interface `AccessLink` describing a row plus joined `clients`/`sites` names (AccessLinkGenerator.tsx:63-77).
- Inputs & outputs:
  - In: optional `siteId`/`clientId` scoping props (both omitted by the sole consumer).
  - Reads: `client_access_links` with embedded `clients:client_id(name, company_name)` and `sites:site_id(name)`, ordered by `created_at` desc, filtered by `site_id` or `client_id` when props given (AccessLinkGenerator.tsx:100-117; queryKey `["access-links", siteId, clientId]` line 98); `sites` `id,name,client_id` ordered by name, `enabled: !siteId` (AccessLinkGenerator.tsx:122-134); `clients` `id,name,company_name` ordered by name, `enabled: !clientId && !siteId` (AccessLinkGenerator.tsx:137-148); `supabase.auth.getUser()` for `created_by` (AccessLinkGenerator.tsx:174).
  - Writes: insert into `client_access_links` with `label, link_type, site_id, client_id, expires_at, created_by` (AccessLinkGenerator.tsx:176-187); update `is_active` (AccessLinkGenerator.tsx:238-242); hard `delete()` by id (AccessLinkGenerator.tsx:218-222).
  - Out: URLs built as `${window.location.origin}/portfolio/${token}` for `link_type === 'client'` and `${window.location.origin}/review/${token}` otherwise (AccessLinkGenerator.tsx:204-205, 255-256, 262-263). Both route directories exist: `src/app/portfolio/[token]` and `src/app/review/[token]` (unit A09, verified by `ls src/app/review src/app/portfolio`).
  - Expiry math: `never` → null; `7d`/`30d`/`90d` → `Date.now()` + fixed ms offsets, ISO string (AccessLinkGenerator.tsx:166-172).
- Dependencies:
  - uses -> `@/integrations/supabase/client` (L19, line 3), `@tanstack/react-query` (line 2), `sonner` toast (line 4), `@/components/ui/{card,button,input,label,badge,select,table,dialog,alert-dialog}` (C01, lines 5-49), `lucide-react` icons (lines 50-60), `date-fns` `format` (line 61).
  - used by <- V02 `src/views/PortalManagement.tsx:6` (import), `:39` (rendered with no props, inside the "access-links" tab) — grep-verified. No other importers.
- Side effects: Supabase network reads/writes listed above; `navigator.clipboard.writeText` on create-success and on copy button (AccessLinkGenerator.tsx:206, 257) — both fire-and-forget, no await/catch; `window.open(..., "_blank")` (AccessLinkGenerator.tsx:263); react-query cache invalidation of `["access-links"]` after each mutation (AccessLinkGenerator.tsx:193, 225, 245); sonner toasts.
- Error handling:
  - Query errors are thrown to react-query (AccessLinkGenerator.tsx:116, 130, 144); no error branch in JSX — a failed list query renders the "No access links created yet" empty state because only `isLoading` and emptiness are checked (AccessLinkGenerator.tsx:408-417).
  - Create mutation: pre-insert validation throws `Error("Please select a site/client ...")` when the resolved target is null (AccessLinkGenerator.tsx:159-164); `onError` logs `console.error` and toasts `error?.message` with fallback text (AccessLinkGenerator.tsx:209-212).
  - Delete/toggle `onError`: `console.error` + fixed-text `toast.error` (AccessLinkGenerator.tsx:229-232, 248-251).
  - Delete is behind an AlertDialog confirmation ("permanently revoke access") (AccessLinkGenerator.tsx:529-547).
- Tests: none found (grep across `src/**/*.test.*` for `AccessLinkGenerator` returns no hits).
- Observed issues:
  - `const isValid = link.is_active && !isExpired;` is computed per row and never referenced — the status badges test `isExpired` and `link.is_active` directly (AccessLinkGenerator.tsx:433 vs 449-464).
  - The clientId-only prop combination is a dead path in the current code: with only `clientId` set, `linkType` stays at its `"site"` default (AccessLinkGenerator.tsx:90), the link-type/target selectors are hidden because visibility requires `!siteId && !clientId` (AccessLinkGenerator.tsx:304), so `resolvedSiteId` is null and `targetMissing` stays true (AccessLinkGenerator.tsx:150-153), leaving the create button permanently disabled (AccessLinkGenerator.tsx:398). No current consumer passes any props (grep-verified: PortalManagement.tsx:39 renders `<AccessLinkGenerator />`).
  - The create-mutation invalidation uses the prefix key `["access-links"]` while the query key includes `siteId, clientId` (AccessLinkGenerator.tsx:98 vs 193) — prefix invalidation, all scoped variants refetch.
  - Clipboard write on create-success happens inside `onSuccess` without user-gesture guarantees and without `catch` (AccessLinkGenerator.tsx:206); the success toast reads "created and copied" regardless of clipboard outcome (AccessLinkGenerator.tsx:207).
- ASSUMED:
  - That `/review/[token]` and `/portfolio/[token]` pages actually redeem `access_token` values (routes exist, verified; their internals belong to A09/V04 and were not re-read here).
  - That `access_count`/`last_accessed_at` are incremented elsewhere (this file only displays them, AccessLinkGenerator.tsx:469, 472-476).

---

## src/components/client-portal/ClientCocView.tsx

- Purpose: Read-only COC tab for a client-portal site: per-subsection compliance pills, a certificate register table, and a client-triggered site COC PDF report download with an embedded site QR.
- Public surface:
  - `ClientCocView({ siteId: string, siteName: string, onPreview: (url: string, name: string) => void }): JSX.Element` — named export (ClientCocView.tsx:33); props interface (ClientCocView.tsx:25-29). No default export.
  - Module-local helper `shortVerdict(v: string | null): string` — takes text before the first em-dash (ClientCocView.tsx:31).
- Inputs & outputs:
  - In: `siteId`, `siteName`, `onPreview` callback.
  - Reads (one `useQuery`, key `["client-coc", siteId]`, `enabled: !!siteId`, ClientCocView.tsx:36-38): parallel `Promise.all` over `subsections` (`id,name,tenant_name,is_coc_required,coc_status,coc_expiry_date`, `site_id` eq, `deleted_at` is null, ordered by name), `coc_db_schedule` (`*`, by site, ordered by `shop_no_raw`), `coc_certificates` (`*`, by site, ordered by `shop_no_raw`) (ClientCocView.tsx:40-46); then `subsection_documents` (`subsection_id,file_name,file_url,coc_type,document_categories(name)`) for the fetched subsection ids (ClientCocView.tsx:52-57).
  - Out: derived `rows` via `buildClientCocSummary(subsections, cocDocs)` filtered to `cocRequired` (ClientCocView.tsx:70-71); PDF report `Blob` downloaded as `"<siteName> - Site COC Report - <yyyy-mm-dd>.pdf"` (ClientCocView.tsx:107-108); calls `onPreview(row.viewUrl, row.viewName)` on the eye button (ClientCocView.tsx:166).
- Dependencies:
  - uses -> `@/integrations/supabase/client` (L19, line 4); `@tanstack/react-query` (line 2); `sonner` (line 3); C01 ui primitives `card,button,badge,skeleton,alert,table` (lines 5-10); `lucide-react` (line 11); L03: `buildClientCocSummary` + types from `@/lib/siteCoc/clientCocSummary` (lines 12-16), `TONE_PILL`, `verdictTone` from `@/lib/siteCoc/statusDisplay` (line 17), `buildCocReportModel` from `@/lib/siteCoc/cocReportModel` (line 18), `buildSiteCocReportDocDef` from `@/lib/siteCoc/siteCocReport` (line 19); L14: `generatePdfBlob` from `@/lib/pdfMakeConfig` (line 20); L12: `downloadBlob` from `@/lib/fileDownload` (line 21); L16: `qrSiteRedirectUrl` from `@/lib/qrBaseUrl` (line 23); external `qrcode` (`QRCode.toDataURL`, line 22).
  - used by <- V03 `src/views/ClientPortalSiteDetail.tsx:23` (import), `:363-367` (rendered in the "coc" TabsContent with `siteId`, `siteName`, `onPreview` wiring into a preview-document state) — grep-verified. No other importers.
- Side effects: 4 Supabase table reads (above); on report download: `QRCode.toDataURL(qrSiteRedirectUrl(siteId), { width: 500, margin: 1, errorCorrectionLevel: 'H' })` (ClientCocView.tsx:101-106), pdfmake blob generation and browser download via `downloadBlob` (ClientCocView.tsx:107-108); local `generating` state toggled around the export (ClientCocView.tsx:76, 113).
- Error handling:
  - `subsections` query error and `subsection_documents` error are thrown to react-query (ClientCocView.tsx:47, 57). `coc_db_schedule` and `coc_certificates` errors are NOT checked — their results are consumed as `schedRes.data ?? []` / `certRes.data ?? []`, so a failure on either silently yields empty arrays (ClientCocView.tsx:44-45, 66).
  - There is no `isError` branch: on a thrown query error, `data` is undefined and the component renders the "No COC information available for this site yet." Alert (ClientCocView.tsx:125-131).
  - Report generation: QR failure swallowed via `.catch(() => null)` and null passed into the doc-def (ClientCocView.tsx:101-107); any other failure is caught, `console.error` only when `NODE_ENV === "development"`, and toasts "Could not generate the COC report"; `generating` reset in `finally` (ClientCocView.tsx:109-114).
- Tests: none found (grep across `src/**/*.test.*` for `ClientCocView` returns no hits). The imported pure helpers are test-covered inside their own units (L03), not here.
- Observed issues:
  - `coc_db_schedule`/`coc_certificates` read `select("*")` and are consumed as `any[]` (`certificates` cast at ClientCocView.tsx:72, mapped `as any[]` at 87, 93); `subsection_documents` rows are mapped through `(d: any)` (ClientCocView.tsx:58).
  - `buildCocReportModel` is called with `lastImport: null, clientName: null, address: null` hardcoded (ClientCocView.tsx:81-83), so the client-generated report always omits those header fields.
  - `schedule` data is fetched on every mount but only used inside the download handler (ClientCocView.tsx:44, 93-97); nothing in the rendered JSX displays schedule rows.
  - `generatedAt` uses locale-dependent `new Date().toLocaleDateString()` (ClientCocView.tsx:80) while the filename uses ISO `slice(0, 10)` (ClientCocView.tsx:108).
- ASSUMED:
  - That RLS on the four tables permits the client-portal role to read them (not verified here; policies live in D01-D03).
  - That `row.viewName` is non-null whenever `row.viewUrl` is non-null — the render uses `row.viewName!` guarded only by `row.viewUrl` (ClientCocView.tsx:165-166); `buildClientCocSummary` internals belong to L03.

---

## src/components/client-portal/ClientPortalDocuments.tsx

- Purpose: Purely presentational document browser that merges site-level and subsection documents into one list with search, a location filter, and an accordion grouped by category or subsection.
- Public surface:
  - `ClientPortalDocuments(props: ClientPortalDocumentsProps): JSX.Element` — named export (ClientPortalDocuments.tsx:51). No default export.
  - `ClientPortalDocumentsProps` (ClientPortalDocuments.tsx:42-49): `siteDocuments: SiteDocument[]` (`{id, file_name, file_url, category?, category_id?}`, lines 11-17), `siteCategories: SiteDocumentCategory[]` (`{id, name}`, lines 28-31), `subsectionDocuments: SubsectionDocument[]` (`{id, file_name, file_url, subsection_id, subsection_name?, category_name?}`, lines 19-26), `subsections: {id: string; name: string}[]`, `onPreview: (url, name) => void`, `onDownload: (url, name) => void`. Local `UnifiedDocument` shape (lines 33-40).
- Inputs & outputs:
  - In: all data via props; no fetching.
  - Out: invokes `onPreview(doc.file_url, doc.file_name)` / `onDownload(doc.file_url, doc.file_name)` per row (ClientPortalDocuments.tsx:267, 270).
  - Internal state: `searchQuery`, `selectedSubsection` (`"all" | "site-level" | <subsectionId>`), `groupBy` (`"category" | "subsection"`, default `"category"`) (ClientPortalDocuments.tsx:59-61).
  - Derivations: unified list tagging each doc `source: "site" | "subsection"`, resolving site-doc category name via `siteCategories` lookup with fallback `doc.category` then `"Uncategorized"`, and subsection name via `subsections` lookup with fallback `doc.subsection_name` then `"Unknown Subsection"` (ClientPortalDocuments.tsx:64-94); case-insensitive substring search over file/category/subsection names (100-107); subsection filter matches by re-looking-up ids in `subsectionDocuments` (109-118); alphabetical group sort, with `"Site-Level"` forced first in subsection grouping (131-135, 146-155).
- Dependencies:
  - uses -> C01 ui primitives `card,button,input,accordion,badge,select,toggle-group` (lines 2-9), `lucide-react` (line 5), React `useState/useMemo` (line 1). No supabase, no lib imports.
  - used by <- V03 `src/views/ClientPortalSiteDetail.tsx:22` (import), `:379-386` (documents tab; wires `handleDownload` and preview state); V04 `src/views/PublicSiteReview.tsx:30` (import), `:483-490` (same prop wiring on the token-based public review page) — grep-verified. No other importers.
- Side effects: none — no I/O, no network, no storage; only local state and callbacks passed in by the parent.
- Error handling: none present; no failure paths of its own. Empty result set renders a dashed placeholder with either `No documents match "<query>"` or "No documents available" (ClientPortalDocuments.tsx:282-292).
- Tests: none found (grep across `src/**/*.test.*` for `ClientPortalDocuments` returns no hits).
- Observed issues:
  - Accordion `defaultValue={[]}` — every group starts collapsed (ClientPortalDocuments.tsx:229).
  - Row action buttons are `sm:opacity-0 sm:group-hover:opacity-100` — hidden until hover at `sm`+ widths, always visible on mobile (ClientPortalDocuments.tsx:266).
  - The subsection filter identifies subsection docs by scanning `subsectionDocuments` for a matching `id` (ClientPortalDocuments.tsx:113-116) rather than carrying `subsection_id` on `UnifiedDocument`; `AccordionItem` keys and doc keys are group name and `doc.id` respectively (231, 253), so ids shared across the two source arrays would collide as React keys — no dedup exists.
  - This file uses 4-space indentation, unlike the rest of the unit (2-space).
- ASSUMED:
  - That callers pass storage-resolvable `file_url` values suitable for their own preview/download handlers (both consumers pass their own `handleDownload`; not re-verified beyond the call sites cited above).

---

## src/components/client-portal/SiteOverviewCard.tsx

- Purpose: Clickable summary card for one site (image, name, address, type badge, health badge, subsection/snag counts) that links to a site-detail route.
- Public surface:
  - `SiteOverviewCard({ site, stats, score?, scoreLoading?, linkPrefix? }): JSX.Element` — named export (SiteOverviewCard.tsx:33) and default export (SiteOverviewCard.tsx:118).
  - Prop shapes (SiteOverviewCard.tsx:14-31): `site: {id: string; name: string; address?: string; site_type?: string; site_image_url?: string}`, `stats: SiteStats` (`{totalSubsections: number; openSnags: number}`), `score?: SiteScore` (type from `@/lib/siteScores`), `scoreLoading?: boolean`, `linkPrefix?: string` defaulting to `"/client-portal/sites"` (line 33).
- Inputs & outputs:
  - In: all data via props; no fetching.
  - Out: renders `<Link to={`${linkPrefix}/${site.id}`}>` wrapping the whole card (SiteOverviewCard.tsx:35); delegates score display to `<SiteHealthBadge score={score} isLoading={scoreLoading} />` (SiteOverviewCard.tsx:69).
- Dependencies:
  - uses -> `Link` from `@/lib/navigation` (L13, line 1; `navigation.tsx:110` exports it as a forwardRef anchor wrapper); C01 `card`/`badge` (lines 2-3); `SiteHealthBadge` from `@/components/SiteHealthBadge` (C14, line 4; component at SiteHealthBadge.tsx:26); type-only `SiteScore` from `@/lib/siteScores` (L17, line 5; exported at siteScores.ts:20); `lucide-react` (lines 6-12).
  - used by <- V03 `src/views/ClientPortalDashboard.tsx:11` (import), `:283-290` (rendered per site in a grid with `site`, `stats`, `score` from a Map, `scoreLoading`, and a computed `linkPrefix`) — grep-verified. No other importers.
- Side effects: none — presentational; navigation happens through the `Link` component.
- Error handling: none; missing `site_image_url` falls back to a `Building2` icon placeholder (SiteOverviewCard.tsx:41-51); optional `address`/`site_type` conditionally rendered (61-66, 73-77).
- Tests: none found (grep across `src/**/*.test.*` for `SiteOverviewCard` returns no hits). `SiteHealthBadge` itself has a test in C14 per manifest.md:49; that test does not render `SiteOverviewCard`.
- Observed issues:
  - The site id is appended after the entire `linkPrefix` (SiteOverviewCard.tsx:35). The sole consumer passes `linkPrefix={`/client-portal/sites${previewClientId ? `?preview=${previewClientId}` : ''}`}` (ClientPortalDashboard.tsx:289), so in preview mode the built href is `/client-portal/sites?preview=<id>/<siteId>` — the `/<siteId>` segment lands inside the query-string value.
  - `openSnags` is always styled red (`bg-red-100`, `text-red-600`) regardless of value, including 0 (SiteOverviewCard.tsx:96-100).
- ASSUMED:
  - That `/client-portal/sites/[siteId]` is the resolving route for the default prefix (client-portal routes are unit A06; not re-read here).

---

## src/components/client-portal/index.ts

- Purpose: Barrel re-exporting two of the unit's four components.
- Public surface: `export { AccessLinkGenerator } from './AccessLinkGenerator'; export { SiteOverviewCard } from './SiteOverviewCard';` (index.ts:1-2). `ClientCocView` and `ClientPortalDocuments` are not re-exported.
- Inputs & outputs: none beyond the re-exports.
- Dependencies:
  - uses -> `./AccessLinkGenerator`, `./SiteOverviewCard` (both in this unit).
  - used by <- none found (grep-verified: `grep -rn "from ['\"]@/components/client-portal['\"]" src` returns no hits; all four components are imported by full file path).
- Side effects: none.
- Error handling: n/a.
- Tests: none.
- Observed issues: zero importers; the file has no trailing newline (wc -l reports 1 line for 2 export statements, per inventory/08-src-components.md:79 — re-verified via `wc -l`).
- ASSUMED: none.
