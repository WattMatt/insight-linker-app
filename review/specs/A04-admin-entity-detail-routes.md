# A04 — admin-entity-detail-routes

- Unit id: A04
- Slug: admin-entity-detail-routes
- Spec mode: full
- Date: 2026-07-29
- Files: 8

## Unit header

**Unit purpose.** Eight Next.js App Router page files under `src/app/(admin)/` that form the dynamic-segment admin detail routes. They comprise two parallel URL hierarchies — a client-rooted tree (`/clients/[clientId]/…`, 5 files) and a site-rooted tree (`/sites/[siteId]/…`, 3 files) — each file being a three-line client-component wrapper that renders one of five V01 views with zero props.

**Module-level observations (cross-file facts).**

- Every file in the unit is byte-for-byte the same shape: line 1 `"use client";`, line 2 a default import from `@/views/<Name>`, line 3 `export default function Page() { return <View />; }`. No file passes props, reads params, or exports anything besides the default component (all 8 files, each `page.tsx:1-3`).
- The two hierarchies mount the same views at different URL prefixes: `SiteDetail` at both `clients/[clientId]/sites/[siteId]/page.tsx:2` and `sites/[siteId]/page.tsx:2`; `SubsectionDetail` at both `…/subsections/[subsectionId]/page.tsx:2` variants; `InspectionDetail` at both `…/inspections/[inspectionId]/page.tsx:2` variants. `Sites` is mounted here at `clients/[clientId]/sites/page.tsx:2` and additionally at the A03 top-level list route `src/app/(admin)/sites/page.tsx:2`.
- Because pages pass no props, route params reach the views only via Next's params context: all five views (or their hook) call `useParams` from `@/lib/navigation` (L13), a react-router-compat shim over `next/navigation`'s `useParams` (`src/lib/navigation.tsx:42-45`); e.g. `src/views/ClientDetail.tsx:61`, `src/views/Sites.tsx:40`, `src/views/SiteDetail.tsx:54`, `src/views/subsection-detail/useSubsectionDetail.ts:21`, `src/views/InspectionDetail.tsx:102`.
- Under the site-rooted hierarchy, `clientId` is not a URL segment, so `useParams()` yields `clientId === undefined` in the mounted views. The views branch on this: `SiteDetail.tsx:642`, `InspectionDetail.tsx:815,836,2134,2167-2184,2224`, `useSubsectionDetail.ts:550-551`, `src/views/subsection-detail/OverviewTab.tsx:407-409`, and `src/views/subsection-detail/InspectionsTab.tsx:166-168` all build `basePath` with a `clientId ? /clients/… : /sites/…` ternary, so navigation stays inside whichever hierarchy the user entered. However `SiteDetail.tsx:685` (`navigate(\`/clients/${clientId}\`)`), `SiteDetail.tsx:711` (breadcrumb `href=\`/clients/${clientId}\``), and `SiteDetail.tsx:832` (`navigate(\`/clients/${clientId}/sites/${siteId}/subsections/new\`)`) interpolate `clientId` without a fallback, and `SiteDetail.tsx:783,786,834` pass `clientId!` (non-null assertion) as a prop to child components. That code lives in V01, but the condition (undefined `clientId`) is created only by this unit's site-rooted mounts.
- The subsection hook resolves a client id from data as `actualClientId` (`useSubsectionDetail.ts:35`) and prefers it over the URL param when building links (`SubsectionDetail.tsx:56,74-75`), so site-rooted subsection pages can cross back into the client-rooted hierarchy.
- The dynamic subtree contains only `page.tsx` files — no `layout.tsx`, `loading.tsx`, or `error.tsx` anywhere below `clients/` or `sites/` (verified with `find "src/app/(admin)/clients" "src/app/(admin)/sites" -type f`).
- All 8 routes render inside the `(admin)` group layout `src/app/(admin)/layout.tsx` (A03), which wraps children in `Suspense` → `ProtectedRoute` → `SidebarProvider`/`AppSidebar`/`GlobalSearch` header shell (`layout.tsx:10-43`); the pages themselves contain no auth logic.
- The literal string `subsections/new` is captured by the `[subsectionId]` dynamic segment: `SiteDetail.tsx:832` navigates to `…/subsections/new`, and the mounted `SubsectionDetail` view treats `subsectionId === "new"` as a creation form sentinel (`src/views/SubsectionDetail.tsx:35-43`).
- No test file references any of these routes: grep for `(admin)` and `clients/\[clientId\]` across `src/**/*.test.*` returns nothing (grep-verified).

