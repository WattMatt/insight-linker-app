# A03 — admin-shell-and-list-routes

- Unit id: A03
- Slug: admin-shell-and-list-routes
- Spec mode: full
- Date: 2026-07-29
- Files: 15 (per review/unit-files.json "A03")

## Unit header

**Unit purpose.** This unit is the `(admin)` route group's shared shell plus its 14 top-level (non-dynamic) page routes. The layout mounts the authenticated admin chrome — `ProtectedRoute` guard, sidebar, header with global search — and every page is a zero-prop thin wrapper that renders one view component from `src/views/` (V01/V02). The route group name `(admin)` contributes no URL segment, so these pages serve at `/calendar`, `/clients`, `/dashboard`, etc. (ASSUMED: Next.js route-group convention).

**Module-level observations (cross-file, verified).**
- All 15 files are `"use client"` components (line 1 of every file). None exports `metadata`, `revalidate`, or any other route-segment config.
- 13 of the 14 pages follow the identical 3-line shape: `"use client"; import X from "@/views/X"; export default function Page() { return <X />; }`. The 14th, `site-assignments/page.tsx`, has the same shape but imports the same `PortalManagement` view already mounted by `portal-management/page.tsx` — two URLs render one view (site-assignments/page.tsx:2-3; portal-management/page.tsx:2-3).
- No page in this unit passes props, reads params, or wraps in Suspense; all rendering logic lives in the imported views (V01: Calendar, Clients, Dashboard, Inspections, Sites; V02: OfflineReview, PDFTemplateTestDashboard, PortalManagement, MyProfile, QRActivity, QRCodes, Settings, Users — unit membership per review/unit-files.json).
- No `loading.tsx`, `error.tsx`, `template.tsx`, or `not-found.tsx` exists anywhere under `src/app/(admin)/` — the directory contains only `layout.tsx` and 26 `page.tsx` files (verified by `find "src/app/(admin)" -type f`; the 8 dynamic-segment pages are unit A04 and the 4 inspection-templates pages are A05).
- Auth gating happens in this client-side layout, not in middleware: `git ls-files src/middleware*` returns nothing.
- No file in `src` or `supabase` imports any of these 15 files (grep for `(admin)` across `src`/`supabase` `.ts`/`.tsx`: zero hits) — they are mounted only by the App Router file convention (ASSUMED). "used by <-" lines below therefore list grep-verified *URL-string* consumers (links/`navigate()` calls targeting the route's path).
- Three routes have zero in-app URL references: `/users`, `/offline-review`, `/pdf-template-tests` (grep for quoted `/users`, `/offline-review`, `/pdf-template-tests` prefixes across src: no hits outside `src/app/(admin)` itself). `AppSidebar`'s menu (src/components/AppSidebar.tsx:42-50) lists only Dashboard, Calendar, Clients, QR Codes, QR Activity, Inspection Templates, Settings — no entries for Sites, Inspections, Users, Portal Management, Site Assignments, Offline Review, or PDF Template Tests.
- No test file references any file in this unit (grep for `AdminLayout` / `(admin)` in `*.test.ts(x)`: zero hits).

**External contract.** The rest of the app gets: (1) an authenticated admin shell at every top-level admin URL — session required, Contractor/Client roles redirected out, onboarding gated (via C10 `ProtectedRoute`, mounted at layout.tsx:12); (2) fourteen stable URL paths (`/calendar`, `/clients`, `/dashboard`, `/inspections`, `/offline-review`, `/pdf-template-tests`, `/portal-management`, `/profile`, `/qr-activity`, `/qr-codes`, `/settings`, `/site-assignments`, `/sites`, `/users`) that navigation code in C10, C11, C14, L13, V01, V02, V04, and V05 targets as string literals.

---

## src/app/(admin)/layout.tsx

- Purpose: Client-side layout for the `(admin)` route group that wraps all admin pages in the auth guard, sidebar shell, and header with global search.
- Public surface: `export default function AdminLayout({ children }: { children: React.ReactNode })` (layout.tsx:37); private helper `AdminInner({ children }: { children: React.ReactNode })` (layout.tsx:10, not exported).
- Inputs & outputs: In — `children` (the matched page). Out — JSX tree: `Suspense` (fallback `<LoadingState variant="full-page" message="Loading..." />`, layout.tsx:39) → `ProtectedRoute` → `SidebarProvider defaultOpen={true}` → flex row of `AppSidebar` + `<main>` containing a sticky header (`SidebarTrigger`, static `<h1>Electrical Compliance</h1>`, `GlobalSearch`) and a scrollable content div with `WebkitOverflowScrolling: "touch"` inline style (layout.tsx:12-33). No stores, tables, buckets, localStorage keys, or env vars touched directly in this file.
- Dependencies: uses -> `react` (`Suspense`, layout.tsx:3); `@/components/ui/sidebar` `SidebarProvider`, `SidebarTrigger` (layout.tsx:4, unit C01); `@/components/AppSidebar` (layout.tsx:5, C11); `@/components/GlobalSearch` (layout.tsx:6, C11); `@/components/LoadingState` (layout.tsx:7, C16); `@/components/ProtectedRoute` (layout.tsx:8, C10). used by <- none found via import (grep-verified: no `(admin)` import paths in src/supabase); mounted by the App Router as the `(admin)` group layout (ASSUMED).
- Side effects: None in this file itself. Via its mounted `ProtectedRoute` dependency (C10): unauthenticated sessions are redirected to `/auth/login?next=<encoded path>`, role `Contractor` to `/contractor`, role `Client` to `/client-portal`, and children render inside `OnboardingGate` (src/components/ProtectedRoute.tsx:15-26).
- Error handling: None. No try/catch, no error boundary in this file; the only fallback is the Suspense `LoadingState` for suspension, not errors (layout.tsx:39).
- Tests: None found (grep for `AdminLayout` in `*.test.*`: zero hits).
- Observed issues: The `<h1>` text is the hardcoded string "Electrical Compliance" on every admin page (layout.tsx:19). Guarding is client-side only — the file is `"use client"` (layout.tsx:1) and no `src/middleware.ts` exists (git ls-files verified).
- ASSUMED: Next.js applies this layout to all pages in the `(admin)` group by file convention; the `Suspense` wrapper exists to satisfy `useSearchParams`-style CSR bailouts in descendants (not stated in code).

## src/app/(admin)/calendar/page.tsx

- Purpose: Thin route wrapper serving the `Calendar` view at `/calendar`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<Calendar />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/Calendar` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/Calendar` (page.tsx:2, unit V01). used by <- URL `/calendar`: src/components/AppSidebar.tsx:44 (C11 menu item). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: None beyond the unit-level pattern.
- ASSUMED: Route resolves to `/calendar` (route-group convention).

## src/app/(admin)/clients/page.tsx

- Purpose: Thin route wrapper serving the `Clients` view at `/clients`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<Clients />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/Clients` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/Clients` (page.tsx:2, unit V01). used by <- URL `/clients`: src/components/AppSidebar.tsx:45 (C11); src/lib/loginNext.ts:6 allowed-redirect prefix (L13); src/views/Sites.tsx:187, src/views/Dashboard.tsx:262, src/views/SiteDetail.tsx:711, src/views/ClientDetail.tsx:195 and 213, src/views/SubsectionDetail.tsx:73 (all V01). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found for this file. (src/lib/loginNext.test.ts exercises the `/clients` prefix only as an L13 input string, not this route file.)
- Observed issues: None beyond the unit-level pattern.
- ASSUMED: Route resolves to `/clients`.

## src/app/(admin)/dashboard/page.tsx

- Purpose: Thin route wrapper serving the `Dashboard` view at `/dashboard`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<Dashboard />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/Dashboard` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/Dashboard` (page.tsx:2, unit V01). used by <- URL `/dashboard`: src/components/AppSidebar.tsx:43 and src/components/Breadcrumb.tsx:27 (C11); src/components/ClientProtectedRoute.tsx:24 and src/components/ContractorProtectedRoute.tsx:23 as wrong-role redirect target (C10); src/lib/loginNext.ts:6 allowed prefix and src/lib/loginNext.test.ts:7 (L13); src/views/Index.tsx:31,37 (V04); src/views/auth/useRoleRedirect.ts:31 (V05). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found for this file. (loginNext.test.ts:7 asserts `safeNext("/dashboard")` returns `"/dashboard"` — a test of L13, using this route's path string.)
- Observed issues: `/dashboard` is the most-referenced route in the app (8 distinct consumer files) yet the route file itself is the generic 3-line wrapper — all landing/redirect semantics live in the consumers.
- ASSUMED: Route resolves to `/dashboard`.

## src/app/(admin)/inspections/page.tsx

- Purpose: Thin route wrapper serving the `Inspections` view at `/inspections`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<Inspections />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/Inspections` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/Inspections` (page.tsx:2, unit V01). used by <- URL `/inspections`: src/views/InspectionDetail.tsx:817 and 838 (`navigate('/inspections')`, V01). Not present in AppSidebar's menu (src/components/AppSidebar.tsx:42-50). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: The route is reachable in-app only via two `navigate` calls inside InspectionDetail (post-delete/exit paths); there is no menu or breadcrumb link to it.
- ASSUMED: Route resolves to `/inspections`; that the flat list at `/inspections` is distinct in content from the nested inspection-detail routes (A04) — content belongs to the V01 `Inspections` view, not opened for this spec.

## src/app/(admin)/offline-review/page.tsx

- Purpose: Thin route wrapper serving the `OfflineReview` view at `/offline-review`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<OfflineReview />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/OfflineReview` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/OfflineReview` (page.tsx:2, unit V02). used by <- none found (grep-verified: no quoted `/offline-review` URL string anywhere in src outside this file; the string `"offline-review"` at src/views/OfflineReview.tsx:41 is a Supabase edge-function name, F05, not this route).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: Zero in-app navigation references — the page is reachable only by manually entering the URL.
- ASSUMED: Route resolves to `/offline-review`.

## src/app/(admin)/pdf-template-tests/page.tsx

- Purpose: Thin route wrapper serving the `PDFTemplateTestDashboard` view at `/pdf-template-tests`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<PDFTemplateTestDashboard />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/PDFTemplateTestDashboard` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/PDFTemplateTestDashboard` (page.tsx:2, unit V02). used by <- none found (grep-verified: no `/pdf-template-tests` URL string anywhere in src outside this file).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: Zero in-app navigation references — reachable only by direct URL entry.
- ASSUMED: Route resolves to `/pdf-template-tests`.

## src/app/(admin)/portal-management/page.tsx

- Purpose: Thin route wrapper serving the `PortalManagement` view at `/portal-management`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<PortalManagement />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/PortalManagement` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/PortalManagement` (page.tsx:2, unit V02). used by <- URL `/portal-management`: src/components/ClientPortalLayout.tsx:76 and src/components/ContractorPortalLayout.tsx:71 (C11); src/views/Users.tsx:692 (`<a href="/portal-management" target="_blank">`, V02). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: Shares its view component with `/site-assignments` (see that file's section) — two admin URLs mount the identical `PortalManagement` view.
- ASSUMED: Route resolves to `/portal-management`.

## src/app/(admin)/profile/page.tsx

- Purpose: Thin route wrapper serving the `MyProfile` view at `/profile`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<MyProfile />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/MyProfile` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/MyProfile` (page.tsx:2, unit V02). used by <- URL `/profile`: src/components/AppSidebar.tsx:210 (`NavLink`), src/components/ClientPortalLayout.tsx:173, src/components/ContractorPortalLayout.tsx:159 (all C11). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: `/profile` is linked from all three portal layouts (admin sidebar, client portal, contractor portal) but lives inside the `(admin)` group, so the C10 `ProtectedRoute` in this unit's layout redirects Contractor/Client roles away from it (src/components/ProtectedRoute.tsx:19-20) — Contractor and Client users clicking their layouts' profile links land in the role-redirect path, not this page. Stated as observed wiring only.
- ASSUMED: Route resolves to `/profile`.

## src/app/(admin)/qr-activity/page.tsx

- Purpose: Thin route wrapper serving the `QRActivity` view at `/qr-activity`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<QRActivity />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/QRActivity` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/QRActivity` (page.tsx:2, unit V02). used by <- URL `/qr-activity`: src/components/AppSidebar.tsx:47 (C11); src/lib/loginNext.ts:6 allowed prefix (L13). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: None beyond the unit-level pattern.
- ASSUMED: Route resolves to `/qr-activity`.

## src/app/(admin)/qr-codes/page.tsx

- Purpose: Thin route wrapper serving the `QRCodes` view at `/qr-codes`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<QRCodes />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/QRCodes` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/QRCodes` (page.tsx:2, unit V02). used by <- URL `/qr-codes`: src/components/AppSidebar.tsx:46 (C11); src/lib/loginNext.ts:6 allowed prefix (L13); src/views/Dashboard.tsx:270 (V01). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: None beyond the unit-level pattern.
- ASSUMED: Route resolves to `/qr-codes`.

## src/app/(admin)/settings/page.tsx

- Purpose: Thin route wrapper serving the `Settings` view at `/settings`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<Settings />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/Settings` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/Settings` (page.tsx:2, unit V02). used by <- URL `/settings`: src/components/AppSidebar.tsx:49 (C11, menu item flagged `adminOnly: true`). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found for this file. (src/lib/loginNext.test.ts:16 asserts `safeNext("/settings")` returns `null` — i.e. `/settings` is deliberately NOT an allowed login-redirect prefix in L13.)
- Observed issues: The sidebar entry is `adminOnly: true` (AppSidebar.tsx:49), but this route file contains no role check (page.tsx:1-3) and the group layout's `ProtectedRoute` only excludes Contractor/Client roles (src/components/ProtectedRoute.tsx:19-20); any further gating would live in the V02 `Settings` view (not opened for this spec).
- ASSUMED: Route resolves to `/settings`.

## src/app/(admin)/site-assignments/page.tsx

- Purpose: Thin route wrapper serving the `PortalManagement` view — the same view as `/portal-management` — at `/site-assignments`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<PortalManagement />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/PortalManagement` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/PortalManagement` (page.tsx:2, unit V02). used by <- URL `/site-assignments`: src/components/RecentAssignmentsWidget.tsx:110 (`navigate('/site-assignments')`, C14). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: Duplicate mount — this file and portal-management/page.tsx:2-3 both render `PortalManagement`, giving one view two live admin URLs; the only in-app link to this URL variant is the C14 dashboard widget.
- ASSUMED: Route resolves to `/site-assignments`.

## src/app/(admin)/sites/page.tsx

- Purpose: Thin route wrapper serving the `Sites` view at `/sites`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<Sites />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/Sites` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/Sites` (page.tsx:2, unit V01). used by <- URL `/sites`: src/lib/loginNext.ts:6 allowed prefix (L13); src/views/Dashboard.tsx:266 and src/views/InspectionDetail.tsx:2168 (V01). Not present in AppSidebar's menu (src/components/AppSidebar.tsx:42-50). No import-level consumers (grep-verified).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: The same `Sites` view is also mounted at `/clients/[clientId]/sites` by A04 (src/app/(admin)/clients/[clientId]/sites/page.tsx, per that unit) — this file is the un-scoped variant of that pair. No sidebar entry.
- ASSUMED: Route resolves to `/sites`.

## src/app/(admin)/users/page.tsx

- Purpose: Thin route wrapper serving the `Users` view at `/users`.
- Public surface: `export default function Page(): JSX` — zero props, returns `<Users />` (page.tsx:3).
- Inputs & outputs: No inputs read; renders `@/views/Users` with no props. No stores touched in this file.
- Dependencies: uses -> `@/views/Users` (page.tsx:2, unit V02). used by <- none found (grep-verified: no quoted `/users` URL prefix anywhere in src outside this file; the `Users` identifier in AppSidebar.tsx is a lucide-react icon import, not a link).
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: Zero in-app navigation references — the user-management page is reachable only by direct URL entry, while the `Users` view itself links outward to `/portal-management` (src/views/Users.tsx:692).
- ASSUMED: Route resolves to `/users`.
