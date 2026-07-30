# C01 — ui-kit-shadcn

- Unit id: C01
- Slug: ui-kit-shadcn
- Spec mode: aggregate (one composite spec for the vendored kit)
- Date: 2026-07-29
- File count: 49 (authoritative set = `review/unit-files.json` key "C01"; printed count 49; on-disk `ls -1 src/components/ui/ | wc -l` = 49)

## 1. Unit purpose

`src/components/ui/` is a vendored shadcn/ui component kit: 49 files, ~3,905 LOC total, all presentational React wrappers around Radix primitives (and a handful of non-Radix libraries: sonner, vaul, embla, cmdk, react-day-picker, recharts, react-resizable-panels, input-otp, react-hook-form). 48 of 49 files have not been touched since the scaffold commit `e2dfda5` (2025-10-14, "[skip lovable] Use tech stack vite_react_shadcn_ts_20250728_minor"); the only post-scaffold change in the entire directory is a single className line in `tabs.tsx` (see §4.1). The kit contains no entry points, no network calls, no Supabase usage, and no tests. Its only environment side effects are in `sidebar.tsx` (cookie write, global keydown listener) and `sonner.tsx` (theme read via next-themes).

## 2. Kit-level dependency & theming architecture

**cn utility.** 44 of 49 files import `cn` from `@/lib/utils` (grep `from "@/` inside the kit; the 5 non-importers are aspect-ratio.tsx, collapsible.tsx, sonner.tsx, toaster.tsx, use-toast.ts). `cn` is `twMerge(clsx(inputs))` — src/lib/utils.ts:4-6, built on `clsx ^2.1.1` and `tailwind-merge ^2.6.0` (package.json).