**External contract.** The rest of the app gets eight authenticated admin URLs. Client-rooted: `/clients/:clientId` (ClientDetail), `/clients/:clientId/sites` (Sites, client-filtered), `/clients/:clientId/sites/:siteId` (SiteDetail), `…/subsections/:subsectionId` (SubsectionDetail), `…/inspections/:inspectionId` (InspectionDetail). Site-rooted: `/sites/:siteId`, `/sites/:siteId/subsections/:subsectionId`, `…/inspections/:inspectionId` mounting the same three detail views. In-app producers of these URLs are grep-verified in the per-file sections; the site-rooted shapes are produced by `useGlobalSearch` fallbacks (`src/hooks/useGlobalSearch.ts:106,142-143`), `Dashboard.tsx:379`, `SchematicDiagram.tsx:1116-1117`, the views' own `basePath` ternaries, and `PublicSubsection.tsx:88`.

---

## src/app/(admin)/clients/[clientId]/page.tsx

- Purpose: Mounts the `ClientDetail` view at the admin route `/clients/:clientId`.
- Public surface: `default export function Page(): JSX.Element` — renders `<ClientDetail />` with no props (`page.tsx:3`). No other exports; `"use client"` directive (`page.tsx:1`).
- Inputs & outputs: In — the `clientId` URL segment, captured by the App Router (not read in this file; `ClientDetail` reads it via `useParams()` at `src/views/ClientDetail.tsx:61`). Out — the rendered view. The file itself touches no tables, buckets, storage keys, or env vars.
- Dependencies: uses -> `@/views/ClientDetail` (V01) (`page.tsx:2`). used by <- none found via import (grep-verified: no source file imports this path); consumed by Next.js file-system routing; wrapped by `src/app/(admin)/layout.tsx` (A03). In-app links targeting `/clients/:clientId`: `src/hooks/useGlobalSearch.ts:78` (H03), `src/views/Sites.tsx:188`, `src/views/SiteDetail.tsx:685,711`, `src/views/SubsectionDetail.tsx:74` (V01).
- Side effects: none in this file (pure render delegation).
- Error handling: none in this file; no `error.tsx`/`loading.tsx` in the subtree (find-verified). Failures inside the view are handled by the view (V01 scope).
- Tests: none found (grep-verified across `src/**/*.test.*`).
- Observed issues: none in the file itself.
- ASSUMED: Next.js App Router mounts this component for the `/clients/:clientId` path and supplies `clientId` through the params context consumed by `@/lib/navigation`'s `useParams` — framework behavior, not directly executed during this review.

## src/app/(admin)/clients/[clientId]/sites/page.tsx

- Purpose: Mounts the `Sites` list view at `/clients/:clientId/sites`, i.e. the sites list scoped to one client.
- Public surface: `default export function Page(): JSX.Element` — renders `<Sites />` with no props (`page.tsx:3`); `"use client"` (`page.tsx:1`). No other exports.
- Inputs & outputs: In — `clientId` URL segment. The `Sites` view reads it via `useParams()` (`src/views/Sites.tsx:40`) and uses it to filter the sites query (`Sites.tsx:64-65`, `.eq("client_id", clientId)`), prefill the create-site form (`Sites.tsx:111-112`), and render a client header/breadcrumb (`Sites.tsx:184,188`). Out — rendered view. No stores touched by this file.
- Dependencies: uses -> `@/views/Sites` (V01) (`page.tsx:2`). used by <- none found via import (grep-verified); routed by Next.js; wrapped by A03 layout. The same view is mounted unscoped at `src/app/(admin)/sites/page.tsx:2` (A03). In-app links targeting `/clients/:clientId/sites`: `src/views/Clients.tsx:384`, `src/views/InspectionDetail.tsx:2167` (V01).
- Side effects: none in this file.
- Error handling: none in this file; no route-level error/loading files (find-verified).
- Tests: none found (grep-verified).
- Observed issues: this is the only A04 file that mounts a list view rather than a detail view; the view's client-scoped vs. unscoped behavior is switched solely by whether the `clientId` param exists (`Sites.tsx:63-65`).
- ASSUMED: framework routing behavior as above.

## src/app/(admin)/clients/[clientId]/sites/[siteId]/page.tsx

- Purpose: Mounts the `SiteDetail` view at the client-rooted route `/clients/:clientId/sites/:siteId`.
- Public surface: `default export function Page(): JSX.Element` — renders `<SiteDetail />` with no props (`page.tsx:3`); `"use client"` (`page.tsx:1`).
- Inputs & outputs: In — `clientId` and `siteId` segments; `SiteDetail` reads both via `useParams()` (`src/views/SiteDetail.tsx:54`) and also reads query params via the shim `useSearchParams` (`SiteDetail.tsx:56`). Out — rendered view. No stores touched by this file.
- Dependencies: uses -> `@/views/SiteDetail` (V01) (`page.tsx:2`). used by <- none found via import (grep-verified); routed by Next.js; wrapped by A03 layout. Same view mounted at `src/app/(admin)/sites/[siteId]/page.tsx:2` (this unit). In-app links targeting this URL shape: `src/views/Sites.tsx:322`, `src/views/ClientDetail.tsx:386`, `src/views/Dashboard.tsx:379` (V01), `src/hooks/useGlobalSearch.ts:106` (H03), `src/lib/buildActionHref.ts:15` (L13), `src/views/SubsectionDetail.tsx:75` and `useSubsectionDetail.ts:550-551` (V01/V07), `src/views/InspectionDetail.tsx:2175` (V01).
- Side effects: none in this file.
- Error handling: none in this file. Inside the view, a missing site renders a "Site not found" block with a back button (`SiteDetail.tsx:685`) — view scope.
- Tests: none found (grep-verified).
- Observed issues: none in the file itself.
- ASSUMED: framework routing behavior as above.

