# A09 — public-share-routes

- Unit id: A09
- Slug: public-share-routes
- Spec mode: full
- Date: 2026-07-29
- File count: 10 (matches `review/unit-files.json` key "A09")

## Unit header

**Unit purpose.** The unauthenticated URL surface of the app: QR-code landing routes (`/public/...`), token-gated share routes (`/review/[token]`, `/portfolio/[token]`), the PDF download-handoff route (`/download/[requestId]`), and the PWA install guide (`/install`). Nine of the ten files are 3-line `"use client"` wrappers that mount a view from V04 (public-and-entry-views); the tenth (`qr-retired`) is a self-contained static page.

**Module-level observations (cross-file facts).**
- None of the ten route segments contains a `layout.tsx`, `error.tsx`, or `loading.tsx` — `find src/app/public src/app/portfolio src/app/review src/app/download src/app/install -type f` returns only the ten `page.tsx` files. All pages are therefore wrapped solely by the root layout (`src/app/layout.tsx:45` → `<Providers>{children}</Providers>`, A01).
- No auth guard wraps these routes. The globally mounted `SessionWatcher` (`src/app/providers.tsx:23`, C10) returns early when no session exists (`src/components/SessionWatcher.tsx:79-82`), so anonymous visitors are not redirected; when a session does exist and the auto-logout time fires, it navigates to `/auth/login` (`SessionWatcher.tsx:63`) regardless of which route is showing.
- Two pairs of routes mount the same view: `PublicSubsection` at both `/public/subsections/[subsectionId]` and `/public/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]`; `PublicSiteReview` at both `/review/[token]` and `/portfolio/[token]/site/[siteId]`.
- All ten files are `"use client"`; none exports `metadata`, `generateStaticParams`, or any server-side function. Route params reach the views via `useParams` from `src/lib/navigation.tsx:42` (L13), not via page props — no page passes props to its view.
- No test file imports any file in this unit (grep across `src/**/*.test.ts{,x}` for `app/public|app/portfolio|app/review|app/download|app/install`: zero hits).
- No `middleware.ts` exists at repo root or in `src/` (ls-verified), so nothing rewrites or guards these paths at the edge of the Next app itself.

**External contract.** This unit contributes exactly six public URL shapes to the app: QR landings (`/public/subsections/:id`, its nested legacy twin, `/public/sites/:siteId/register`, `/public/qr-retired`), token shares (`/review/:token`[/subsection/:id], `/portfolio/:token`[/site/:siteId]), plus `/download/:requestId` and `/install`. Inbound URL producers, all grep-verified: `src/lib/qrBaseUrl.ts:26` (L16) and the `qr-redirect` edge function (`supabase/functions/qr-redirect/index.ts:71,87,102,108-110`, F02) for the `/public/*` shapes; `AccessLinkGenerator` (`src/components/client-portal/AccessLinkGenerator.tsx:204-205,255-256,262-263`, C03) for `/review/:token` and `/portfolio/:token`; V04 views and `SchematicDiagram` (`src/components/site/SchematicDiagram.tsx:1109`, C09) for the deeper share URLs. All data fetching happens inside the mounted V04 views; the route files themselves touch no store.

---