**shadcn config.** components.json declares: `"style": "default"`, `"rsc": false`, `"tsx": true`, tailwind config `tailwind.config.ts`, css `src/index.css`, baseColor `slate`, `"cssVariables": true`, and aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks` (components.json:3-16).

**Tailwind linkage.** tailwind.config.ts:4 sets `darkMode: ["class"]`. The `theme.extend.colors` block maps every semantic token the kit's class strings use to CSS variables: `border/input/ring/background/foreground` plus `primary/secondary/destructive/muted/accent/popover/card` (each with `-foreground`) and an 8-token `sidebar` group — all as `hsl(var(--x))`. `borderRadius` maps lg/md/sm to `var(--radius)`. Accordion open/close keyframes + animations are defined for `accordion.tsx`'s `animate-accordion-{down,up}` classes, and the sole plugin is `tailwindcss-animate` (tailwind.config.ts, final line) which supplies the `animate-in/animate-out/fade-*/slide-*/zoom-*` utilities used throughout the overlay components.

**CSS variables.** src/index.css defines the light palette under `:root` (lines 11-57) and the dark palette under `.dark` (lines 60-105). Lines 50-57 and 98-105 additionally define `--success/--warning/--info` (+`-foreground`) tokens that have **no** mapping in tailwind.config.ts's colors block (verified by reading the full colors object). Content globs `./src/**/*.{ts,tsx}` etc. cover the kit (tailwind.config.ts:5).

**Client/server boundary.** No file in the kit contains a `"use client"` directive (grep for both quote styles: 0 hits across all 49 files) — consistent with the Vite-era scaffold and `"rsc": false`. In the current Next.js App Router build the boundary is supplied by importers, e.g. src/app/providers.tsx:1 and src/app/(admin)/layout.tsx:1 both begin with `"use client";`.

**Third-party surface.** package.json carries 27 `@radix-ui/*` packages; per-component libraries verified present: `sonner ^1.7.4`, `vaul ^0.9.9`, `embla-carousel-react ^8.6.0`, `cmdk ^1.1.1`, `react-day-picker ^8.10.1`, `recharts ^2.15.4`, `react-resizable-panels ^2.1.9`, `input-otp ^1.4.2`, `react-hook-form ^7.61.1`, `next-themes ^0.3.0`, `class-variance-authority ^0.7.1`, `tailwindcss-animate ^1.0.7`.

**Intra-kit imports** (grep `@/components/ui/` inside the kit): alert-dialog→button (alert-dialog.tsx:5), calendar→button (calendar.tsx:6), carousel→button (carousel.tsx:6), command→dialog (command.tsx:7), form→label (form.tsx:7), pagination→button (pagination.tsx:5), sidebar→button/input/separator/sheet/skeleton/tooltip (sidebar.tsx:8-13), toaster→toast (toaster.tsx:2), toggle-group→toggle (toggle-group.tsx:6).

**Out-of-kit imports from inside the kit**: `cn` (44 files, above); sidebar.tsx:6 → `@/hooks/use-mobile` (file exists: src/hooks/use-mobile.tsx, unit H04); toaster.tsx:1 and use-toast.ts:1 → `@/hooks/use-toast` (src/hooks/use-toast.ts, unit H04).

## 3. Per-file table

Importer counts: "ext" = files outside `src/components/ui/` that import the module, counted by grep over `src` + `supabase` (`*.ts`/`*.tsx`) for `@/components/ui/<name>` in double or single quotes plus relative `…/ui/<name>` forms; split into **tracked** (in `git ls-files`) and **+wt** (untracked working-tree duplicates, the `* 2.tsx` files listed in git status). A separate sweep for single-quoted relative imports found exactly one extra hit (src/components/RobustImage.tsx:3 → button), included below. LOC per `wc -l` convention.

| path (src/components/ui/) | exported symbols | ext importers | note |
|---|---|---|---|
| accordion.tsx | Accordion, AccordionItem, AccordionTrigger, AccordionContent | 6 tracked | LOC 52; @radix-ui/react-accordion |
| alert-dialog.tsx | AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel | 17 tracked +2 wt | LOC 104; @radix-ui/react-alert-dialog; uses buttonVariants |
| alert.tsx | Alert, AlertTitle, AlertDescription | 19 tracked +2 wt | LOC 43; cva variants default/destructive |
| aspect-ratio.tsx | AspectRatio | none found (grep-verified) | LOC 5; radix re-export |
| avatar.tsx | Avatar, AvatarImage, AvatarFallback | 6 tracked | LOC 38; @radix-ui/react-avatar |
| badge.tsx | Badge, badgeVariants, BadgeProps | 72 tracked +9 wt | LOC 29; cva variants default/secondary/destructive/outline |
| breadcrumb.tsx | Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis | none found (grep-verified) | LOC 90 |
| button.tsx | Button, buttonVariants, ButtonProps | 106 tracked +10 wt | LOC 47; most-imported file; also imported intra-kit by 5 files (§2) |
| calendar.tsx | Calendar, CalendarProps | 1 tracked (GlobalSearch.tsx:21) | LOC 54; react-day-picker v8 API — §4.6 |
| card.tsx | Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent | 86 tracked +12 wt | LOC 43; pure styled divs, no radix |
| carousel.tsx | type CarouselApi, Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext | none found (grep-verified) | LOC 224; embla-carousel-react |
| chart.tsx | ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle, ChartConfig | none found (grep-verified) | LOC 303; recharts wrapper — §4.5 |
| checkbox.tsx | Checkbox | 6 tracked +1 wt | LOC 26 |
| collapsible.tsx | Collapsible, CollapsibleTrigger, CollapsibleContent | 3 tracked +1 wt | LOC 9; radix re-exports |
| command.tsx | Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator | 2 tracked (GlobalSearch.tsx, views/Calendar.tsx) | LOC 132; cmdk; wraps ui/dialog |
| context-menu.tsx | ContextMenu + 14 subcomponents (Trigger, Content, Item, CheckboxItem, RadioItem, Label, Separator, Shortcut, Group, Portal, Sub, SubContent, SubTrigger, RadioGroup) | none found (grep-verified) | LOC 178 |
| dialog.tsx | Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription | 36 tracked +4 wt | LOC 95; @radix-ui/react-dialog |
| drawer.tsx | Drawer, DrawerPortal, DrawerOverlay, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription | none found (grep-verified) | LOC 87; vaul |
| dropdown-menu.tsx | DropdownMenu + 14 subcomponents (same shape as context-menu) | 6 tracked +1 wt | LOC 179 |
| form.tsx | useFormField, Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage, FormField | none found (grep-verified) | LOC 129; react-hook-form binding — unused |
| hover-card.tsx | HoverCard, HoverCardTrigger, HoverCardContent | none found (grep-verified) | LOC 27 |
| input-otp.tsx | InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator | none found (grep-verified) | LOC 61; input-otp lib |
| input.tsx | Input | 57 tracked +8 wt | LOC 22; forwardRef styled `<input>` |
| label.tsx | Label | 43 tracked +4 wt | LOC 17 |
| menubar.tsx | Menubar + 15 subcomponents | none found (grep-verified) | LOC 207 |
| navigation-menu.tsx | navigationMenuTriggerStyle, NavigationMenu + 8 subcomponents | none found (grep-verified) | LOC 120 |
| pagination.tsx | Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious | 1 tracked (ListPagination.tsx:13) | LOC 81; uses ButtonProps/buttonVariants |
| popover.tsx | Popover, PopoverTrigger, PopoverContent | 3 tracked | LOC 29 |
| progress.tsx | Progress | 8 tracked +3 wt | LOC 23 |
| radio-group.tsx | RadioGroup, RadioGroupItem | none found (grep-verified) | LOC 36 |
| resizable.tsx | ResizablePanelGroup, ResizablePanel, ResizableHandle | none found (grep-verified) | LOC 37; react-resizable-panels |
| scroll-area.tsx | ScrollArea, ScrollBar | 14 tracked +2 wt | LOC 38 |
| select.tsx | Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton | 33 tracked +4 wt | LOC 143 |
| separator.tsx | Separator | 7 tracked | LOC 20 |
| sheet.tsx | Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetOverlay, SheetPortal, SheetTitle, SheetTrigger | 1 tracked (FloorPlanPinsList.tsx:19, relative import) | LOC 107; also intra-kit by sidebar.tsx:11 |
| sidebar.tsx | SidebarProvider, Sidebar, SidebarTrigger, SidebarRail, SidebarInset, SidebarInput, SidebarHeader, SidebarFooter, SidebarSeparator, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupAction, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarMenuBadge, SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, useSidebar | 4 tracked | LOC 637 (largest file) — §4.4 |
| skeleton.tsx | Skeleton | 18 tracked +6 wt | LOC 7; also intra-kit by sidebar.tsx:12 |
| slider.tsx | Slider | none found (grep-verified) | LOC 23 |
| sonner.tsx | Toaster, toast | 1 tracked (providers.tsx:6) +1 wt | LOC 27 — §4.3 |
| switch.tsx | Switch | 9 tracked | LOC 27 |
| table.tsx | Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption | 19 tracked +2 wt | LOC 72; styled table elements, no radix |
| tabs.tsx | Tabs, TabsList, TabsTrigger, TabsContent | 23 tracked +5 wt | LOC 53; **only file modified after scaffold** — §4.1 |
| textarea.tsx | Textarea, TextareaProps | 18 tracked +4 wt | LOC 21 |
| toast.tsx | type ToastProps, type ToastActionElement, ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction | 1 tracked (src/hooks/use-toast.ts:3, type-only) | LOC 111; @radix-ui/react-toast + cva — §4.2 |
| toaster.tsx | Toaster | 1 tracked (providers.tsx:5) +1 wt | LOC 24 — §4.2 |
| toggle-group.tsx | ToggleGroup, ToggleGroupItem | 2 tracked (ClientPortalDocuments.tsx, SiteDocuments.tsx) | LOC 49 |
| toggle.tsx | Toggle, toggleVariants | 0 external; intra-kit only (toggle-group.tsx:6) | LOC 37 |
| tooltip.tsx | Tooltip, TooltipTrigger, TooltipContent, TooltipProvider | 4 tracked +2 wt | LOC 28; also intra-kit by sidebar.tsx:13 |
| use-toast.ts | useToast, toast | none found (grep-verified) | LOC 3; re-export shim of @/hooks/use-toast — §4.2 |

## 4. Files that deviate from stock shadcn or carry notable logic

### 4.1 tabs.tsx — the only post-scaffold modification in the kit

Git history of the directory contains exactly 5 commits (`git log --oneline -- src/components/ui/`): scaffold `e2dfda5` plus four follow-ups — `f1d6657` "Fix: Improve legibility of tab text", `2d929d2` "Fix tab overlap on mobile", `4cba3e5` "Fix tab text styling", `be9ba18` "Fix capitalization and spacing" — each a 1-insertion/1-deletion change to tabs.tsx only (`git show --stat`). Cumulative diff `e2dfda5..be9ba18` alters the single `TabsTrigger` className string (tabs.tsx:30): `py-1.5` → `py-2`; adds `text-foreground/80 hover:text-foreground`, `min-h-[44px]`, `tracking-normal`; `whitespace-nowrap` moved to end of string. All other 48 files' last commit is the scaffold commit (per-file `git log -1` sweep).

### 4.2 The radix toast stack: toast.tsx + toaster.tsx + use-toast.ts

- toast.tsx wraps `@radix-ui/react-toast` with a cva `toastVariants` (variants `default`/`destructive`, toast.tsx:25-38) and exports the primitives plus `ToastProps`/`ToastActionElement` types.
- toaster.tsx renders the toast queue: it reads `toasts` from `useToast()` in `@/hooks/use-toast` (toaster.tsx:1,5 — the hook lives in unit H04) and maps them into `<Toast>` elements inside `<ToastProvider>`/`<ToastViewport>` (toaster.tsx:8-22).
- The hook imports back: src/hooks/use-toast.ts:3 does `import type { ToastActionElement, ToastProps } from "@/components/ui/toast"` — a type-level cycle C01→H04→C01. The hook caps concurrent toasts at `TOAST_LIMIT = 1` and delays removal by `TOAST_REMOVE_DELAY = 1000000` ms (src/hooks/use-toast.ts:5-6; H04 territory, noted here because toaster.tsx's behavior is defined by it).
- use-toast.ts (the kit file) is a 3-line re-export shim of `@/hooks/use-toast` (use-toast.ts:1-3) with zero importers anywhere — consumers, including toaster.tsx itself, import the hook path directly.

### 4.3 sonner.tsx — second toast system, themed via an absent provider

sonner.tsx wraps the `sonner` library's Toaster, reading `const { theme = "system" } = useTheme()` from `next-themes` (sonner.tsx:1,7) and forwarding it as the `theme` prop with shadcn classNames (sonner.tsx:10-23). `next-themes` is imported nowhere else in tracked src (grep "next-themes"), and no `ThemeProvider` exists anywhere in tracked src (grep "ThemeProvider": no hits) — so the destructure default `"system"` is the value in play. Both toast systems are mounted side-by-side in src/app/providers.tsx:19-20 (`<Toaster />` from ui/toaster, `<Sonner />` from ui/sonner).

### 4.4 sidebar.tsx — largest file, only stateful environment interaction

637 LOC, 24 exports. `SidebarProvider` holds expanded/collapsed state, persists it by writing `document.cookie = "sidebar:state=…; path=/; max-age=604800"` (sidebar.tsx:15-16,68), and registers a window-level keydown listener toggling on Cmd/Ctrl+B (sidebar.tsx:20,79-89). Mobile behavior switches to a `Sheet` using `useIsMobile()` from `@/hooks/use-mobile` (sidebar.tsx:6,51) — the kit's only out-of-kit runtime-value dependency besides `cn` and the toast hook. It wraps children in `TooltipProvider delayDuration={0}` (sidebar.tsx:110) and sets `--sidebar-width`/`--sidebar-width-icon` inline (sidebar.tsx:114-115); the `sidebar` color tokens it styles with are the tailwind.config.ts `sidebar` group. This matches the stock shadcn sidebar component (structure and constants); consumed by 4 tracked files (§5).

### 4.5 chart.tsx — style injection, zero consumers

303-LOC recharts wrapper. `ChartStyle` builds a `<style>` element via `dangerouslySetInnerHTML`, emitting `--color-<key>` CSS variables per theme using the selector map `THEMES = { light: "", dark: ".dark" }` (chart.tsx:7 and the dangerouslySetInnerHTML block). Stock shadcn behavior; noted because it is the kit's only runtime CSS generation and it has zero importers anywhere.

### 4.6 calendar.tsx — react-day-picker v8 API

Wraps `DayPicker` with the v8 `classNames`/`components={{ IconLeft, IconRight }}` API (calendar.tsx:44-47), matching the pinned `react-day-picker ^8.10.1`. Stock for that version. Single consumer: src/components/GlobalSearch.tsx:21.

Sampled and found stock (full read): button.tsx (cva variant/size + Slot `asChild`, button.tsx:7-47), toaster.tsx, use-toast.ts, sonner.tsx, calendar.tsx; partial read: sidebar.tsx (lines 1-120), chart.tsx, toast.tsx (lines 1-40). Remaining files: see ASSUMED.

## 5. Used-by mapping (kit level, grep-verified)

Aggregate: 33 of 49 modules have at least one tracked external importer; 15 modules have **no importer anywhere** (external or intra-kit): aspect-ratio, breadcrumb, carousel, chart, context-menu, drawer, form, hover-card, input-otp, menubar, navigation-menu, radio-group, resizable, slider, use-toast.ts. toggle.tsx is intra-kit-only. No supabase/ file imports the kit (grep covered `src` and `supabase`).

Consuming units for the 12 most-imported modules (unit ids per review/manifest.md paths; for units whose file membership is directory-scoped the attribution is mechanical; for src/views and src/components top-level files, unit ids follow the files named in the manifest unit notes):

| module (tracked ext) | consuming manifest units — grep-verified examples |
|---|---|
| button (106) | V01 (src/views/Dashboard.tsx:5), V02 (src/views/Users.tsx:8), V03 (src/views/ContractorSiteDetail.tsx), V04 (src/views/PublicSubsection.tsx:4), V05 (src/views/auth/Login.tsx), V06 (src/views/site-coc/SiteCocTab.tsx), V07 (src/views/subsection-detail/OverviewTab.tsx), C03–C17 incl. C04 (pdf-editor/PDFReportEditor.tsx), C06 (public/PublicIssueReportDialog.tsx), C07–C09 (site/AssetTable.tsx, site/SchematicDiagram.tsx), C10 (OnboardingWizard.tsx), C13 (OfflineIndicator.tsx:3), C15 (TemplateBuilder.tsx), C16 (ErrorBoundary.tsx:3, RobustImage.tsx:3), C17 (coc/CocCertificateList.tsx) |
| card (86) | same view spread V01–V07 (Dashboard.tsx:3; site-coc/SiteCocTab.tsx; subsection-detail/OverviewTab.tsx), A09 (src/app/public/qr-retired/page.tsx:2 — the only src/app page importing the kit directly), C03 (client-portal/SiteOverviewCard.tsx), C05 (settings/AutoLogoutSettings.tsx), C14 (ComplianceDashboard.tsx), C17 (dashboard/SitesNeedingAttention.tsx) |
| badge (72) | V01–V07 (subsection-detail/OverviewTab.tsx:2), C06 (fortress/AssetRegister.tsx), C07–C09 (site/SubsectionList.tsx:4), C12 (InteractiveFloorPlan.tsx:7, relative import), C14, C15 (templates/TemplatePreviewRenderer.tsx), C17 (coc/CocCertificateList.tsx:2) |
| input (57) | V01, V02, V03, V05 (auth/Login.tsx:23), V06 (site-coc/AssignSubTab.tsx), V07, C03, C04, C05, C06, C07–C09, C10 (VisitorRegistrationGate.tsx), C15 |
| label (43) | V01, V02, V05 (auth/Login.tsx:24), V07, C04 (pdf-editor/SectionToggle.tsx), C05, C06, C07–C09, C10, C15 |
| dialog (36) | V01, V02, V04 (PublicSubsectionReview.tsx), V07 (subsection-detail/SubsectionDialogs.tsx), C03, C04 (PDFReportEditor.tsx:13), C06, C07–C09 (site/DocumentDialogs.tsx:1), C10 (OnboardingWizard.tsx:10), C12 (FloorPlanPinModal.tsx), C13 (OfflinePhotoGallery.tsx), C15 |
| select (33) | V01, V02, V03 (ClientAccessSimulator.tsx), V06 (site-coc/ScheduleSubTab.tsx), V07, C03, C04, C06 (floor-plan/PinFilters.tsx), C07–C09 (site/SubsectionFilters.tsx:11), C10, C12, C13, C15, C16 (UserRLSPolicies.tsx) |
| tabs (23) | V01 (SiteDetail.tsx, SubsectionDetail.tsx, InspectionDetail.tsx), V02 (Settings.tsx, PortalManagement.tsx), V03 (ContractorPortal.tsx:10), V04 (PublicSiteReview.tsx), V06 (site-coc/SiteCocTab.tsx:4), C04 (PDFReportEditor.tsx), C07 (site/AssetVerification.tsx), C15 (TemplateBuilder.tsx:9) |
| alert (19) | V02, V03 (ClientPortalDashboard.tsx), V04 (Install.tsx:5), V07 (subsection-detail/InspectionsTab.tsx), C03 (client-portal/ClientCocView.tsx), C11 (ContractorPortalLayout.tsx), C13 (OfflinePhotoGallery.tsx, OfflineSubsectionEnhancements.tsx) |
| table (19) | V01 (Inspections.tsx), V02 (Users.tsx, APIClients.tsx), V03, V06 (site-coc/CertificatesSubTab.tsx:1, ScheduleSubTab.tsx, VerificationSubTab.tsx), C03 (ClientCocView.tsx:10), C04 (SectionEditor.tsx), C05 (settings/SANSReferenceTab.tsx), C06 (fortress/AssetRegister.tsx:6), C07–C09 (site/MeterRegister.tsx, site/AssetTable.tsx) |
| skeleton (18) | C02 (auth/AuthLoading.tsx:3), V03 (18 of the 24 hits are portal/contractor views, e.g. ClientPortalDashboard.tsx, ContractorSites.tsx), C03 (ClientCocView.tsx), C16 (LoadingState.tsx) |
| textarea (18) | V01 (InspectionDetail.tsx), V02 (Users.tsx, InspectionTemplates.tsx), V03 (OfflineReview.tsx:4 per manifest V03 note), C04 (pdf-editor/CoverPageEditor.tsx), C06, C10, C12 (FloorPlanPinModal.tsx), C13, C15 |

Low-count modules with pinpointed consumers: sidebar → A03 (src/app/(admin)/layout.tsx:4) and C11 (AppSidebar.tsx:39, ClientPortalLayout.tsx:22, ContractorPortalLayout.tsx:23); toaster + sonner + tooltip(TooltipProvider) → A01 (src/app/providers.tsx:4-6,19-21); toast → H04 (src/hooks/use-toast.ts:3, types only); sheet → C12 (FloorPlanPinsList.tsx:19); calendar + command + popover → C11 (GlobalSearch.tsx:21) and V01 (views/Calendar.tsx); pagination → C16 (ListPagination.tsx:13); toggle-group → C03 (ClientPortalDocuments.tsx) and C08 (SiteDocuments.tsx).

Full per-module importer file lists are reproducible with:
`grep -rl --include='*.ts' --include='*.tsx' -e '@/components/ui/<name>' -e '/ui/<name>' src supabase`

## 6. Observed issues

1. **15 modules with zero importers anywhere** (grep-verified over alias + relative import forms, tracked + untracked): aspect-ratio, breadcrumb, carousel, chart, context-menu, drawer, form, hover-card, input-otp, menubar, navigation-menu, radio-group, resizable, slider, use-toast.ts — ~30% of the kit is dead weight carried with its library dependencies (e.g. form.tsx is the only react-hook-form consumer in the kit; chart.tsx the only recharts consumer in this unit).
2. **Two toast systems are mounted simultaneously**: src/app/providers.tsx:19 mounts the radix `Toaster` (ui/toaster) and providers.tsx:20 mounts `Sonner` (ui/sonner). Which stack a given feature's notifications use depends on which import each caller chose.
3. **sonner.tsx themes itself via `useTheme()` from next-themes, but no `ThemeProvider` exists in tracked src** (grep "ThemeProvider" and "next-themes": only sonner.tsx:1 hits) — the theme resolves to the destructure default `"system"` (sonner.tsx:7).
4. **Dark palette defined but never activated by code**: src/index.css:60-105 defines the `.dark` variable block and tailwind.config.ts:4 sets `darkMode: ["class"]`, yet no tracked source applies a `dark` class (greps for `documentElement`, `classList.add/toggle`, `class="dark"`: no hits); src/app/layout.tsx:38 renders `<html lang="en" suppressHydrationWarning>` with no class wiring.
5. **No `"use client"` directive in any of the 49 files** (grep, both quote styles: 0 hits) in a Next.js App Router app; components.json:4 still says `"rsc": false` from the Vite scaffold. Verified client boundaries exist in at least two importers (providers.tsx:1, (admin)/layout.tsx:1); whether every import path is inside one was not verified (see ASSUMED).
6. **use-toast.ts is a zero-importer 3-line shim** (use-toast.ts:1-3); all consumers import `@/hooks/use-toast` directly (e.g. toaster.tsx:1).
7. **Type-level cross-unit cycle**: ui/toast.tsx types → src/hooks/use-toast.ts:3 (H04) → back into C01 via toaster.tsx:1-2.
8. **index.css defines `--success/--warning/--info` tokens (src/index.css:50-57, 98-105) that tailwind.config.ts's colors block does not map**; at least one component references the unmapped utility classes (`bg-warning/10 text-warning-foreground`, src/components/pdf-editor/SectionEditor.tsx:252 — unit C04).
9. **14 untracked working-tree duplicate files (`* 2.tsx` etc., per git status) import kit modules**, inflating working-tree importer counts above the tracked counts reported in §3 (e.g. button 116 wt vs 106 tracked).
10. **Global side effects in sidebar.tsx**: unconditional `document.cookie` write (sidebar.tsx:68) and a window-level Cmd/Ctrl+B keydown listener (sidebar.tsx:79-89) registered by every mounted `SidebarProvider` — 4 tracked mount sites across A03/C11 consumers.

## 7. ASSUMED

- **Stock-shadcn classification of unsampled files.** Fully read: button, calendar, sonner, toaster, use-toast, tabs (via cumulative diff); partially read: sidebar (lines 1-120), chart, toast. The remaining ~40 files are assumed stock shadcn "default"-style output based on (a) every file except tabs.tsx having the scaffold commit `e2dfda5` as its last commit (per-file git log sweep), and (b) export shapes matching stock shadcn. No line-by-line diff against upstream shadcn was performed.
- **Importer counts** measure literal import-path strings (double/single-quoted alias, double-quoted relative, plus a one-off single-quoted-relative sweep that found only RobustImage.tsx:3). Dynamic `import()` or re-export barrels would be missed; none were observed.
- **Unit attribution in §5** for files inside directory-scoped units (C03-C09, C17, V05-V07, A-units, H04, C02) is mechanical from manifest paths; for top-level src/views and src/components files (split across V01-V04 / C10-C16 at file level) attribution follows the file names cited in the manifest unit notes and is assumed where a file is not explicitly named there.
- **"system" theme fallback** in sonner.tsx is inferred from the destructure default at sonner.tsx:7; next-themes' internal behavior without a provider was not verified.
- Whether every kit import path in the Next build sits under a `"use client"` boundary was not verified file-by-file (two boundaries verified: providers.tsx:1, (admin)/layout.tsx:1).
- `sidebar:state` cookie is written but no code reading it was searched for outside this unit; consumption unverified.
