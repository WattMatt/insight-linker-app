# A06 — client-portal-routes

- Unit id: A06
- Slug: client-portal-routes
- Spec mode: full
- Date: 2026-07-29
- File count: 6

## Unit header

**Unit purpose (as-is).** The `(client-portal)` Next.js App Router route group. It contains one group layout that wraps every client-portal URL in an auth/role guard and the portal chrome, plus five one-line client-component pages that each mount a view from V03 portal-views. Because `(client-portal)` is a route group (parenthesised, not part of the URL), the mounted URLs are `/client-portal`, `/client-portal/calendar`, `/client-portal/sites`, `/client-portal/sites/[siteId]`, and `/client-portal/subsections/[subsectionId]`.

**Module-level observations (cross-file facts).**
- All six files are `"use client"` (line 1 of each). None exports `metadata`, `generateStaticParams`, `loading.tsx`, or `error.tsx`; the directory contains exactly these six files (verified with `find "src/app/(client-portal)" -type f` and `git ls-files`).
- The five pages are structurally identical 3-line wrappers: `"use client"` + one default-import of a V03 view + `export default function Page() { return <View />; }`. No page passes props; the two dynamic pages rely on the mounted view calling `useParams()` itself (src/views/ClientPortalSiteDetail.tsx:30, src/views/ClientPortalSubsectionDetail.tsx:26).
- Auth gating for the whole group happens in the layout via `ClientProtectedRoute` (layout.tsx:10), not in any middleware — `git ls-files src/middleware*` returns nothing (also recorded in review/inventory/11-src-app.md:173).
- No file in this unit touches Supabase, storage, localStorage, or env vars directly; all data access lives in the mounted views/components of other units.

**External contract (what the rest of the app gets from this unit).** Next.js file-system routing consumes these files by convention — no source file imports them (grep-verified per file below). The unit's product is five authenticated client-portal URLs whose every render passes through, in order: `Suspense` fallback (layout.tsx:20) → `ClientProtectedRoute` session/role gate with admin `?preview=` bypass (src/components/ClientProtectedRoute.tsx:16-24, unit C10) → `ClientPortalLayout` sidebar chrome (src/components/ClientPortalLayout.tsx:194, unit C11) → the page's V03 view.

---

## src/app/(client-portal)/layout.tsx

- Purpose: Group layout that wraps all `(client-portal)` routes in a Suspense boundary, the client auth/role guard, and the portal sidebar layout.
- Public surface:
  - `default export ClientPortalGroupLayout({ children }: { children: React.ReactNode }): JSX.Element` (layout.tsx:18).
  - Private helper `ClientPortalInner({ children }: { children: React.ReactNode })` (layout.tsx:8), not exported.
- Inputs & outputs: Input is the routed page element as `children`. Output is `<Suspense fallback={<LoadingState variant="full-page" message="Loading..." />}><ClientProtectedRoute><ClientPortalLayout>{children}</ClientPortalLayout></ClientProtectedRoute></Suspense>` (layout.tsx:19-23). No stores, tables, buckets, localStorage keys, or env vars touched in this file.
- Dependencies:
  - uses -> `react` (`Suspense`, layout.tsx:3); `@/components/LoadingState` (named export, props `variant?/message?/skeletonCount?/className?`, src/components/LoadingState.tsx:5-12 — unit C16 ui-utility-primitives); `@/components/ClientProtectedRoute` (default export, src/components/ClientProtectedRoute.tsx:33 — unit C10 route-guards-auth); `@/components/ClientPortalLayout` (named export, src/components/ClientPortalLayout.tsx:194 — unit C11 layout-navigation).
  - used by <- none found in source (grep-verified: no import of the layout anywhere in src/ or supabase/); consumed by Next.js App Router as the `(client-portal)` group layout by filename convention.
- Side effects: None in this file itself (pure composition). The guard it mounts performs redirects and data fetches, but those live in C10.
- Error handling: None. No error boundary; the only fallback path is the Suspense fallback rendering `LoadingState` while `ClientProtectedRoute`'s hooks (`useSearchParams` etc.) suspend. Unauthenticated/wrong-role handling is delegated to `ClientProtectedRoute`, which returns `<Navigate to="/auth/login?next=…">` when there is no session and `<Navigate to="/dashboard">` when role is neither Client nor previewing Admin (src/components/ClientProtectedRoute.tsx:17-24).
- Tests: None found. `find src -name "*.test.*" -o -name "*.spec.*" | xargs grep -ln "ClientPortal\|client-portal"` returns no hits.
- Observed issues: The route group provides no `error.tsx` or `loading.tsx`; loading UI exists only via the inline Suspense fallback (layout.tsx:20).
- ASSUMED: That Next.js actually mounts this file as the group layout at runtime (convention-based, not import-verified). That `useSearchParams` inside `ClientProtectedRoute` is what makes the Suspense wrapper necessary for static builds — inferred from Next.js behaviour, not from any comment in the file.

## src/app/(client-portal)/client-portal/page.tsx

