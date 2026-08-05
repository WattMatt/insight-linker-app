# A07 — contractor-routes

- Unit id: A07
- Slug: contractor-routes
- Spec mode: full
- Date: 2026-07-29
- Files: 4 (per `review/unit-files.json` key "A07")

## Unit header

**Unit purpose.** The `(contractor)` App Router route group: one client-side layout that wraps every contractor page in the contractor auth guard, plus three 3-line thin-wrapper pages that mount views at `/contractor`, `/contractor/subsections/[subsectionId]`, and `/contractor/inspections/[inspectionId]`. The route group itself contributes no URL segment; the `/contractor` prefix comes from the nested `contractor/` folder inside the group.

**Module-level observations (cross-file, verified).**
- All four files are `"use client"` components (layout.tsx:1, each page.tsx:1). The three pages follow the repo-wide thin-wrapper pattern exactly: import a view, return it, nothing else (3 LOC each, `wc -l` verified).
- Auth gating is done in this layout, not middleware: `git ls-files "src/middleware*"` returns nothing, and the only guard in the group is `ContractorProtectedRoute` at layout.tsx:9.
- No `loading.tsx`, `error.tsx`, or `not-found.tsx` exists in the group — `ls "src/app/(contractor)"` shows only `contractor/` and `layout.tsx`; `ls "src/app/(contractor)/contractor"` shows only `inspections/`, `subsections/`, `page.tsx`. The only loading UI is the layout's inline `<Suspense fallback={<LoadingState variant="full-page" .../>}>` (layout.tsx:17).
- The layout provides no visual chrome (no sidebar/nav — layout.tsx:7-13 renders guard + children only). Contractor chrome comes from inside the mounted views: `ContractorPortal.tsx:12` and `ContractorSubsectionDetail.tsx:11` import `ContractorPortalLayout` (C11), but `InspectionDetail` imports no layout component (`grep -n "Layout" src/views/InspectionDetail.tsx` returns nothing) — so `/contractor/inspections/[inspectionId]` renders without contractor chrome.
- None of the pages receives or forwards route params: every page component takes zero props (each page.tsx:3). The views read segments themselves via `useParams` from `@/lib/navigation` (ContractorSubsectionDetail.tsx:17; InspectionDetail.tsx:102) and query strings via `useSearchParams` (ContractorPortal.tsx:16).
- `/contractor` URLs are an allowed post-login redirect prefix: `src/lib/loginNext.ts:6` (L13) lists `"/contractor"` first in `ALLOWED_PREFIXES`.

**External contract.** The rest of the app gets three authenticated contractor URLs. Access rules are enforced by `ContractorProtectedRoute` (C10, consumed only here — grep-verified sole importer at layout.tsx:5): no session → redirect to `/auth/login?next=<encoded path+search>` (ContractorProtectedRoute.tsx:18-21); role `Admin` with `?preview=` present → allowed through (ContractorProtectedRoute.tsx:22); any other non-`Contractor` role → redirect `/dashboard` (:23); path outside `/contractor` → redirect `/contractor` (:24); then children render inside `OnboardingGate` with an `OrphanResolutionModal` mounted (:27-33). In-app navigation lands on these routes from C10 (`ProtectedRoute.tsx:19`), C11 (`ContractorPortalLayout.tsx:29`), V03, V04, and V05 (details per file below).

---

## src/app/(contractor)/layout.tsx

