# Inventory — slice 11: src/app (Next.js App Router tree)

Date: 2026-07-29

List command (authoritative file set):

```
git ls-files 'src/app/*'
```

Output count:

```
git ls-files 'src/app/*' | wc -l
      59
```

Middleware check:

```
git ls-files src/middleware*
(no output — no src/middleware.ts is tracked)
```

LOC command: `git ls-files 'src/app/*' | xargs wc -l` → 495 total (per-file values below).

All 59 files classify as **source**. No tests, config, docs, generated, or asset files are tracked under src/app.

## Structure of the route tree (verified from file list)

- Route groups: `(admin)`, `(client-portal)`, `(contractor)` — each with its own `layout.tsx` wrapping children in a role-specific ProtectedRoute component.
- Ungrouped route segments: `api/`, `auth/`, `download/`, `install/`, `offline/`, `portfolio/`, `public/`, `review/`, plus root `layout.tsx`, `page.tsx`, `providers.tsx`, `not-found.tsx`.
- One API route handler: `src/app/api/snapshots/capture/route.ts`.
- No `loading.tsx`, `error.tsx`, `template.tsx`, or `default.tsx` files exist anywhere in the tree (verified against the full git ls-files output). Loading states are provided inline via `<Suspense fallback={<LoadingState .../>}>` in the three group layouts ((admin)/layout.tsx:39, (client-portal)/layout.tsx:20, (contractor)/layout.tsx:17).
- Every page.tsx is a `"use client"` component (verified by grep across all 59 files; the only non-client files are `src/app/layout.tsx` and `src/app/api/snapshots/capture/route.ts`).
- Dominant pattern: 3-line thin wrapper pages — `"use client"; import X from "@/views/X"; export default function Page() { return <X />; }` — 47 of the 53 page.tsx files follow this shape (a few add a Suspense wrapper or are slightly larger; see per-file entries).

## Per-file entries

### Root shell (5 files)