- Purpose: Route entry for `/client-portal` that renders the client dashboard view.
- Public surface: `default export Page(): JSX.Element` — no props, returns `<ClientPortalDashboard />` (page.tsx:3).
- Inputs & outputs: No inputs (ignores route props entirely). Output is the V03 dashboard view. No stores touched in this file. The mounted view reads the `?preview=` search param and builds preview-aware links (src/views/ClientPortalDashboard.tsx:228, 275, 289, 304, 328).
- Dependencies:
  - uses -> `@/views/ClientPortalDashboard` (default export, src/views/ClientPortalDashboard.tsx:345 — unit V03 portal-views).
  - used by <- none found (grep-verified); mounted by Next.js file-system routing at `/client-portal`.
- Side effects: None in this file.
- Error handling: None in this file; any failure surfaces from the view or the layout guard above it.
- Tests: None found (same grep as layout.tsx).
- Observed issues: None.
- ASSUMED: URL mapping `/client-portal` follows from the route-group convention; not runtime-verified.

## src/app/(client-portal)/client-portal/calendar/page.tsx

- Purpose: Route entry for `/client-portal/calendar` that renders the client calendar view.
- Public surface: `default export Page(): JSX.Element` — no props, returns `<ClientPortalCalendar />` (page.tsx:3).
- Inputs & outputs: No inputs. Output is the V03 calendar view. No stores touched in this file.
- Dependencies:
  - uses -> `@/views/ClientPortalCalendar` (default export, src/views/ClientPortalCalendar.tsx:256 — unit V03 portal-views).
  - used by <- none found (grep-verified); mounted by Next.js file-system routing.
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: None.
- ASSUMED: URL mapping as above.

## src/app/(client-portal)/client-portal/sites/page.tsx

- Purpose: Route entry for `/client-portal/sites` that renders the client sites list view.
- Public surface: `default export Page(): JSX.Element` — no props, returns `<ClientPortalSites />` (page.tsx:3).
- Inputs & outputs: No inputs. Output is the V03 sites-list view, which itself links onward to `/client-portal/sites/[siteId]` (src/views/ClientPortalSites.tsx:164). No stores touched in this file.
- Dependencies:
  - uses -> `@/views/ClientPortalSites` (default export, src/views/ClientPortalSites.tsx:179 — unit V03 portal-views).
  - used by <- none found (grep-verified); mounted by Next.js file-system routing.
- Side effects: None in this file.
- Error handling: None in this file.
- Tests: None found.
- Observed issues: An untracked duplicate `src/views/ClientPortalSites 2.tsx` exists in the working tree (git status; grep hit at line 159 of that file). The import specifier `@/views/ClientPortalSites` resolves to `ClientPortalSites.tsx`, not the " 2" copy; the duplicate itself belongs to V03's directory, not this unit.
- ASSUMED: URL mapping as above.

## src/app/(client-portal)/client-portal/sites/[siteId]/page.tsx

- Purpose: Dynamic route entry for `/client-portal/sites/[siteId]` that renders the client site-detail view.
- Public surface: `default export Page(): JSX.Element` — no props (ignores the `params` page prop), returns `<ClientPortalSiteDetail />` (page.tsx:3).
- Inputs & outputs: The `siteId` URL segment is the effective input, but this file does not read or forward it — the mounted view obtains it via `useParams()` from `@/lib/navigation` (src/views/ClientPortalSiteDetail.tsx:2, 30 — navigation wrapper is unit L13 app-platform-helpers). No stores touched in this file.
- Dependencies:
  - uses -> `@/views/ClientPortalSiteDetail` (default export, src/views/ClientPortalSiteDetail.tsx:457 — unit V03 portal-views).
  - used by <- none found (grep-verified); mounted by Next.js file-system routing.
- Side effects: None in this file.
- Error handling: None in this file; invalid/unknown `siteId` handling happens inside the view (e.g. its back-link to `/client-portal/sites`, src/views/ClientPortalSiteDetail.tsx:178).
- Tests: None found.
- Observed issues: The dynamic param crosses the file boundary implicitly (router context) rather than through the page's props; the wrapper contains no reference to `siteId` at all.
- ASSUMED: URL mapping as above; that the `useParams()` shim in L13 reads the same `[siteId]` segment Next provides (verified only to the extent of the view's destructuring at src/views/ClientPortalSiteDetail.tsx:30).

## src/app/(client-portal)/client-portal/subsections/[subsectionId]/page.tsx

- Purpose: Dynamic route entry for `/client-portal/subsections/[subsectionId]` that renders the client subsection-detail view.
- Public surface: `default export Page(): JSX.Element` — no props (ignores the `params` page prop), returns `<ClientPortalSubsectionDetail />` (page.tsx:3).
- Inputs & outputs: The `subsectionId` URL segment is the effective input; not read or forwarded here — the view obtains it via `useParams()` (src/views/ClientPortalSubsectionDetail.tsx:2, 26). No stores touched in this file.
- Dependencies:
  - uses -> `@/views/ClientPortalSubsectionDetail` (default export, src/views/ClientPortalSubsectionDetail.tsx:575 — unit V03 portal-views).
  - used by <- none found (grep-verified); mounted by Next.js file-system routing.
- Side effects: None in this file.
- Error handling: None in this file; the view handles its own redirect/back navigation (e.g. `navigate(`/client-portal/sites/${subsection.site_id}…`)`, src/views/ClientPortalSubsectionDetail.tsx:165).
- Tests: None found.
- Observed issues: Same implicit-param pattern as the `[siteId]` page.
- ASSUMED: URL mapping as above.