## src/app/public/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/page.tsx
- Purpose: Nested-path variant of the public subsection QR landing; mounts the same view as `/public/subsections/[subsectionId]`.
- Public surface: default export `PublicSubsectionNestedPage(): JSX.Element` (page.tsx:3), no props. `"use client"` (page.tsx:1).
- Inputs & outputs: route params `clientId`, `siteId`, `subsectionId` are available from the URL; the mounted view reads only `subsectionId` via `useParams` (`src/views/PublicSubsection.tsx:102`) — `clientId` and `siteId` are read by nothing. Output: renders `<PublicSubsection />`. No stores touched by this file.
- Dependencies: uses -> `@/views/PublicSubsection` (page.tsx:2, unit V04). used by <- no module imports (grep-verified); mounted by the Next.js App Router. Zero in-repo producers of this URL shape: `grep -rn "public/clients" src supabase --include=*.ts --include=*.tsx --include=*.sql` returns nothing. The shape appears only in docs (`docs/APPLICATION_SPEC.md`, `docs/system-reference/04-routes/public-token-and-root.md`, `docs/system-reference/03-auth-and-access/token-systems.md`, `docs/system-reference/06-flows/qr-access.md`).
- Side effects: none in this file (delegated to the view).
- Error handling: none in this file; no error boundary in the segment (root-layout tree applies).
- Tests: none import this file (grep-verified).
- Observed issues: duplicate URL shape — same view as `src/app/public/subsections/[subsectionId]/page.tsx:2`; the two extra params (`clientId`, `siteId`) are consumed by nothing; no code or edge function builds this URL (the `qr-redirect` function's legacy parser handles Firebase *name*-based paths `/clients/ClientName/SiteName/SubsectionName`, `supabase/functions/qr-redirect/index.ts:162`, which is a different shape and redirects to the flat `/public/subsections/<id>` form, index.ts:87).
- ASSUMED: the route exists for backward compatibility with QR codes printed with the old nested URL shape — no repo evidence states this.

## src/app/public/qr-retired/page.tsx
- Purpose: Static landing page telling a scanner that the QR code they scanned has been retired.
- Public surface: default export `QrRetiredPage(): JSX.Element` (page.tsx:4), no props. `"use client"` (page.tsx:1).
- Inputs & outputs: no inputs (no params, no fetching). Output: a centered Card with heading "This QR code has been retired" (page.tsx:9) and body text "Please contact Watson Mattheus for the current compliance status of this item." (page.tsx:11). No stores touched.
- Dependencies: uses -> `Card`, `CardContent` from `@/components/ui/card` (page.tsx:2, unit C01). used by <- no module imports (grep-verified); target of a 302 from the `qr-redirect` edge function when a subsection has `qr_disabled` set: `supabase/functions/qr-redirect/index.ts:71` (`Location: ${appOrigin}/public/qr-retired`, unit F02). The compiled chunk also appears in the generated service-worker precache manifest (`public/sw.js`, build artifact, P04).
- Side effects: none.
- Error handling: n/a — static markup only.
- Tests: none (grep-verified).
- Observed issues: the only file in the unit that is not a thin view wrapper; company name "Watson Mattheus" is hardcoded in the copy (page.tsx:11).
- ASSUMED: nothing.

## src/app/public/sites/[siteId]/register/page.tsx
- Purpose: Route wrapper mounting the public site asset-register view for site-level QR codes.
- Public surface: default export `PublicSiteRegisterPage(): JSX.Element` (page.tsx:3), no props. `"use client"` (page.tsx:1).
- Inputs & outputs: route param `siteId`, read by the view via `useParams` (`src/views/PublicSiteRegister.tsx:31`). Output: renders `<PublicSiteRegister />`. No stores touched by this file.
- Dependencies: uses -> `@/views/PublicSiteRegister` (page.tsx:2, unit V04). used by <- no module imports (grep-verified); URL produced by the `qr-redirect` edge function's site-QR branch: `supabase/functions/qr-redirect/index.ts:102` 302s to `${appOrigin}/public/sites/${siteParam}/register` after verifying the site row exists (index.ts:93-100, unit F02). No other producer in src or supabase (grep-verified).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none (grep-verified).
- Observed issues: none beyond unit-level facts.
- ASSUMED: nothing.

## src/app/public/subsections/[subsectionId]/page.tsx
- Purpose: Canonical QR landing route for a subsection; mounts the public subsection view.
- Public surface: default export `PublicSubsectionPage(): JSX.Element` (page.tsx:3), no props. `"use client"` (page.tsx:1).
- Inputs & outputs: route param `subsectionId`, read by the view via `useParams` (`src/views/PublicSubsection.tsx:102`). Output: renders `<PublicSubsection />`. No stores touched by this file.
- Dependencies: uses -> `@/views/PublicSubsection` (page.tsx:2, unit V04). used by <- no module imports (grep-verified). URL producers (grep-verified): `src/lib/qrBaseUrl.ts:26` builds `${resolveQrBaseUrl(configured)}/public/subsections/${subsectionId}` (unit L16); `qr-redirect` edge function 302s here for valid subsection QR scans (`supabase/functions/qr-redirect/index.ts:87`) and normalises malformed double-slash paths of this shape (index.ts:107-110) (unit F02).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: no test imports the page. `src/lib/qrBaseUrl.test.ts:37,44` (unit L16) asserts on the `/public/subsections/` URL string shape (that generated QR URLs do/do not contain it) — it exercises the URL contract, not this file.
- Observed issues: same view is also mounted at the nested legacy route (see first section).
- ASSUMED: nothing.

## src/app/portfolio/[token]/page.tsx
- Purpose: Route wrapper mounting the client-portfolio view for client-type access-link tokens.
- Public surface: default export `PortfolioPage(): JSX.Element` (page.tsx:3), no props. `"use client"` (page.tsx:1).
- Inputs & outputs: route param `token`, read by the view via `useParams<{ token: string }>()` (`src/views/PublicClientPortfolio.tsx:41`). Output: renders `<PublicClientPortfolio />`. No stores touched by this file.
- Dependencies: uses -> `@/views/PublicClientPortfolio` (page.tsx:2, unit V04). used by <- no module imports (grep-verified). URL producers (grep-verified): `AccessLinkGenerator` builds `${window.location.origin}/portfolio/${token}` when `link_type === 'client'` (`src/components/client-portal/AccessLinkGenerator.tsx:204-205`, also copy/open at :255-256 and :262-263, unit C03); `PublicSiteReview` redirects here when a client-type token is opened via `/review/:token` (`src/views/PublicSiteReview.tsx:165`, unit V04).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none (grep-verified).
- Observed issues: none beyond unit-level facts.
- ASSUMED: nothing.

## src/app/portfolio/[token]/site/[siteId]/page.tsx
- Purpose: Route wrapper mounting the site-review view for a single site inside a client portfolio token.
- Public surface: default export `PortfolioSitePage(): JSX.Element` (page.tsx:3), no props. `"use client"` (page.tsx:1).
- Inputs & outputs: route params `token` and `siteId`; the view reads both via `useParams<{ token: string; siteId?: string }>()` (`src/views/PublicSiteReview.tsx:113`, `siteId` aliased to `routeSiteId`). Output: renders `<PublicSiteReview />`. No stores touched by this file.
- Dependencies: uses -> `@/views/PublicSiteReview` (page.tsx:2, unit V04). used by <- no module imports (grep-verified). URL producer (grep-verified): `src/views/PublicClientPortfolio.tsx:304` links to `` `/portfolio/${token}/site/${site.id}` `` (unit V04). No other producer found.
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none (grep-verified).
- Observed issues: duplicate URL shape — same view as `/review/[token]` (`src/app/review/[token]/page.tsx:2`); the view internally distinguishes the two entries by token type and optional `siteId` (`PublicSiteReview.tsx:113,163-165`).
- ASSUMED: nothing.

## src/app/review/[token]/page.tsx
- Purpose: Route wrapper mounting the site-review view for site-type access-link tokens.
- Public surface: default export `ReviewPage(): JSX.Element` (page.tsx:3), no props. `"use client"` (page.tsx:1).
- Inputs & outputs: route param `token`, read by the view (`src/views/PublicSiteReview.tsx:113`; `siteId` is undefined on this route). Output: renders `<PublicSiteReview />`. No stores touched by this file.
- Dependencies: uses -> `@/views/PublicSiteReview` (page.tsx:2, unit V04). used by <- no module imports (grep-verified). URL producers (grep-verified): `AccessLinkGenerator` builds `${window.location.origin}/review/${token}` for non-client link types (`src/components/client-portal/AccessLinkGenerator.tsx:204-205,255-256,262-263`, unit C03); `PublicSubsectionReview` navigates back to `` `/review/${token}` `` (`src/views/PublicSubsectionReview.tsx:361,379`, unit V04).
- Side effects: none in this file.
- Error handling: none in this file; a client-type token landing here is redirected by the view to `/portfolio/:token` (`PublicSiteReview.tsx:163-165`).
- Tests: none (grep-verified).
- Observed issues: duplicate URL shape with `/portfolio/[token]/site/[siteId]` (both mount `PublicSiteReview`).
- ASSUMED: nothing.

## src/app/review/[token]/subsection/[subsectionId]/page.tsx
- Purpose: Route wrapper mounting the token-gated single-subsection review view.
- Public surface: default export `ReviewSubsectionPage(): JSX.Element` (page.tsx:3), no props. `"use client"` (page.tsx:1).
- Inputs & outputs: route params `token` and `subsectionId`, both read by the view via `useParams<{ token: string; subsectionId: string }>()` (`src/views/PublicSubsectionReview.tsx:109`). Output: renders `<PublicSubsectionReview />`. No stores touched by this file.
- Dependencies: uses -> `@/views/PublicSubsectionReview` (page.tsx:2, unit V04). used by <- no module imports (grep-verified). URL producers (grep-verified): `src/views/PublicSiteReview.tsx:518` links to `` `/review/${token}/subsection/${subsection.id}` `` (unit V04); `src/components/site/SchematicDiagram.tsx:1109` navigates to `` `/review/${accessToken}/subsection/${block.subsection_id}` `` (unit C09).
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none (grep-verified).
- Observed issues: none beyond unit-level facts.
- ASSUMED: nothing.

## src/app/download/[requestId]/page.tsx
- Purpose: Route wrapper mounting the top-level PDF download-handoff view.
- Public surface: default export `Page(): JSX.Element` (page.tsx:3), no props. `"use client"` (page.tsx:1).
- Inputs & outputs: route param `requestId`, read by the view via `useParams` (`src/views/DownloadHandoff.tsx:30`); the view polls IndexedDB db `wm-download-handoff` through `getDownloadRequest(requestId)` (`DownloadHandoff.tsx:47`; db name at `src/lib/downloadHandoff.ts:17`). Output: renders `<DownloadHandoff />`. No stores touched by this file itself.
- Dependencies: uses -> `@/views/DownloadHandoff` (page.tsx:2, unit V04). used by <- no module imports (grep-verified); zero in-repo producers of a `/download/<id>` URL (`grep -rn "/download/" src supabase` over ts/tsx: no route-link hits). The current handoff mechanism opens a blank `_blank` window and writes HTML into it directly (`src/lib/downloadHandoff.ts:211,217-220,241,247-252`, unit L12) rather than navigating to this route.
- Side effects: none in this file.
- Error handling: none in this file (the view handles missing/expired requests).
- Tests: none import this file. `src/lib/fileDownload.test.ts:10-11` (L12) stubs `openDownloadHandoffWindow` and never touches the route.
- Observed issues: orphaned route by grep evidence — (a) nothing builds a `/download/<requestId>` URL, and (b) the IndexedDB writer the view depends on, `putDownloadRequest` (`src/lib/downloadHandoff.ts:152`), has no callers (grep shows only its definition), so the store the view polls is never written by current code.
- ASSUMED: the route is a remnant of an earlier IndexedDB-based handoff flow that was replaced by the direct-window-write flow in `downloadHandoff.ts` — inferred from the unused writer + orphaned URL, not stated anywhere in the repo.

## src/app/install/page.tsx
- Purpose: Route wrapper mounting the PWA installation-guide view.
- Public surface: default export `InstallPage(): JSX.Element` (page.tsx:3), no props. `"use client"` (page.tsx:1).
- Inputs & outputs: no route params. The view listens for `beforeinstallprompt`, detects iOS/standalone mode, and triggers the deferred install prompt (`src/views/Install.tsx:18-38`). Output: renders `<Install />`. No stores touched by this file.
- Dependencies: uses -> `@/views/Install` (page.tsx:2, unit V04). used by <- no module imports (grep-verified); no in-app link or navigation to `/install` exists in src or supabase (grep for `'/install'`, `"/install"`, and backtick variants: zero hits). The path is referenced only in docs: `README.md:462`, `docs/APPLICATION_SPEC.md:342,1220`, `docs/AUDIT_BASELINE.md:28`, `docs/system-reference/04-routes/public-token-and-root.md:226-230`.
- Side effects: none in this file.
- Error handling: none in this file.
- Tests: none (grep-verified).
- Observed issues: reachable only by typing the URL or via external/docs links — no in-app entry point (grep-verified).
- ASSUMED: the route is intended to be shared with users out-of-band (e.g. onboarding instructions) — no repo evidence.
