# Inventory part 10 — src/views (page-level view components)

Date: 2026-07-29

List command (authoritative file set):

```
$ git ls-files 'src/views/*' | wc -l
      74
```

`git ls-files 'src/views/*'` returned the 74 paths inventoried below (46 top-level `.tsx` views + `auth/` 8 files + `site-coc/` 11 files + `subsection-detail/` 9 files).

LOC command: `git ls-files 'src/views/*' | xargs wc -l` → total 26168 (per-file numbers in tables below).

Classification: all 74 files are **source** (React client-side view components, hooks, a barrel, and a types file — no tests, config, or generated files in the slice).

Route-consumer facts come from `grep -rn "views/" src/app --include='*.tsx' --include='*.ts'` (untracked `" 2."` duplicates excluded). Views are page bodies: the consuming `src/app/**/page.tsx` imports the default export and renders it with no props; dynamic segment values are read inside the view via `useParams`/`useSearchParams` (16 files use `useParams`).

## Admin entity views (top-level)

| Path | Type | LOC | Public surface | Route consumer(s) / notes |
|---|---|---|---|---|
| src/views/Dashboard.tsx | source | 533 | default `Dashboard()` — no props (Dashboard.tsx:62,533) | `(admin)/dashboard/page.tsx:2` |
| src/views/Clients.tsx | source | 747 | default `Clients()` — no props (Clients.tsx:33,747) | `(admin)/clients/page.tsx:2` |
| src/views/ClientDetail.tsx | source | 532 | default `ClientDetail()` — no props (ClientDetail.tsx:60,532) | `(admin)/clients/[clientId]/page.tsx:2`; uploads to `client-logos` bucket (117-118) |
| src/views/Sites.tsx | source | 389 | default `Sites()` — no props (Sites.tsx:39,389) | `(admin)/sites/page.tsx:2` and `(admin)/clients/[clientId]/sites/page.tsx:2` |
| src/views/SiteDetail.tsx | source | 893 | default `SiteDetail()` — no props (SiteDetail.tsx:53,893) | `(admin)/sites/[siteId]/page.tsx:2` and `(admin)/clients/[clientId]/sites/[siteId]/page.tsx:2`; imports `SiteCocTab` (SiteDetail.tsx:30); `documents` bucket ops (525,561,563) |
| src/views/SubsectionDetail.tsx | source | 304 | default `SubsectionDetail()` — no props (SubsectionDetail.tsx:19,304) | `(admin)/sites/[siteId]/subsections/[subsectionId]/page.tsx:2` and the clients-scoped equivalent; composed from `./subsection-detail` barrel (SubsectionDetail.tsx:17) |
| src/views/Calendar.tsx | source | 1090 | default `Calendar()` — no props (Calendar.tsx:72,1090) | `(admin)/calendar/page.tsx:2`; internal `exportToPDF` (394) |
| src/views/Inspections.tsx | source | 508 | default `Inspections()` — no props (Inspections.tsx:51,508) | `(admin)/inspections/page.tsx:2` |
| src/views/InspectionDetail.tsx | source | 3102 | default `InspectionDetail()` — no props (InspectionDetail.tsx:101,3102) | 3 routes: `(admin)/sites/.../inspections/[inspectionId]/page.tsx:2`, `(admin)/clients/.../inspections/[inspectionId]/page.tsx:2`, `(contractor)/contractor/inspections/[inspectionId]/page.tsx:2`; storage removes on `documents` (1522) and `inspection-photos` (1558); largest file in slice |

## Admin ops + template views (top-level)

