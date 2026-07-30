# C11 — layout-navigation

- Unit id: C11
- Slug: layout-navigation
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 5 (per `review/unit-files.json` key "C11")

## Unit header

**Unit purpose (as-is).** This unit is the app-chrome layer for the three authenticated surfaces: the admin/staff sidebar (`AppSidebar`), the client-portal shell (`ClientPortalLayout`, sidebar + header wrapper), and the contractor-portal shell (`ContractorPortalLayout`, sidebar + header + preview banner wrapper). It also holds two navigation widgets consumed by page bodies: a presentational breadcrumb trail (`Breadcrumbs`) and the Cmd+K global search palette (`GlobalSearch`).

**Module-level observations (cross-file facts).**
- All three chrome files register a react-query entry under the same key `["current-user-profile"]` (AppSidebar.tsx:81, ClientPortalLayout.tsx:48, ContractorPortalLayout.tsx:53) with different queryFns: AppSidebar and ClientPortalLayout select `full_name, avatar_url, email` from `profiles` and throw on error (AppSidebar.tsx:88/92, ClientPortalLayout.tsx:55/59); ContractorPortalLayout selects `*` and discards the error (ContractorPortalLayout.tsx:58-64). Three other files invalidate that key (src/components/OnboardingWizard.tsx:125, src/views/MyProfile.tsx:107,138, src/views/Users.tsx:511 — grep-verified).
- All three chrome files implement logout the same base way — `recordAuthEvent("logout")` before `supabase.auth.signOut()` then navigate to `/auth/login` (AppSidebar.tsx:109-116, ClientPortalLayout.tsx:81-88, ContractorPortalLayout.tsx:76-79) — but only AppSidebar and ClientPortalLayout branch on the signOut error; ContractorPortalLayout ignores it. Both portal layouts add an admin-preview escape branch that navigates to `/portal-management` instead (ClientPortalLayout.tsx:75-79, ContractorPortalLayout.tsx:70-74).
- Label-collapse gating differs per file: AppSidebar uses `isMobile || !collapsed` (AppSidebar.tsx:136,168,189), ClientSidebar uses `!collapsed` alone (ClientPortalLayout.tsx:110,137,157), ContractorSidebar uses `open` (ContractorPortalLayout.tsx:96,124,142,153).
- Provider placement differs: `AppSidebar` renders no `SidebarProvider` (grep for `SidebarProvider` in AppSidebar.tsx: no hits) — the admin route layout provides it with `defaultOpen={true}` (src/app/(admin)/layout.tsx:4,13); both portal layouts embed their own `SidebarProvider defaultOpen={false}` (ClientPortalLayout.tsx:195, ContractorPortalLayout.tsx:187).
- Mounting pattern differs: ClientPortalLayout is mounted once by the route-group layout (A06 src/app/(client-portal)/layout.tsx:6,11); ContractorPortalLayout is imported and wrapped by each contractor view individually, including separate loading/error/main branches per view (V03, e.g. src/views/ContractorPortal.tsx:87,102,113).
- Untracked on-disk duplicates `src/views/ContractorPortal 2.tsx` and `src/views/ContractorSiteDetail 2.tsx` also import ContractorPortalLayout (grep hit); they are outside the manifest's 936 tracked files (git status shows them untracked).
- No test file in the repo references any of the five files (grep across `*.test.*`/`*.spec.*`: zero hits).

**External contract.** The rest of the app gets: `AppSidebar` + `GlobalSearch` consumed only by the admin shell (A03); `ClientPortalLayout` consumed only by the client-portal route layout (A06); `ContractorPortalLayout` consumed by five contractor views (V03); `Breadcrumbs` consumed by five admin entity views (V01) and two portal views (V03). All navigation goes through the react-router-compat shims in `src/lib/navigation.tsx` (L13); all data reads go through the shared supabase client (L19) or H03 hooks.

---

