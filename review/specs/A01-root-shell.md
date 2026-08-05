# A01 — root-shell — Phase 2 specification

- Unit id: A01
- Slug: root-shell
- Spec mode: full
- Date: 2026-07-29
- File count: 5 (src/app/layout.tsx, src/app/providers.tsx, src/app/page.tsx, src/app/not-found.tsx, src/app/offline/page.tsx)

## Unit header

**Unit purpose (as-is).** The Next.js App Router root shell: the server-rendered root layout (metadata, viewport, favicon links, global CSS), the client-side provider stack it mounts around every route (react-query, tooltip, two toast systems, error boundary, session watcher, offline indicator, service-worker updater), the `/` entry page, the global 404 boundary, and the PWA offline fallback page precached by the service worker.

**Module-level observations (cross-file, verified).**
- Only src/app/layout.tsx is a server component; providers.tsx, page.tsx, not-found.tsx, and offline/page.tsx all begin with `"use client"` (providers.tsx:1, page.tsx:1, not-found.tsx:1, offline/page.tsx:1).
- No file anywhere in `src/` or `supabase/` imports from `@/app/...` — grep-verified zero hits. Everything in this unit is mounted by Next.js file-system convention, not by explicit import (the sole intra-repo import edge is layout.tsx:2 → ./providers).
- `src/app/` contains no `loading.tsx`, `error.tsx`, `global-error.tsx`, or `template.tsx` at the root level (ls-verified against the src/app directory listing).
- Untracked Finder-style duplicates sit beside four of the five files: `src/app/layout 2.tsx`, `page 2.tsx`, `not-found 2.tsx`, `providers 2.tsx` (git ls-files tracks only the non-suffixed names; the " 2" files appear as `??` in git status). Diff-verified: `page 2.tsx` and `not-found 2.tsx` are byte-identical to their originals; `layout 2.tsx` differs only in the `<head>` icon links (has a single un-versioned apple-touch-icon instead of the three `?v=2` links at layout.tsx:40-42); `providers 2.tsx` additionally imports `@/components/HelpButton`, `@/components/NotificationListener`, `@/components/VerificationListener` — none of which exist in src/components (ls-verified absent) — and omits `ServiceWorkerUpdater`.
- The offline fallback wiring spans units: next.config.mjs:36 (P01) sets `fallbacks: { document: "/offline" }`, and the generated (untracked — absent from `git ls-files public/`) `public/sw.js` precaches `{url:"/offline"}` and routes failed document navigations through `self.fallback`, which `caches.match("/offline")` per `public/fallback-ce627215c0e4a9af.js`.

**External contract.** The rest of the app gets from this unit: (1) a guaranteed provider environment on every route — ErrorBoundary, a default-configured react-query `QueryClient`, TooltipProvider, both toast outlets (shadcn `Toaster` + `Sonner`), plus three always-mounted singleton widgets (`ServiceWorkerUpdater`, `OfflineIndicator`, `SessionWatcher`) (providers.tsx:16-27); (2) global metadata/PWA head tags and `@/index.css` on every page (layout.tsx:3,5-30); (3) role-based redirect from `/` (via V04 `Index`); (4) a global 404 UI; (5) an unauthenticated `/offline` page for the service worker to serve.

---

## src/app/layout.tsx
- Purpose: Server-component root layout that declares app-wide metadata and viewport, links the PWA icons/manifest, imports global CSS, and wraps all routes in the client `Providers` stack.
- Public surface:
  - `export const metadata: Metadata` (layout.tsx:5-22) — title "WM Compliance Inspector", description, authors `[{name:"Watson Mattheus"}]`, `manifest: "/manifest.json"` (:9), openGraph (title/description/type "website"), twitter card "summary_large_image", `appleWebApp: { capable: true, statusBarStyle: "black-translucent" }`.
  - `export const viewport: Viewport` (layout.tsx:24-30) — device-width, initialScale 1, maximumScale 5, userScalable true, `themeColor: "#2563eb"` (:29).
  - `export default function RootLayout({ children }: { children: React.ReactNode }): JSX` (layout.tsx:32-49).