| Path | Type | LOC | Public surface | Route consumer(s) / notes |
|---|---|---|---|---|
| src/views/Users.tsx | source | 1548 | default `Users()` — no props (Users.tsx:80,1548) | `(admin)/users/page.tsx:2`; edge fns `invite-user` (261,303,373), `delete-user` (522); `profile-images` bucket (607,626) |
| src/views/Settings.tsx | source | 349 | default `Settings()` — no props (Settings.tsx:25,349) | `(admin)/settings/page.tsx:2` |
| src/views/MyProfile.tsx | source | 396 | default `MyProfile()` — no props (MyProfile.tsx:19,396) | `(admin)/profile/page.tsx:2` |
| src/views/QRCodes.tsx | source | 344 | default `QRCodes()` — no props (QRCodes.tsx:32,345) | `(admin)/qr-codes/page.tsx:2` |
| src/views/QRActivity.tsx | source | 165 | default `QRActivity()` — no props (QRActivity.tsx:21,165) | `(admin)/qr-activity/page.tsx:2` |
| src/views/PortalManagement.tsx | source | 55 | default `PortalManagement()` — no props (PortalManagement.tsx:8) | 2 routes: `(admin)/portal-management/page.tsx:2` and `(admin)/site-assignments/page.tsx:2` |
| src/views/SiteAssignments.tsx | source | 826 | default `SiteAssignments()` — no props (SiteAssignments.tsx:71,826) | **No importers found anywhere in src** (see Oddities) |
| src/views/APIClients.tsx | source | 484 | default `APIClients()` — no props (APIClients.tsx:38,484) | No importers found (see Oddities) |
| src/views/OfflineReview.tsx | source | 199 | default `OfflineReview()` — no props (OfflineReview.tsx:11) | `(admin)/offline-review/page.tsx:2`; invokes edge fn `offline-review` (41) |
| src/views/PDFTemplateTestDashboard.tsx | source | 447 | default `PDFTemplateTestDashboard()` (250); internal `StatusIcon` (45), `StatusBadge` (58), `TestResultItem` (73), `SummaryCard` (115), `TemplateInspector` (132) — none exported | `(admin)/pdf-template-tests/page.tsx:2` — an in-app test-runner dashboard routed under (admin) |
| src/views/InspectionTemplates.tsx | source | 680 | default `InspectionTemplates()` — no props (InspectionTemplates.tsx:295,680); internal `InlineTemplateEditor` (78) | `(admin)/inspection-templates/page.tsx:4` — loaded via `next/dynamic`, the only view consumed that way |
| src/views/TemplateBuilderPage.tsx | source | 114 | default `TemplateBuilderPage()` — no props (TemplateBuilderPage.tsx:9,114) | 2 routes: `(admin)/inspection-templates/new/page.tsx:2` and `.../[templateId]/edit/page.tsx:2` |
| src/views/TemplateValidator.tsx | source | 189 | default `TemplateValidator()` — no props (TemplateValidator.tsx:19) | `(admin)/inspection-templates/validate/page.tsx:2` |

## Client-portal / contractor-portal views (top-level)

| Path | Type | LOC | Public surface | Route consumer(s) / notes |
|---|---|---|---|---|
| src/views/ClientPortalDashboard.tsx | source | 344 | default `ClientPortalDashboard()` — no props (15,345) | `(client-portal)/client-portal/page.tsx:2` |
| src/views/ClientPortalSites.tsx | source | 179 | default `ClientPortalSites()` — no props (16,179) | `(client-portal)/client-portal/sites/page.tsx:2` |
| src/views/ClientPortalSiteDetail.tsx | source | 457 | default `ClientPortalSiteDetail()` — no props (29,457) | `(client-portal)/client-portal/sites/[siteId]/page.tsx:2` |
| src/views/ClientPortalSubsectionDetail.tsx | source | 574 | default `ClientPortalSubsectionDetail()` — no props (25,575) | `(client-portal)/client-portal/subsections/[subsectionId]/page.tsx:2` |
| src/views/ClientPortalCalendar.tsx | source | 256 | default `ClientPortalCalendar()` — no props (12,256) | `(client-portal)/client-portal/calendar/page.tsx:2` |
| src/views/ContractorPortal.tsx | source | 251 | default `ContractorPortal()` — no props (14,251) | `(contractor)/contractor/page.tsx:2`; reads `?preview=` search param (ContractorPortal.tsx:17-18) |
| src/views/ContractorSubsectionDetail.tsx | source | 299 | default `ContractorSubsectionDetail()` — no props (16,299) | `(contractor)/contractor/subsections/[subsectionId]/page.tsx:2` |
| src/views/ContractorDashboard.tsx | source | 98 | default `ContractorDashboard()` — no props (8,98) | No importers found (see Oddities) |
| src/views/ContractorSites.tsx | source | 110 | default `ContractorSites()` — no props (10,110) | No importers found (see Oddities) |
| src/views/ContractorSiteDetail.tsx | source | 277 | default `ContractorSiteDetail()` — no props (14,277) | No importers found (see Oddities) |
| src/views/AdminClientPreview.tsx | source | 148 | default `AdminClientPreview()` — no props (11,148) | No importers found (see Oddities) |
| src/views/AdminContractorPreview.tsx | source | 188 | default `AdminContractorPreview()` — no props (12,188) | No importers found (see Oddities) |
| src/views/ClientAccessSimulator.tsx | source | 336 | default `ClientAccessSimulator()` — no props (24) | No importers found (see Oddities) |
| src/views/ContractorAccessSimulator.tsx | source | 317 | default `ContractorAccessSimulator()` — no props (26) | No importers found (see Oddities) |