## src/components/AppSidebar.tsx
- Purpose: Admin/staff sidebar with role-filtered navigation menu, company branding header, current-user footer, and logout.
- Public surface: `export function AppSidebar(): JSX.Element` — no props (line 52). Module-local (unexported) `menuItems: { title, url, icon, adminOnly }[]` with 7 entries: /dashboard, /calendar, /clients, /qr-codes, /qr-activity, /inspection-templates, /settings (lines 42-50); only Settings is `adminOnly: true` (line 49).
- Inputs & outputs: reads table `settings` → `company_logo_url, company_name` via `.single()`, query key `["company-settings"]` (lines 66-77); reads `supabase.auth.getUser()` then table `profiles` → `full_name, avatar_url, email` for that id, query key `["current-user-profile"]` (lines 80-95); role via `useUserRole()` (line 56) filters `adminOnly` items (line 150). Outputs: `NavLink`s to the 7 menu URLs plus `/profile` (line 210); logout emits an auth-audit event (line 109), calls `supabase.auth.signOut()` (line 110) and navigates to `/auth/login` (line 115). No localStorage/env access in this file.
- Dependencies: uses -> `lucide-react` icons (1-20); `NavLink`, `useNavigate` from `@/lib/navigation` (line 21, L13); `supabase` from `@/integrations/supabase/client` (line 22, L19); `recordAuthEvent` from `@/lib/auth-audit` (line 23, L13); `toast` from `sonner` (24); `useQuery` from `@tanstack/react-query` (25); `Avatar*` from `@/components/ui/avatar` and `Sidebar*`/`useSidebar` from `@/components/ui/sidebar` (26-39, C01); `useUserRole` from `@/hooks/useUserRole` (line 40, H03). used by <- A03 src/app/(admin)/layout.tsx:5 (rendered at line 15) — sole consumer (grep-verified).
- Side effects: two supabase reads on mount via react-query; `setOpenMobile(false)` on any nav click when mobile (59-63); on logout: fire-and-forget POST to the log-auth-event edge function via `recordAuthEvent` (which queues to localStorage on failure — src/lib/auth-audit.ts:87-105), auth signOut network call, sonner toasts, client-side navigation.
- Error handling: both queryFns `throw error` on supabase error (74, 92) — the component renders without the section (`settings?.` fallback to Zap icon + "SiteWise" name at 123-139; `currentUser &&` guard at 181); no error UI. `signOut` error → `toast.error("Error signing out")` and no navigation (111-112); success → success toast + navigate (113-115). `recordAuthEvent` never throws (void async, auth-audit.ts:90-104). A code comment states the event is logged before signOut because the JWT is invalidated after (107-108).
- Tests: none found (grep-verified).
- Observed issues:
  - Eight imported lucide icons are never used in the file body: `Building2`, `ClipboardCheck`, `UserCog`, `Eye`, `Briefcase`, `Lightbulb`, `FileCode`, `Sparkles` (lines 4, 5, 8, 13, 14, 16, 17, 18 — each name occurs exactly once in the file, grep-counted).
  - `["current-user-profile"]` key shared with the two portal layouts with a non-identical queryFn (see module observations).
  - `.single()` on the `settings` query (line 72) errors for 0 or >1 rows; that error is thrown into react-query state.
  - Only `state === "collapsed"` is aliased to `collapsed` (line 55); active-link styling relies on `NavLink`'s `className` function (161-165), whose `isActive` comes from `pathname.startsWith(to)` in the shim (src/lib/navigation.tsx:134-136) since no `end` prop is passed.
- ASSUMED: `settings` is intended as a single-row company-wide table (inferred from `.single()`; migrations not inspected in this unit). RLS effects on `settings`/`profiles` reads for non-admin roles not verified here.