## src/app/(admin)/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/page.tsx

- Purpose: Mounts the `SubsectionDetail` view at the client-rooted route `/clients/:clientId/sites/:siteId/subsections/:subsectionId`.
- Public surface: `default export function Page(): JSX.Element` — renders `<SubsectionDetail />` with no props (`page.tsx:3`); `"use client"` (`page.tsx:1`).
- Inputs & outputs: In — `clientId`, `siteId`, `subsectionId` segments; read inside the view's aggregate hook `useParams()` (`src/views/subsection-detail/useSubsectionDetail.ts:21`, V07). The segment value `"new"` is a creation sentinel: the view renders `CreateSubsectionForm` when `subsectionId === "new"` (`src/views/SubsectionDetail.tsx:35-43`), and `SiteDetail.tsx:832` navigates to exactly that URL. Query param `tab` is consumed downstream (e.g. `PublicSubsection.tsx:88` links with `?tab=coc-metering`). Out — rendered view. No stores touched by this file.
- Dependencies: uses -> `@/views/SubsectionDetail` (V01) (`page.tsx:2`); the view immediately delegates to the V07 module (`SubsectionDetail.tsx:9-17,20`). used by <- none found via import (grep-verified); routed by Next.js; wrapped by A03 layout. Same view mounted at `src/app/(admin)/sites/[siteId]/subsections/[subsectionId]/page.tsx:2` (this unit). In-app links targeting this URL shape: `src/components/site/SubsectionList.tsx:199,252,287` (C09), `src/components/site/SchematicDiagram.tsx:1116` (C09), `src/hooks/useGlobalSearch.ts:142` (H03), `src/views/Dashboard.tsx:414`, `src/views/QRCodes.tsx:132` (V01/V02), `src/lib/buildActionHref.ts:16` (L13), `src/views/InspectionDetail.tsx:815,836,2134,2183,2224` (V01).
- Side effects: none in this file.
- Error handling: none in this file; view-level loading spinner and states live in V01/V07 (`SubsectionDetail.tsx:23-32`).
- Tests: none found (grep-verified).
- Observed issues: the `[subsectionId]` dynamic segment doubles as the creation route (`/subsections/new`) — there is no dedicated `subsections/new/page.tsx`; disambiguation happens inside the view (`SubsectionDetail.tsx:35`).
- ASSUMED: framework routing behavior as above.

## src/app/(admin)/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/inspections/[inspectionId]/page.tsx

- Purpose: Mounts the `InspectionDetail` view at the deepest client-rooted route `/clients/:clientId/sites/:siteId/subsections/:subsectionId/inspections/:inspectionId`.
- Public surface: `default export function Page(): JSX.Element` — renders `<InspectionDetail />` with no props (`page.tsx:3`); `"use client"` (`page.tsx:1`).
- Inputs & outputs: In — all four segments; the view reads them via `useParams()` (`src/views/InspectionDetail.tsx:102`) plus query params (`InspectionDetail.tsx:104`). With all of `clientId`/`siteId`/`subsectionId` present, the view's `isContractorPortal` flag is `false` (`InspectionDetail.tsx:106`). Out — rendered view. No stores touched by this file.
- Dependencies: uses -> `@/views/InspectionDetail` (V01) (`page.tsx:2`). used by <- none found via import (grep-verified); routed by Next.js; wrapped by A03 layout. The same view is also mounted by this unit's site-rooted twin and by A07's `src/app/(contractor)/contractor/inspections/[inspectionId]/page.tsx:2`. In-app links targeting this URL shape: `src/views/Inspections.tsx:414-417` (V01), `src/views/subsection-detail/OverviewTab.tsx:407-410` and `InspectionsTab.tsx:166-169` (V07).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none found (grep-verified).
- Observed issues: this route file is the longest path in `src/app` (four nested dynamic segments); it and its site-rooted twin are the only mounts giving `InspectionDetail` its full admin context.
- ASSUMED: framework routing behavior as above.

## src/app/(admin)/sites/[siteId]/page.tsx