## Public / entry / shell views (top-level)

| Path | Type | LOC | Public surface | Route consumer(s) / notes |
|---|---|---|---|---|
| src/views/Index.tsx | source | 53 | default `Index()` — no props (5,53) | `src/app/page.tsx:2`; role-based entry redirect (see Runtime observations) |
| src/views/NotFound.tsx | source | 24 | default `NotFound()` — no props (4,24) | `src/app/not-found.tsx:3` |
| src/views/Auth.tsx | source | 125 | default `Auth()` — no props (34,125) | `src/app/auth/page.tsx:2`; `"use client"`; legacy `/auth` dispatcher for old-style email links (`?type=invite`, `?type=recovery`) per file comments Auth.tsx:9-32 |
| src/views/Install.tsx | source | 148 | default `Install()` — no props (12) | `src/app/install/page.tsx:2` |
| src/views/DownloadHandoff.tsx | source | 153 | default `DownloadHandoff()` — no props (29) | `src/app/download/[requestId]/page.tsx:2`; `"use client"` |
| src/views/PublicClientPortfolio.tsx | source | 391 | default `PublicClientPortfolio()` — no props (40,391) | `src/app/portfolio/[token]/page.tsx:2` |
| src/views/PublicSiteReview.tsx | source | 567 | default `PublicSiteReview()` — no props (112,567) | 2 routes: `portfolio/[token]/site/[siteId]/page.tsx:2` and `review/[token]/page.tsx:2` |
| src/views/PublicSubsectionReview.tsx | source | 1055 | default `PublicSubsectionReview()` — no props (108,1055) | `review/[token]/subsection/[subsectionId]/page.tsx:2` |
| src/views/PublicSubsection.tsx | source | 469 | default `PublicSubsection()` — no props (101,469) | 2 routes: `public/subsections/[subsectionId]/page.tsx:2` and `public/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/page.tsx:2`; raw `fetch(url)` blob download (191) |
| src/views/PublicSiteRegister.tsx | source | 174 | default `PublicSiteRegister()` — no props (30,174) | `public/sites/[siteId]/register/page.tsx:2` |

## src/views/auth/ (8 files — all `"use client"`)

| Path | Type | LOC | Public surface | Route consumer(s) / notes |
|---|---|---|---|---|
| src/views/auth/Login.tsx | source | 376 | default `Login()` — no props (40) | `src/app/auth/login/page.tsx:3` |
| src/views/auth/Signup.tsx | source | 38 | default `Signup()` — no props (15) | `src/app/auth/signup/page.tsx:2` |
| src/views/auth/ForgotPassword.tsx | source | 220 | default `ForgotPassword()` — no props (40) | `src/app/auth/forgot-password/page.tsx:2` |
| src/views/auth/ResetPassword.tsx | source | 148 | default `ResetPassword()` — no props (25); internal `PasswordField({ id, label, error, ...rest }: PasswordFieldProps)` (137) | `src/app/auth/reset-password/page.tsx:2` |
| src/views/auth/SetPassword.tsx | source | 159 | default `SetPassword()` — no props (24); internal `PasswordField` (148) | `src/app/auth/set-password/page.tsx:2` |
| src/views/auth/AuthLayout.tsx | source | 90 | named `AuthLayout({ title, subtitle, children }: AuthLayoutProps)` (21) | Shared layout used within `src/views/auth/*` pages (grep hits confined to that dir) |
| src/views/auth/PasswordStrengthMeter.tsx | source | 79 | named `PasswordStrengthMeter({ password }: Props)` (20) | Used within `src/views/auth/*` |
| src/views/auth/useRoleRedirect.ts | source | 36 | named hook `useRoleRedirect()` (12) | Used within `src/views/auth/*` |

## src/views/site-coc/ (11 files — Site COC tab, composed into SiteDetail)

External consumer: `src/views/SiteDetail.tsx:30` imports `SiteCocTab`; rendered in the `site-coc` tab (SiteDetail.tsx:751,837). No consumers outside src/views found.