## src/components/ClientPortalLayout.tsx
- Purpose: Client-portal shell — client-branded sidebar with portal navigation, profile footer, and logout/exit-preview, wrapped with a header around page children.
- Public surface: `export const ClientPortalLayout: ({ children }: { children: React.ReactNode }) => JSX.Element` (line 194). Internal unexported `ClientSidebar()` component (line 25).
- Inputs & outputs: URL search param `preview` (lines 29-30) selects admin-preview mode; `useClientInfo(previewClientId || undefined)` (line 31) supplies `clientInfo.clients` for logo/name (91, 97-113); `useUserRole()` (line 32); `profiles` read identical to AppSidebar under key `["current-user-profile"]` (47-62). Menu items are built per-render with the `preview` param appended: `/client-portal`, `/client-portal/sites`, `/client-portal/calendar` (41-45). Outputs: nav links, `/profile` link (173), logout → auth-audit event + signOut + navigate `/auth/login` (81-88), or in Admin+preview mode navigate `/portal-management` with toast "Exited preview mode" (75-79). Wrapper renders `SidebarProvider defaultOpen={false}`, a sticky h-16 header with `SidebarTrigger` and static title "Client Portal", and children in a padded flex column (194-209).
- Dependencies: uses -> `lucide-react` (1); `NavLink`, `useNavigate`, `useSearchParams` from `@/lib/navigation` (2, L13); `supabase` (3, L19); `recordAuthEvent` (4, L13); `sonner` (5); `@tanstack/react-query` (6); `ui/avatar`, `ui/sidebar` incl. `SidebarProvider`/`SidebarTrigger` (7-22, C01); `useClientInfo`, `useUserRole` from `@/hooks/useUserRole` (23, H03). used by <- A06 src/app/(client-portal)/layout.tsx:6 (wraps children at 11-13) — sole tracked consumer (grep-verified).
- Side effects: supabase reads via hooks/query; signOut network call; auth-audit event; toasts; navigation; `setOpenMobile(false)` on nav click (35-39).
- Error handling: profile queryFn throws on supabase error (line 59) → `currentUser &&` guard hides the footer block (149); signOut error → `toast.error` and no navigation (83-84); success → toast + navigate (85-87). No error handling around `useClientInfo`/`useUserRole` in this file — header falls back to Building2 icon + "Client Portal" text when client data is absent (105-113).
- Tests: none found (grep-verified).
- Observed issues:
  - Label visibility uses `!collapsed` without the `isMobile ||` disjunct used in AppSidebar (110, 137, 157, 175, 182 vs AppSidebar.tsx:136).
  - The "My Profile" NavLink (173) has no `onClick={handleNavClick}`, unlike the menu items (129), so the mobile sheet is not explicitly closed on that navigation.
  - In preview mode the item URLs embed a query string (42-44); the NavLink shim computes `isActive` by comparing `to` against `usePathname()` (src/lib/navigation.tsx:133-136), and a pathname never contains `?`, so with `preview` set neither the `startsWith` branch nor the `end` equality (`end={item.url === "/client-portal"}`, line 128, false when the url carries `?preview=`) computes true — no item receives active styling in preview mode.
  - Footer button text switches between "Exit Preview" and "Logout" from `userRole === "Admin" && previewClientId` (183), the same condition as the logout branch (75).
  - Shared `["current-user-profile"]` key (see module observations).
- ASSUMED: `useClientInfo`'s non-preview return branch also yields a `{ clients: {...} }` shape (only the preview branch, src/hooks/useUserRole.tsx:70-80, was read in this pass); H03 spec is the authority.