### src/app/layout.tsx
- Type: source. LOC: 49.
- Public surface: `export const metadata: Metadata` (title "WM Compliance Inspector", manifest /manifest.json, openGraph, appleWebApp) at layout.tsx:5; `export const viewport: Viewport` (themeColor #2563eb) at layout.tsx:24; `export default function RootLayout({ children }: { children: React.ReactNode })` at layout.tsx:32.
- Notes: Server component (no "use client"). Imports `./providers` and `@/index.css` (layout.tsx:2-3). Sets favicon/apple-touch-icon links in `<head>` (layout.tsx:40-42). `suppressHydrationWarning` on `<html>` (layout.tsx:38).

### src/app/providers.tsx
- Type: source. LOC: 29.
- Public surface: `export function Providers({ children }: { children: React.ReactNode })` at providers.tsx:14.
- Notes: "use client". Composes ErrorBoundary > QueryClientProvider (module-level `const queryClient = new QueryClient()` at providers.tsx:12) > TooltipProvider > Toaster + Sonner + ServiceWorkerUpdater + OfflineIndicator + SessionWatcher + children (providers.tsx:16-27).

### src/app/page.tsx
- Type: source. LOC: 3.
- Public surface: `export default function HomePage()`.
- Notes: renders `<Index />` from `@/views/Index` (page.tsx:2).

### src/app/not-found.tsx
- Type: source. LOC: 10.
- Public surface: `export default function NotFoundPage()` at not-found.tsx:4.
- Notes: "use client"; wraps `<NotFound />` (`@/views/NotFound`) in bare `<Suspense>` (not-found.tsx:6-8).

### src/app/offline/page.tsx
- Type: source. LOC: 30.
- Public surface: `export default function OfflinePage()` at offline/page.tsx:8.
- Notes: self-contained JSX (no view import); comment at offline/page.tsx:5-7 states it is the PWA offline fallback served by the service worker for uncached navigations, deliberately outside the auth route groups.

### API route (1 file)

### src/app/api/snapshots/capture/route.ts
- Type: source. LOC: 102.
- Public surface: `export const dynamic = "force-dynamic"` (route.ts:8); `export const maxDuration = 60` (route.ts:9); `export async function GET(req: Request)` (route.ts:36). Internal helpers `fetchAll(supabase, table, columns)` (route.ts:12) and `groupBy<T>(rows, key)` (route.ts:24) are not exported.
- Notes: Bearer-token guard against `process.env.CRON_SECRET` (route.ts:37-39). Creates a Supabase service-role client from `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (route.ts:41-46). Pages through 8 tables (sites, subsections, snags, inspections, site_schematics, site_assets, site_documents, subsection_documents) via `fetchAll` (route.ts:50-59), computes per-site metrics with `computeSiteDeliverables`, `readiness`, `computeSiteHealth`, `isSnagOpen`, `toSnapshotRow` (route.ts:84-89), then upserts into `site_health_snapshots` on conflict `site_id,captured_at` (route.ts:92-94).

### (admin) route group (27 files)

### src/app/(admin)/layout.tsx
- Type: source. LOC: 43.
- Public surface: `export default function AdminLayout({ children }: { children: React.ReactNode })` at layout.tsx:37.
- Notes: "use client". `AdminInner` (layout.tsx:10) wraps children in `ProtectedRoute` > `SidebarProvider` with `AppSidebar`, header with `SidebarTrigger`, "Electrical Compliance" heading, and `GlobalSearch` (layout.tsx:12-33). Default export wraps in Suspense with `LoadingState variant="full-page"` (layout.tsx:39).

Admin pages — all "use client", all `export default function Page()` thin wrappers rendering a view component:

| File | LOC | Renders (import) |
|---|---|---|
| src/app/(admin)/calendar/page.tsx | 3 | `Calendar` from `@/views/Calendar` |
| src/app/(admin)/clients/page.tsx | 3 | `Clients` from `@/views/Clients` |
| src/app/(admin)/clients/[clientId]/page.tsx | 3 | `ClientDetail` from `@/views/ClientDetail` |
| src/app/(admin)/clients/[clientId]/sites/page.tsx | 3 | `Sites` from `@/views/Sites` |
| src/app/(admin)/clients/[clientId]/sites/[siteId]/page.tsx | 3 | `SiteDetail` from `@/views/SiteDetail` |
| src/app/(admin)/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/page.tsx | 3 | `SubsectionDetail` from `@/views/SubsectionDetail` |
| src/app/(admin)/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/inspections/[inspectionId]/page.tsx | 3 | `InspectionDetail` from `@/views/InspectionDetail` |
| src/app/(admin)/dashboard/page.tsx | 3 | `Dashboard` from `@/views/Dashboard` |
| src/app/(admin)/inspection-templates/page.tsx | 8 | `InspectionTemplates` via `next/dynamic` with `ssr: false` and `LoadingState` loading fallback (page.tsx:4-7) |
| src/app/(admin)/inspection-templates/new/page.tsx | 3 | `TemplateBuilderPage` from `@/views/TemplateBuilderPage` |
| src/app/(admin)/inspection-templates/[templateId]/edit/page.tsx | 3 | `TemplateBuilderPage` from `@/views/TemplateBuilderPage` |
| src/app/(admin)/inspection-templates/validate/page.tsx | 3 | `TemplateValidator` from `@/views/TemplateValidator` |
| src/app/(admin)/inspections/page.tsx | 3 | `Inspections` from `@/views/Inspections` |
| src/app/(admin)/offline-review/page.tsx | 3 | `OfflineReview` from `@/views/OfflineReview` |
| src/app/(admin)/pdf-template-tests/page.tsx | 3 | `PDFTemplateTestDashboard` from `@/views/PDFTemplateTestDashboard` |
| src/app/(admin)/portal-management/page.tsx | 3 | `PortalManagement` from `@/views/PortalManagement` |
| src/app/(admin)/profile/page.tsx | 3 | `MyProfile` from `@/views/MyProfile` |
| src/app/(admin)/qr-activity/page.tsx | 3 | `QRActivity` from `@/views/QRActivity` |
| src/app/(admin)/qr-codes/page.tsx | 3 | `QRCodes` from `@/views/QRCodes` |
| src/app/(admin)/settings/page.tsx | 3 | `Settings` from `@/views/Settings` |
| src/app/(admin)/site-assignments/page.tsx | 3 | `PortalManagement` from `@/views/PortalManagement` |
| src/app/(admin)/sites/page.tsx | 3 | `Sites` from `@/views/Sites` |
| src/app/(admin)/sites/[siteId]/page.tsx | 3 | `SiteDetail` from `@/views/SiteDetail` |
| src/app/(admin)/sites/[siteId]/subsections/[subsectionId]/page.tsx | 3 | `SubsectionDetail` from `@/views/SubsectionDetail` |
| src/app/(admin)/sites/[siteId]/subsections/[subsectionId]/inspections/[inspectionId]/page.tsx | 3 | `InspectionDetail` from `@/views/InspectionDetail` |
| src/app/(admin)/users/page.tsx | 3 | `Users` from `@/views/Users` |

### (client-portal) route group (6 files)

### src/app/(client-portal)/layout.tsx
- Type: source. LOC: 24.
- Public surface: `export default function ClientPortalGroupLayout({ children }: { children: React.ReactNode })` at layout.tsx:18.
- Notes: "use client". Wraps children in `ClientProtectedRoute` > `ClientPortalLayout` (layout.tsx:10-14), all inside Suspense + LoadingState (layout.tsx:20).

| File | LOC | Renders (import) |
|---|---|---|
| src/app/(client-portal)/client-portal/page.tsx | 3 | `ClientPortalDashboard` from `@/views/ClientPortalDashboard` |
| src/app/(client-portal)/client-portal/calendar/page.tsx | 3 | `ClientPortalCalendar` from `@/views/ClientPortalCalendar` |
| src/app/(client-portal)/client-portal/sites/page.tsx | 3 | `ClientPortalSites` from `@/views/ClientPortalSites` |
| src/app/(client-portal)/client-portal/sites/[siteId]/page.tsx | 3 | `ClientPortalSiteDetail` from `@/views/ClientPortalSiteDetail` |
| src/app/(client-portal)/client-portal/subsections/[subsectionId]/page.tsx | 3 | `ClientPortalSubsectionDetail` from `@/views/ClientPortalSubsectionDetail` |

### (contractor) route group (4 files)

### src/app/(contractor)/layout.tsx
- Type: source. LOC: 21.
- Public surface: `export default function ContractorGroupLayout({ children }: { children: React.ReactNode })` at layout.tsx:15.
- Notes: "use client". Wraps children in `ContractorProtectedRoute` only — no chrome/sidebar component (layout.tsx:8-12) — inside Suspense + LoadingState (layout.tsx:17).

| File | LOC | Renders (import) |
|---|---|---|
| src/app/(contractor)/contractor/page.tsx | 3 | `ContractorPortal` from `@/views/ContractorPortal` |
| src/app/(contractor)/contractor/subsections/[subsectionId]/page.tsx | 3 | `ContractorSubsectionDetail` from `@/views/ContractorSubsectionDetail` |
| src/app/(contractor)/contractor/inspections/[inspectionId]/page.tsx | 3 | `InspectionDetail` from `@/views/InspectionDetail` |

### auth routes (6 files, no route group / no shared layout file)

| File | LOC | Public surface | Renders (import) |
|---|---|---|---|
| src/app/auth/page.tsx | 3 | `export default function AuthPage()` | `Auth` from `@/views/Auth` |
| src/app/auth/login/page.tsx | 10 | `export default function LoginPage()` (page.tsx:4) | `Login` from `@/views/auth/Login`, wrapped in bare Suspense (page.tsx:6-8) |
| src/app/auth/signup/page.tsx | 5 | `export default function SignupPage()` | `Signup` from `@/views/auth/Signup` |
| src/app/auth/forgot-password/page.tsx | 5 | `export default function ForgotPasswordPage()` | `ForgotPassword` from `@/views/auth/ForgotPassword` |
| src/app/auth/reset-password/page.tsx | 5 | `export default function ResetPasswordPage()` | `ResetPassword` from `@/views/auth/ResetPassword` |
| src/app/auth/set-password/page.tsx | 5 | `export default function SetPasswordPage()` | `SetPassword` from `@/views/auth/SetPassword` |

### public / portfolio / review / download / install routes (10 files)

| File | LOC | Public surface | Renders (import) |
|---|---|---|---|
| src/app/public/subsections/[subsectionId]/page.tsx | 3 | `export default function PublicSubsectionPage()` | `PublicSubsection` from `@/views/PublicSubsection` |
| src/app/public/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/page.tsx | 3 | `export default function PublicSubsectionNestedPage()` | `PublicSubsection` from `@/views/PublicSubsection` |
| src/app/public/sites/[siteId]/register/page.tsx | 3 | `export default function PublicSiteRegisterPage()` | `PublicSiteRegister` from `@/views/PublicSiteRegister` |
| src/app/public/qr-retired/page.tsx | 17 | `export default function QrRetiredPage()` (page.tsx:4) | self-contained Card UI ("This QR code has been retired", page.tsx:9) — no view import |
| src/app/portfolio/[token]/page.tsx | 3 | `export default function PortfolioPage()` | `PublicClientPortfolio` from `@/views/PublicClientPortfolio` |
| src/app/portfolio/[token]/site/[siteId]/page.tsx | 3 | `export default function PortfolioSitePage()` | `PublicSiteReview` from `@/views/PublicSiteReview` |
| src/app/review/[token]/page.tsx | 3 | `export default function ReviewPage()` | `PublicSiteReview` from `@/views/PublicSiteReview` |
| src/app/review/[token]/subsection/[subsectionId]/page.tsx | 3 | `export default function ReviewSubsectionPage()` | `PublicSubsectionReview` from `@/views/PublicSubsectionReview` |
| src/app/download/[requestId]/page.tsx | 3 | `export default function Page()` | `DownloadHandoff` from `@/views/DownloadHandoff` |
| src/app/install/page.tsx | 3 | `export default function InstallPage()` | `Install` from `@/views/Install` |

## Runtime observations

- Entry point (web shell): `src/app/layout.tsx:32` — `RootLayout`, the single server-rendered HTML shell; PWA manifest declared at layout.tsx:9, appleWebApp config at layout.tsx:18-21.
- Global client providers: `src/app/providers.tsx:14` — react-query `QueryClientProvider` (client created at providers.tsx:12), `ServiceWorkerUpdater` (providers.tsx:21), `OfflineIndicator` (providers.tsx:22), `SessionWatcher` (providers.tsx:23) mounted app-wide.
- Request handler: `src/app/api/snapshots/capture/route.ts:36` — `GET`, force-dynamic (route.ts:8), maxDuration 60s (route.ts:9), auth via `Authorization: Bearer ${CRON_SECRET}` (route.ts:37).
- Scheduled job: `vercel.json:7` — `"crons": [{ "path": "/api/snapshots/capture", "schedule": "0 2 * * *" }]` — daily 02:00 cron invoking the above handler. (vercel.json is outside this slice; cited as the trigger for the in-slice handler.)
- External service integration: Supabase service-role client created in the route handler (route.ts:46, `@supabase/supabase-js` createClient with `persistSession: false`); reads 8 tables (route.ts:50-59) and upserts `site_health_snapshots` (route.ts:92-94). Env vars consumed: `CRON_SECRET`, `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (route.ts:37-42).
- Auth gating happens in layouts, not middleware: `ProtectedRoute` ((admin)/layout.tsx:12), `ClientProtectedRoute` ((client-portal)/layout.tsx:10), `ContractorProtectedRoute` ((contractor)/layout.tsx:9). No `src/middleware.ts` is tracked (`git ls-files src/middleware*` returned nothing).
- Offline/PWA path: `src/app/offline/page.tsx:5-8` — precached service-worker fallback page for uncached navigations, intentionally outside auth groups.

## Oddities

- Duplicate untracked "` 2`" copies exist beside four tracked files (git status: `src/app/layout 2.tsx`, `src/app/not-found 2.tsx`, `src/app/page 2.tsx`, `src/app/providers 2.tsx`, confirmed by `ls -1 src/app`). They are untracked and therefore outside the authoritative file set; noted only as working-tree state.
- Two distinct admin routes render the same view: `/portal-management` and `/site-assignments` both render `PortalManagement` ((admin)/portal-management/page.tsx:2-3 and (admin)/site-assignments/page.tsx:2-3).
- Parallel duplicated admin route hierarchies: the `clients/[clientId]/sites/...` subtree and the top-level `sites/...` subtree render the same four views (Sites, SiteDetail, SubsectionDetail, InspectionDetail) at two different URL prefixes (5 file pairs, listed in the admin table above).
- `PublicSubsection` is reachable at two public URLs: `/public/subsections/[subsectionId]` and `/public/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]` (both page.tsx:2). `PublicSiteReview` likewise at `/review/[token]` and `/portfolio/[token]/site/[siteId]`.
- `InspectionDetail` is rendered from three different route groups/prefixes: admin `clients/...`, admin `sites/...`, and contractor `contractor/inspections/[inspectionId]`.
- Only one page uses `next/dynamic` with `ssr: false`: (admin)/inspection-templates/page.tsx:4-7; every sibling page imports its view statically.
- Dynamic-segment pages ([clientId], [siteId], [subsectionId], [inspectionId], [token], [requestId]) do not receive/forward route params as props — all are zero-prop view renders (verified in the wrapper bodies above), so param reading must happen inside the view components (see ASSUMED).
- No `loading.tsx`/`error.tsx` files anywhere in the tree; error handling is centralized in `ErrorBoundary` at providers.tsx:16.

## ASSUMED

- View components presumably read dynamic route params via `useParams()`/`useSearchParams()` from next/navigation, since page wrappers pass no props. Not verified — the views are outside this slice.
- The `ProtectedRoute`/`ClientProtectedRoute`/`ContractorProtectedRoute` components are assumed to perform Supabase session checks client-side; their implementations live in src/components (another slice) and were not opened.
- The Vercel cron is assumed to be the only caller of `/api/snapshots/capture` in production; nothing in this slice proves no other caller exists.
- The Suspense wrappers around `Login` and `NotFound` are assumed to exist because those views call `useSearchParams()` (a Next.js requirement); the views were not opened to confirm.
- `src/app/(admin)/inspections/page.tsx` route `/inspections` is assumed to be the flat inspections list distinct from the nested inspection-detail routes; the `Inspections` view was not opened.