| Path | Type | LOC | Public surface |
|---|---|---|---|
| src/views/site-coc/SiteCocTab.tsx | source | 97 | named `SiteCocTab({ siteId: string \| undefined; siteName: string; clientName?: string \| null; siteAddress?: string \| null; siteKpis?: SiteKpiBlock; companyLogo?: string \| null })` (19) |
| src/views/site-coc/AssignSubTab.tsx | source | 160 | named `AssignSubTab({ pending, subsections, onAssign, onAssignMany, onReassign, onUpdateCertNo, onGoToSchedule, hasImport, busy })` (72) |
| src/views/site-coc/CertificatesSubTab.tsx | source | 81 | named `CertificatesSubTab({ rows }: { rows: CocCertRow[] })` (26) |
| src/views/site-coc/ReportSubTab.tsx | source | 154 | named `ReportSubTab({ siteId, siteName, schedule, certificates, batch, subsections, clientName, siteAddress, siteKpis, companyLogo })` (20); removes from `documents` bucket (91) |
| src/views/site-coc/ScheduleSubTab.tsx | source | 111 | named `ScheduleSubTab({ rows, subsections, onResolve }: Props)` (27) |
| src/views/site-coc/SiteCocLoadCard.tsx | source | 61 | named `SiteCocLoadCard({ pool, hasImport }: { pool: ReturnType<typeof useSiteCocPool>; hasImport: boolean })` (7) |
| src/views/site-coc/StatusPill.tsx | source | 17 | named `StatusPill({ tone, label, title, className }: { tone: Tone; label: string; title?: string; className?: string })` (4) |
| src/views/site-coc/VerificationSubTab.tsx | source | 91 | named `VerificationSubTab({ rows }: { rows: CocCertRow[] })` (36) |
| src/views/site-coc/useSiteCoc.ts | source | 88 | named hook `useSiteCoc(siteId: string \| undefined)` (28); interfaces `CocScheduleRow` (7), `CocCertRow` (13), `CocBatch` (20), `SubsectionOption` (26) |
| src/views/site-coc/useSiteCocImport.ts | source | 152 | named hook `useSiteCocImport(siteId: string \| undefined, onDone: () => void)` (21) |
| src/views/site-coc/useSiteCocPool.ts | source | 120 | named hook `useSiteCocPool(siteId: string \| undefined, onAssigned: () => void)` (16); interface `PoolFile` (9); removes from `documents` bucket (113) |

## src/views/subsection-detail/ (9 files — SubsectionDetail decomposition)

Consumers: `src/views/SubsectionDetail.tsx:17` (barrel import) and `src/components/coc/CocCertificateList.tsx:5` (`SupabaseDocument` type only).

| Path | Type | LOC | Public surface |
|---|---|---|---|
| src/views/subsection-detail/index.ts | source | 8 | barrel re-exporting `useSubsectionDetail`, `OverviewTab`, `InspectionsTab`, `DocumentsTab`, `CocMeteringTab`, `CreateSubsectionForm`, `SubsectionDialogs`, `export type * from "./types"` (index.ts:1-8) |
| src/views/subsection-detail/types.ts | source | 65 | interfaces `SubsectionData` (1), `SiteData` (23), `CocDocData` (28), `SupabaseDocument` (35), `DocumentCategory` (49), `EditFormData` (54), `PendingDocumentForVerification` (61) |
| src/views/subsection-detail/useSubsectionDetail.ts | source | 1214 | named hook `useSubsectionDetail()` — no params (20); returns the tab-shared state/handlers object (aggregate hook for the whole view) |
| src/views/subsection-detail/OverviewTab.tsx | source | 493 | named `OverviewTab({...})` — destructured props (39) |
| src/views/subsection-detail/InspectionsTab.tsx | source | 239 | named `InspectionsTab({...})` (42) |
| src/views/subsection-detail/DocumentsTab.tsx | source | 298 | named `DocumentsTab({...})` (37) |
| src/views/subsection-detail/CocMeteringTab.tsx | source | 352 | named `CocMeteringTab({...})` (52) |
| src/views/subsection-detail/CreateSubsectionForm.tsx | source | 131 | named `CreateSubsectionForm({...})` (20) |
| src/views/subsection-detail/SubsectionDialogs.tsx | source | 203 | named `SubsectionDialogs({...})` (28) |

## Runtime observations