## src/components/ContractorPortalLayout.tsx
- Purpose: Contractor-portal shell — single-item sidebar with profile/logout footer, header, and an admin-preview notice banner above page children.
- Public surface: default export `ContractorPortalLayout: ({ children }: { children: React.ReactNode }) => JSX.Element` (181-211, exported at 211). Internal unexported `ContractorSidebar` (32). Module-local `menuItems` with one entry: Site Overview → `/contractor` (28-30).
- Inputs & outputs: URL search param `preview` read in both the sidebar (35-36) and the outer layout (182-183); `useUserRole()` in both (37, 184); `profiles` read with `select("*")` under key `["current-user-profile"]` (52-66). Item URLs get `?preview=<id>` appended when previewing (47-50). Outputs: nav link, `/profile` navigation via button (159), logout → in Admin+preview navigate `/portal-management` + toast "Exited contractor preview mode" (70-74), else auth-audit event + `await supabase.auth.signOut()` + unconditional success toast + navigate `/auth/login` (76-79). Layout wrapper: own `SidebarProvider defaultOpen={false}` (187), sticky h-14 header with `SidebarTrigger` + "Contractor Portal" title (191-194), and when `userRole === "Admin" && previewSiteId` an `Alert` ("You are viewing the contractor portal as an admin...") with hardcoded `bg-blue-50 border-blue-200` classes (196-202).
- Dependencies: uses -> `lucide-react` (1); `NavLink`, `useNavigate`, `useSearchParams` from `@/lib/navigation` (2, L13); `supabase` (3, L19); `recordAuthEvent` (4, L13); `sonner` (5); `@tanstack/react-query` (6); `useUserRole` (7, H03); `ui/alert`, `ui/sidebar`, `ui/avatar`, `ui/button`, `ui/separator` (8-26, C01). used by <- V03: src/views/ContractorPortal.tsx:12, src/views/ContractorSiteDetail.tsx:12, src/views/ContractorSubsectionDetail.tsx:11, src/views/ContractorSites.tsx:8, src/views/ContractorDashboard.tsx:6 (each wraps its loading/error/main branches separately, e.g. ContractorPortal.tsx:87,102,113); plus untracked duplicates `src/views/ContractorPortal 2.tsx` and `src/views/ContractorSiteDetail 2.tsx` (grep-verified; not in the tracked manifest). The A07 contractor route layout does not import it (no grep hit under src/app).
- Side effects: supabase reads; signOut network call; auth-audit event; toasts; navigation; `setOpenMobile(false)` on nav click (40-44).
- Error handling: profile queryFn destructures only `data` — the supabase error is silently discarded and `profile` may be null (58-64); UI falls back to a User icon / "Contractor" / empty email (139, 145, 148). `handleLogout` has no error branch: the signOut result is not checked, the success toast and navigation always run (77-79).
- Tests: none found (grep-verified).
- Observed issues:
  - `MapPin` imported and never used (line 1; single occurrence in file).
  - `select("*")` on `profiles` where the other two layouts select three columns, under the same query key (see module observations).
  - `end` is always passed on the nav item (115); in preview mode `to` contains `?preview=` so `pathname === to` (navigation.tsx:134-135) is never true — no active styling while previewing.
  - `getInitials(name: string)` assumes a non-null string (82-89); the call site guards with `currentUser?.full_name ?` (139).
  - The sidebar gates labels on `open` (96, 124, 142, 153) rather than `state`/`isMobile` as in the sibling layouts; the footer's Profile/Logout buttons render only when `open` is true (153-175).
  - Preview banner colors are raw Tailwind palette classes (`bg-blue-50 border-blue-200`, line 197), not theme tokens as elsewhere in the unit.
- ASSUMED: none beyond the shared RLS caveat (profiles `select *` behavior under RLS not verified in this unit).

## src/components/Breadcrumb.tsx
- Purpose: Presentational breadcrumb trail with a fixed leading Home link to `/dashboard` and chevron-separated, optionally linked, icon-capable items.
- Public surface: `export const Breadcrumbs: ({ items, className }: BreadcrumbProps) => JSX.Element` (line 23). File-local (unexported) `interface BreadcrumbItem { label: string; href?: string; icon?: "home" | "client" | "site" | "subsection" }` (5-9) and `interface BreadcrumbProps { items: BreadcrumbItem[]; className?: string }` (11-14); unexported `iconMap` mapping the four icon keys to lucide components (16-21).
- Inputs & outputs: props only; no data fetching, no stores, no state. Renders a `<nav>` with a hardcoded `Link to="/dashboard"` Home crumb (26-32), then per item a ChevronRight separator plus either a `Link` (when `href` present, 38-46) or a non-link `<span>` styled as the current crumb (48-51), both truncated at max-w-[150px]/sm:200px with `title={item.label}` tooltips.
- Dependencies: uses -> `lucide-react` (1); `Link` from `@/lib/navigation` (2, L13); `cn` from `@/lib/utils` (3, L18). used by <- V01: src/views/Sites.tsx:5, src/views/SiteDetail.tsx:25, src/views/ClientDetail.tsx:11, src/views/SubsectionDetail.tsx:6, src/views/InspectionDetail.tsx:26; V03: src/views/ClientPortalSiteDetail.tsx:18, src/views/ContractorSubsectionDetail.tsx:12 (grep-verified, 7 consumers).
- Side effects: none (pure render; navigation only on user click via Next Link).
- Error handling: none — no failure paths exist; an unknown `icon` value is prevented by the union type, absent `icon` renders no icon (34, 44).
- Tests: none found (grep-verified).
- Observed issues:
  - Filename is singular (`Breadcrumb.tsx`) while the export is plural (`Breadcrumbs`), also flagged in Phase 1 (review/inventory/09-src-components.md:287).
  - The leading crumb always links to `/dashboard` (line 27) — an admin-shell route — while two grep-verified consumers are portal views (ClientPortalSiteDetail, ContractorSubsectionDetail in V03).
  - Array index is used as the React key (line 36).
  - `BreadcrumbItem`/`BreadcrumbProps` are not exported, so consumers pass structural object literals.
  - A separate vendored `src/components/ui/breadcrumb.tsx` exists in C01 (file present on disk, verified by ls); this file does not use it.