- Purpose: Mounts the `SiteDetail` view at the site-rooted route `/sites/:siteId`, without a client segment.
- Public surface: `default export function Page(): JSX.Element` — renders `<SiteDetail />` with no props (`page.tsx:3`); `"use client"` (`page.tsx:1`).
- Inputs & outputs: In — `siteId` segment only; in the view, `useParams()` then yields `clientId === undefined` (`SiteDetail.tsx:54`). Out — rendered view. No stores touched by this file.
- Dependencies: uses -> `@/views/SiteDetail` (V01) (`page.tsx:2`). used by <- none found via import (grep-verified); routed by Next.js; wrapped by A03 layout. In-app producers of the bare `/sites/:siteId` shape are fallback branches: `src/hooks/useGlobalSearch.ts:106` (when `site.client_id` is null), `src/views/Dashboard.tsx:379`, `SiteDetail.tsx:642`, `InspectionDetail.tsx:2176` (all `clientId ? … : /sites/…` ternaries).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none found (grep-verified).
- Observed issues: under this mount the view interpolates the undefined `clientId` into hrefs at `SiteDetail.tsx:685` (`/clients/${clientId}` back button), `:711` (breadcrumb), and `:832` (`/clients/${clientId}/sites/${siteId}/subsections/new`), and passes `clientId!` to children at `:783,786,834`, while `:642` uses a `clientId ? … : …` fallback. The interpolating code is V01's, but the undefined-param condition exists only via this route file and its two site-rooted siblings.
- ASSUMED: framework routing behavior as above.

## src/app/(admin)/sites/[siteId]/subsections/[subsectionId]/page.tsx

- Purpose: Mounts the `SubsectionDetail` view at the site-rooted route `/sites/:siteId/subsections/:subsectionId`.
- Public surface: `default export function Page(): JSX.Element` — renders `<SubsectionDetail />` with no props (`page.tsx:3`); `"use client"` (`page.tsx:1`).
- Inputs & outputs: In — `siteId`, `subsectionId` segments; `clientId` is undefined in `useSubsectionDetail`'s `useParams()` (`useSubsectionDetail.ts:21`). The hook compensates by resolving `actualClientId` from fetched data (`useSubsectionDetail.ts:35`) and prefers it in link building (`SubsectionDetail.tsx:56,74-75`; `useSubsectionDetail.ts:550-551`). Out — rendered view. No stores touched by this file.
- Dependencies: uses -> `@/views/SubsectionDetail` (V01) (`page.tsx:2`), delegating to V07. used by <- none found via import (grep-verified); routed by Next.js; wrapped by A03 layout. In-app producers of this URL shape: `src/views/PublicSubsection.tsx:88` (V04 — public QR landing deep-links here with `?tab=coc-metering`), `src/components/site/SchematicDiagram.tsx:1117` (C09 fallback branch), `src/hooks/useGlobalSearch.ts:143` (H03 fallback branch).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none found (grep-verified).
- Observed issues: this is the only site-rooted route with a non-fallback producer — `PublicSubsection.tsx:88` targets it unconditionally, making it the QR-scan → admin entry path into this hierarchy.
- ASSUMED: framework routing behavior as above.

## src/app/(admin)/sites/[siteId]/subsections/[subsectionId]/inspections/[inspectionId]/page.tsx

- Purpose: Mounts the `InspectionDetail` view at the site-rooted route `/sites/:siteId/subsections/:subsectionId/inspections/:inspectionId`.
- Public surface: `default export function Page(): JSX.Element` — renders `<InspectionDetail />` with no props (`page.tsx:3`); `"use client"` (`page.tsx:1`).
- Inputs & outputs: In — `siteId`, `subsectionId`, `inspectionId` segments; `clientId` is undefined in the view's `useParams()` (`InspectionDetail.tsx:102`). Because `siteId` and `subsectionId` are present, `isContractorPortal` evaluates `false` (`InspectionDetail.tsx:106` — the flag requires all three to be absent). Out — rendered view. No stores touched by this file.
- Dependencies: uses -> `@/views/InspectionDetail` (V01) (`page.tsx:2`). used by <- none found via import (grep-verified); routed by Next.js; wrapped by A03 layout. In-app producers of this URL shape are the `clientId ? … : /sites/…` fallback branches at `src/views/Inspections.tsx:414-416` (when `inspection.sites.client_id` is null), `src/views/subsection-detail/OverviewTab.tsx:407-409`, and `InspectionsTab.tsx:166-168` (when neither `actualClientId` nor `clientId` is set).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none found (grep-verified).
- Observed issues: the view's back-navigation from this mount stays site-rooted via its own ternaries (`InspectionDetail.tsx:815,836,2134,2176,2184,2224`); the breadcrumb "sites list" target at `InspectionDetail.tsx:2167` is client-rooted only and lives behind the same conditional.
- ASSUMED: framework routing behavior as above.