- Entry redirect: `src/views/Index.tsx:8-44` — on mount, `supabase.auth.getSession()`; no session → `/auth`; else queries `user_roles` and routes `Client` → `/client-portal`, `Contractor` → `/contractor`, else `/dashboard` (fallback `/dashboard` when the role query throws).
- Legacy auth dispatcher: `src/views/Auth.tsx:34-44+` — inspects `window.location.search` for `?type=invite` / `?type=recovery` from old email links and redirects to the dedicated `/auth/*` routes (behavior documented in comments Auth.tsx:9-32).
- Supabase Edge Function invocations (external service calls): `offline-review` at src/views/OfflineReview.tsx:41; `invite-user` at src/views/Users.tsx:261, 303, 373; `delete-user` at src/views/Users.tsx:522.
- Supabase Storage buckets touched from views: `client-logos` (ClientDetail.tsx:117-118), `documents` (InspectionDetail.tsx:1522; SiteDetail.tsx:525,561,563; site-coc/ReportSubTab.tsx:91; site-coc/useSiteCocPool.ts:113; subsection-detail/useSubsectionDetail.ts:707,763,789,857,880), `inspection-photos` (InspectionDetail.tsx:1558), `profile-images` (Users.tsx:607,626).
- Supabase Realtime subscriptions: `useSubsectionDetail.ts:355-386` — three `postgres_changes` channels per subsection on tables `snags`, `inspections`, `subsection_documents`, cleaned up via `supabase.removeChannel`.
- Raw `fetch()` (blob downloads of document URLs): src/views/PublicSubsection.tsx:191; src/views/subsection-detail/useSubsectionDetail.ts:908.
- Offline path: `useSubsectionDetail.ts:351-353` calls `loadOfflineData()` when `!isOnline`.
- `"use client"` directive present in exactly 10 of 74 files (`grep -l "use client"`): Auth.tsx, DownloadHandoff.tsx, and all 8 `src/views/auth/*` files.

## Oddities (factual)

- 9 views have no importers anywhere in tracked src. Command: for each name, `grep -rn "views/<Name>" src --include='*.ts' --include='*.tsx'` (excluding the file itself and untracked `" 2."` files) returned nothing: APIClients.tsx (484 LOC), AdminClientPreview.tsx (148), AdminContractorPreview.tsx (188), ClientAccessSimulator.tsx (336), ContractorAccessSimulator.tsx (317), ContractorDashboard.tsx (98), ContractorSiteDetail.tsx (277), ContractorSites.tsx (110), SiteAssignments.tsx (826). Combined 2784 LOC.
- The `(admin)/site-assignments` route imports `PortalManagement`, not `SiteAssignments`: src/app/(admin)/site-assignments/page.tsx:2 `import PortalManagement from "@/views/PortalManagement"` — while the 826-LOC SiteAssignments.tsx sits unimported.
- 12 untracked duplicate files with `" 2"` suffix exist in src/views (`ls -1 src/views/ | grep ' 2'`): Calendar, ClientPortalSites, Clients, ContractorPortal, ContractorSiteDetail, Dashboard, InspectionTemplates, IssueReports, OfflineReview, OfflineSyncTest, PublicClientPortfolio, Settings — of which `IssueReports 2.tsx` and `OfflineSyncTest 2.tsx` have **no tracked counterpart** in the slice.
- InspectionDetail.tsx is 3102 LOC — the largest file in the slice — and is shared by three routes across the admin and contractor route groups.
- InspectionTemplates is the only view loaded through `next/dynamic` (src/app/(admin)/inspection-templates/page.tsx:4); every other page uses a static import.
- PDFTemplateTestDashboard.tsx is an in-app test-runner UI routed at `(admin)/pdf-template-tests` — it lives with production views, not under a test tree.
- Two near-identical internal `PasswordField` components exist: auth/ResetPassword.tsx:137 and auth/SetPassword.tsx:148.

## ASSUMED (inferred, not verified)

- The 64 views without a `"use client"` directive are assumed to run as client components via a directive in the consuming `src/app/**/page.tsx` wrappers (individual page files not opened for this check; all views use client-only hooks such as useState/useNavigate).
- The 9 unimported views are assumed dead/unreachable at runtime; a dynamic import built from a template string could evade the greps used, though none was observed.
- AdminClientPreview / AdminContractorPreview / the two AccessSimulator views appear (by name and by ContractorPortal.tsx:17 reading a `?preview=` search param) to be a superseded admin-preview mechanism — inferred from naming only.
- `useSubsectionDetail()` is assumed to return a single large state/handlers object consumed by all tab components (declaration at useSubsectionDetail.ts:20 verified; full 1214-line return shape not read line-by-line).
- The `" 2"`-suffixed untracked files are assumed to be filesystem copy artifacts (e.g. Finder/sync duplication), inferred from the macOS-style naming pattern.