- ASSUMED: nothing.

## src/components/GlobalSearch.tsx
- Purpose: Cmd/Ctrl+K command-palette searching clients, sites, subsections, and inspections, with a filter popover (clients, site types, COC statuses, date range) and navigation to the selected result.
- Public surface: `export const GlobalSearch: () => JSX.Element` — no props (line 36).
- Inputs & outputs: local state `open`, `searchQuery`, `filters: SearchFilters` (37-39; `SearchFilters` = `{ clientIds?, siteTypes?, cocStatuses?, dateFrom?, dateTo? }`, src/hooks/useGlobalSearch.ts:23-29). Data in: `useGlobalSearch(searchQuery, filters)` (42) — H03 hook that ilike-queries tables `clients`, `sites`, `subsections`, `inspections` (10 rows each) and returns `SearchResult[]` with prebuilt `url`s, enabled at ≥2 characters (useGlobalSearch.ts:44-233); `useSearchFilterOptions()` (43) — clients list, distinct non-null `site_type`s, and a hardcoded `cocStatuses: ["Valid", "Expired", "Missing", "Pending"]` (useGlobalSearch.ts:235-265). Data out: `navigate(result.url)` on selection, dialog closed and query cleared (58-62). No direct supabase/storage/localStorage access in this file.
- Dependencies: uses -> `react` (1); `useNavigate` from `@/lib/navigation` (2, L13); `Command*` from `ui/command`, `Button`, `Badge`, `Popover*`, `Checkbox`, `Label`, `Calendar`, `ScrollArea` (3-22, C01); `lucide-react` (23-32); `useGlobalSearch`, `useSearchFilterOptions`, `SearchFilters` from `@/hooks/useGlobalSearch` (33, H03); `cn` from `@/lib/utils` (34, L18 — imported; `cn` is not referenced in the JSX body, single occurrence at the import, grep-counted). used by <- A03 src/app/(admin)/layout.tsx:6 (rendered in the admin header at line 21) — sole consumer (grep-verified).
- Side effects: `document` keydown listener registered on mount and removed on unmount, toggling the dialog on Cmd/Ctrl+K (46-56); client-side navigation on select; network reads only via the H03 hooks.
- Error handling: none in this file. `CommandEmpty` text switches between "Type at least 2 characters to search...", "Searching...", and "No results found." based on query length and `isLoading` (286-292). The H03 hooks discard supabase errors by destructuring only `data` (useGlobalSearch.ts:69, 97, 129, 188), so failed table queries surface as an empty group, not an error state.
- Tests: none found (grep-verified).
- Observed issues:
  - `CommandInput` is imported (line 7) but unused — a raw `<input>` element is rendered instead (108-113); `X` icon is also imported unused (line 30); `cn` imported unused (line 34). Each occurs exactly once in the file (grep-counted).
  - The shortcut hint always renders `⌘K` (100-102) while the handler also accepts `ctrlKey` (48).
  - `CommandItem value={result.title}` (line 308) — the cmdk item value is the result title, not the id.
  - Result groups render in the fixed order client → site → subsection → inspection with pluralized headings derived by string concatenation (296-303).
  - The filter popover's COC status list comes from the hardcoded vocabulary in `useSearchFilterOptions` (useGlobalSearch.ts:263), one of the multiple COC status vocabularies noted in the manifest (L09 row).
  - Mounted only in the admin shell; the client- and contractor-portal chromes in this same unit contain no search entry point (grep-verified single consumer).
- ASSUMED: cmdk's internal behavior when `CommandDialog`/`CommandList` are used without a `CommandInput` (no cmdk-driven filtering was assumed to apply to the manually rendered groups; the vendored C01 `ui/command.tsx` was not read in this pass).