- Purpose: Route-group layout that wraps all `(contractor)` pages in `ContractorProtectedRoute`, inside a `Suspense` boundary with a full-page loading fallback.
- Public surface: `export default function ContractorGroupLayout({ children }: { children: React.ReactNode })` (layout.tsx:15). Module-private `function ContractorInner({ children }: { children: React.ReactNode })` (layout.tsx:7) exists solely to sit under the Suspense boundary.
- Inputs & outputs: In — `children` supplied by the Next.js App Router. Out — JSX: `Suspense` (fallback `<LoadingState variant="full-page" message="Loading..." />`, layout.tsx:17) around `ContractorProtectedRoute` around `children` (layout.tsx:8-11, 16-20). No tables, buckets, browser storage, or env vars touched in this file.
- Dependencies: uses -> `react` (`Suspense`, layout.tsx:3); `@/components/LoadingState` (C16; named export `LoadingState`, props `variant?: 'spinner' | 'skeleton' | 'full-page'`, `message?: string` — LoadingState.tsx:6-13); `@/components/ContractorProtectedRoute` (C10; default export, ContractorProtectedRoute.tsx:37). used by <- none found as an import (grep-verified: no source file imports `app/(contractor)`); consumed by the Next.js App Router filesystem convention as the shared layout of the `(contractor)` group.
- Side effects: none in this file. (Redirects, role/session/onboarding queries, and the orphan modal are inside `ContractorProtectedRoute` — C10's spec.)
- Error handling: none — no try/catch, no error boundary, no `error.tsx` in the group (verified by directory listing; see module observations). A thrown render error escalates past this layout.
- Tests: none found. `grep -rln "contractor" src --include='*.test.*'` hits only `src/lib/loginNext.test.ts` (tests L13's URL allow-list against `/contractor/...` strings, not this file) and `src/components/fortress/AssetRegister.test.tsx` (fixture field `contractor: "FireCo"`, AssetRegister.test.tsx:24 — unrelated).
- Observed issues: the Suspense boundary sits *above* the guard, and the guard calls `useSearchParams` (ContractorProtectedRoute.tsx:12) — noted as fact; the sibling groups use the same shape (inventory 11-src-app.md:34, re-verified for this file).
- ASSUMED: the `ContractorInner` indirection + Suspense wrapper exists to satisfy Next.js's requirement that `useSearchParams` consumers render under a Suspense boundary during prerendering (not evidenced in-code by any comment).

## src/app/(contractor)/contractor/page.tsx

- Purpose: Thin wrapper mounting the `ContractorPortal` view at URL `/contractor`.
- Public surface: `export default function Page(): JSX.Element` returning `<ContractorPortal />` (page.tsx:3). No props, no params argument.
- Inputs & outputs: In — nothing (page ignores router-provided props). Out — `<ContractorPortal />`. The view, not the page, reads `?preview` via `useSearchParams` (ContractorPortal.tsx:16). No stores/env in this file.
- Dependencies: uses -> `@/views/ContractorPortal` (V03; default export, ContractorPortal.tsx:251). used by <- no importers (grep-verified). URL-level consumers (grep-verified navigations to `"/contractor"`): `src/components/ProtectedRoute.tsx:19` (C10 — Contractor role bounced here from admin routes), `src/components/ContractorProtectedRoute.tsx:24` (C10 — off-prefix path redirect), `src/components/ContractorPortalLayout.tsx:29` (C11 — "Site Overview" nav item), `src/views/Index.tsx:29` (V04), `src/views/auth/useRoleRedirect.ts:29` (V05); prefix whitelisted in `src/lib/loginNext.ts:6` (L13).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none found (see layout.tsx entry for the grep result).
- Observed issues: none at file level.
- ASSUMED: nothing.

## src/app/(contractor)/contractor/subsections/[subsectionId]/page.tsx

- Purpose: Dynamic-segment thin wrapper mounting `ContractorSubsectionDetail` at URL `/contractor/subsections/[subsectionId]`.
- Public surface: `export default function Page(): JSX.Element` returning `<ContractorSubsectionDetail />` (page.tsx:3). No props, no params argument.
- Inputs & outputs: In — nothing directly; the `[subsectionId]` segment is read inside the view via `useParams` (`const { subsectionId } = useParams()`, ContractorSubsectionDetail.tsx:17), and query params (`?preview`, `?tab`) via `useSearchParams` (ContractorSubsectionDetail.tsx:19). Out — `<ContractorSubsectionDetail />`. No stores/env in this file.
- Dependencies: uses -> `@/views/ContractorSubsectionDetail` (V03; default export, ContractorSubsectionDetail.tsx:299). used by <- no importers (grep-verified). URL-level consumers (grep-verified navigations to `/contractor/subsections/…`): `src/views/ContractorPortal.tsx:213` (V03, appends `?preview=` when set), `src/views/ContractorSiteDetail.tsx:239` (V03, same shape), `src/views/PublicSubsection.tsx:79` (V04, appends `?tab=upload`).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none of this file. `src/lib/loginNext.test.ts:6` asserts `safeNext("/contractor/subsections/abc?tab=upload")` survives L13's allow-list — it exercises the URL shape served by this route but imports only `@/lib/loginNext`.
- Observed issues: none at file level.
- ASSUMED: nothing.

## src/app/(contractor)/contractor/inspections/[inspectionId]/page.tsx

- Purpose: Dynamic-segment thin wrapper mounting the shared `InspectionDetail` view at URL `/contractor/inspections/[inspectionId]`.
- Public surface: `export default function Page(): JSX.Element` returning `<InspectionDetail />` (page.tsx:3). No props, no params argument.
- Inputs & outputs: In — nothing directly; the view reads `const { clientId, siteId, subsectionId, inspectionId } = useParams()` (InspectionDetail.tsx:102) plus `useSearchParams` (InspectionDetail.tsx:104). Under this route only `inspectionId` exists as a segment — `clientId`, `siteId`, `subsectionId` are not provided by this path. Out — `<InspectionDetail />`. No stores/env in this file.
- Dependencies: uses -> `@/views/InspectionDetail` (V01; default export, InspectionDetail.tsx:3102). used by <- no importers (grep-verified). URL-level consumer (grep-verified navigation to `/contractor/inspections/…`): `src/views/ContractorSubsectionDetail.tsx:266` (V03, appends `?preview=` when set). The same view is also mounted by two admin routes in A04: `src/app/(admin)/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/inspections/[inspectionId]/page.tsx:2` and `src/app/(admin)/sites/[siteId]/subsections/[subsectionId]/inspections/[inspectionId]/page.tsx:2` (grep-verified).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none found.
- Observed issues: (1) This route mounts the 3,102-LOC admin-unit view (V01) rather than a contractor-specific view, and — unlike the other two contractor pages — that view renders no `ContractorPortalLayout` chrome (grep-verified: `InspectionDetail.tsx` has no "Layout" import or reference). (2) The view destructures four route params of which this route supplies only `inspectionId` (InspectionDetail.tsx:102); how the view behaves with the other three undefined is V01 territory, not asserted here.
- ASSUMED: nothing.