- Inputs & outputs: input is `children` from the Next router; output is the `<html lang="en" suppressHydrationWarning>` / `<head>` / `<body>` skeleton with `<Providers>{children}</Providers>` (layout.tsx:38-47). References static assets `/icon-192.png?v=2`, `/favicon.ico?v=2` (layout.tsx:40-42) and `/manifest.json` (:9); all three exist in `public/` (ls-verified). No env vars, no storage.
- Dependencies: uses -> `./providers` (A01, layout.tsx:2); `@/index.css` (L22, layout.tsx:3); `next` types `Metadata`/`Viewport` (layout.tsx:1). used by <- Next.js framework convention (root layout); no source importers (grep-verified: zero `@/app/` imports repo-wide).
- Side effects: importing `@/index.css` injects the global stylesheet build-wide; otherwise pure render.
- Error handling: none present in the file.
- Tests: none — grep across `*.test.*`/`*.spec.*` for `app/layout`/`RootLayout` returned zero hits.
- Observed issues:
  - `suppressHydrationWarning` is set on `<html>` (layout.tsx:38); nothing in this unit mutates `<html>` attributes.
  - Icon links are hand-written `<link>` tags in `<head>` with `?v=2` cache-busting queries (layout.tsx:40-42) rather than entries in the `metadata` export; the `manifest` reference (:9) carries no version query.
  - Both icon assets referenced here are byte-identical to each other: `favicon.ico` and `icon-192.png` share content revision `62900b90e8962107316de9d7f38627ae` in the generated sw.js precache manifest (P04's inventory notes the byte-identical icons independently).
  - `viewport.themeColor` `#2563eb` (layout.tsx:29) matches `theme_color` in public/manifest.json (consistency fact, verified).
  - Untracked sibling `src/app/layout 2.tsx` differs from this file only in the head links (diff-verified).
- ASSUMED: that Next.js mounts this file as the root layout for every route — App Router file convention, not provable by grep.

## src/app/providers.tsx
- Purpose: Client-side provider stack composing the error boundary, react-query client, tooltip context, both toast outlets, and three always-mounted global widgets around all route content.
- Public surface: `export function Providers({ children }: { children: React.ReactNode }): JSX` (providers.tsx:14-29). Module-private: `const queryClient = new QueryClient()` at module scope with no constructor options (providers.tsx:12).
- Inputs & outputs: input is `children`; output is the tree `ErrorBoundary > QueryClientProvider(client=queryClient) > TooltipProvider > [Toaster, Sonner, ServiceWorkerUpdater, OfflineIndicator, SessionWatcher, children]` (providers.tsx:16-27). No direct table/bucket/localStorage/env access in this file (the mounted widgets have their own I/O, specified in their units).
- Dependencies: uses -> `@tanstack/react-query` `QueryClient`/`QueryClientProvider` (providers.tsx:3); `@/components/ui/tooltip` `TooltipProvider` (C01, :4); `@/components/ui/toaster` `Toaster` (C01, :5); `@/components/ui/sonner` `Toaster as Sonner` (C01, :6); `@/components/ErrorBoundary` (C16, :7); `@/components/OfflineIndicator` (C13, :8); `@/components/SessionWatcher` (C10, :9); `@/components/ServiceWorkerUpdater` (C13, :10). used by <- src/app/layout.tsx:2 (A01) — sole tracked consumer (grep-verified; the untracked `src/app/layout 2.tsx`:2 also imports it).
- Side effects: instantiates one `QueryClient` at client-module evaluation time (providers.tsx:12); mounting the tree activates whatever subscriptions/network behavior `SessionWatcher` (C10), `OfflineIndicator`/`ServiceWorkerUpdater` (C13), and `ErrorBoundary` (C16) implement — those behaviors belong to their units' specs, not this file.
- Error handling: none in this file; render-time errors in descendants are delegated to `ErrorBoundary` (providers.tsx:16), whose actual catch behavior is a C16 fact.
- Tests: none — grep for `app/providers` in test files returned zero hits.
- Observed issues:
  - Two toast systems are mounted simultaneously: shadcn `Toaster` (providers.tsx:19) and Sonner (providers.tsx:20) — matching the manifest's C01 note "two toast stacks".
  - `QueryClient` is constructed with no options (providers.tsx:12): all react-query defaults (retry, staleTime, refetch behavior) apply app-wide.
  - Untracked sibling `src/app/providers 2.tsx` diverges materially: it imports `HelpButton`, `NotificationListener`, `VerificationListener` — components with no corresponding files in src/components (ls-verified) — and omits `ServiceWorkerUpdater` (diff-verified).
- ASSUMED: the module-scope `queryClient` behaves as a per-browser-tab singleton (standard ES-module evaluation semantics, not verified by test).

## src/app/page.tsx
- Purpose: Three-line thin wrapper mounting the `Index` entry view at route `/`.
- Public surface: `export default function HomePage(): JSX` (page.tsx:3), returning `<Index />`.
- Inputs & outputs: no props, no data in this file. The rendered V04 `Index` performs the actual work: `supabase.auth.getSession()` (Index.tsx:13), a `user_roles` role lookup (Index.tsx:20-24), and navigation to `/auth`, `/client-portal`, `/contractor`, or `/dashboard` (Index.tsx:15,27,29,31,37,42).
- Dependencies: uses -> `@/views/Index` (V04, page.tsx:2). used by <- Next.js framework convention (route `/`); no source importers (grep-verified). This file is itself the only importer of `@/views/Index` (grep-verified single hit).
- Side effects: none in this file.
- Error handling: none in this file (Index's own catch paths are V04 facts).
- Tests: none — grep for `app/page`/`HomePage` in test files returned zero hits.
- Observed issues: untracked sibling `src/app/page 2.tsx` is byte-identical (diff-verified).
- ASSUMED: that Next.js serves this as route `/` — App Router convention.

## src/app/not-found.tsx
- Purpose: Global App Router 404 boundary that renders the `NotFound` view inside a fallback-less `Suspense`.
- Public surface: `export default function NotFoundPage(): JSX` (not-found.tsx:4-10).
- Inputs & outputs: no props; renders `<Suspense><NotFound /></Suspense>` (not-found.tsx:6-8). No stores or env in this file. The wrapped V04 view logs `console.error("404 Error: ...", location.pathname)` on mount (NotFound.tsx:8).
- Dependencies: uses -> `react` `Suspense` (not-found.tsx:2); `@/views/NotFound` (V04, not-found.tsx:3). used by <- Next.js framework convention (global not-found boundary); no source importers (grep-verified). This file is the only importer of `@/views/NotFound` (grep-verified single hit). The generated sw.js precache lists a built `/_next/static/chunks/app/_not-found/...` chunk, evidencing the build mounts it.
- Side effects: none in this file.
- Error handling: `Suspense` has no `fallback` prop (not-found.tsx:6), so nothing renders while the subtree suspends.
- Tests: none — grep for `app/not-found`/`NotFoundPage` in test files returned zero hits.
- Observed issues:
  - The `Suspense` wrapper is load-bearing: `NotFound` calls `useLocation` (NotFound.tsx:1,5) from `@/lib/navigation` (L13), which internally calls Next's `useSearchParams` (navigation.tsx:86-88); this file is the only root-shell page wrapped in Suspense while page.tsx (whose `Index` view uses no search-param hook — grep-verified) is not.
  - Untracked sibling `src/app/not-found 2.tsx` is byte-identical (diff-verified).
- ASSUMED: that Next.js prerendering requires a Suspense boundary above `useSearchParams` consumers (framework behavior; the requirement itself is not demonstrated in-repo).

## src/app/offline/page.tsx
- Purpose: Self-contained static PWA offline fallback page, precached by the service worker and served when a navigation to an uncached route fails while offline.
- Public surface: `export default function OfflinePage(): JSX` (offline/page.tsx:8-30).
- Inputs & outputs: no props, no data reads; renders a static "You're offline" screen with explanatory copy (offline/page.tsx:14-19) and a "Try again" button that calls `window.location.reload()` (offline/page.tsx:20-27).
- Dependencies: uses -> `lucide-react` `WifiOff`/`RefreshCw` (offline/page.tsx:3). used by <- none found in source (grep-verified: zero importers of `OfflinePage`/`app/offline`); wired instead via config and build artifacts: next.config.mjs:36 (P01) declares `fallbacks: { document: "/offline" }`, and the generated untracked `public/sw.js` precaches `{url:"/offline", revision:"9mNPfmISDEuyDEDY63k30"}` with `public/fallback-ce627215c0e4a9af.js` resolving document-destination failures to `caches.match("/offline")`.
- Side effects: `window.location.reload()` on button click (offline/page.tsx:22); nothing else.
- Error handling: none present.
- Tests: none — grep for `app/offline`/`OfflinePage` in test files returned zero hits.
- Observed issues:
  - The in-file comment (offline/page.tsx:5-7) states the serving mechanism and that the page "Lives outside the auth route groups so it renders without a session check" — consistent with its location in the ungrouped `src/app/offline/` segment (ls-verified).
  - The page copy asserts offline changes are "saved on this device and syncs automatically when you're back online" (offline/page.tsx:16-18) — a claim about the H01/H02 offline sync machinery, stated here as static text.
- ASSUMED: that the service worker actually serves this page at runtime for failed uncached navigations — the wiring is verified statically (next.config.mjs:36 plus the generated sw.js/fallback script), but runtime behavior was not exercised.
