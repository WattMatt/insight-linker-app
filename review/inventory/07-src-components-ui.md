# Inventory 07 — src/components/ui (shadcn/radix UI kit)

- Date: 2026-07-29
- List command: `git ls-files 'src/components/ui/*'`
- Output count: **49** files (`git ls-files 'src/components/ui/*' | wc -l` → `49`)
- Total LOC: 3954 (`git ls-files 'src/components/ui/*' | xargs wc -l` → `3954 total`)
- On-disk vs tracked: identical — `ls -1 src/components/ui/ | wc -l` → 49; diff against `git ls-files` output was empty (exit 0). No untracked or " 2" duplicate files in this directory.

Mode: SHALLOW (vendored shadcn/ui kit — confirmed by sampling, see ASSUMED/verification notes). All files classified **source** (vendored). "Ext imports" = number of files outside `src/components/ui/` importing `@/components/ui/<name>` (command: grep -rl per module over `src --include='*.tsx' --include='*.ts'`, excluding the ui dir itself; script preserved in session scratchpad `count_importers.sh`).

## Per-file table

| File | Type | LOC | Public surface (one-line) | Ext imports |
|---|---|---:|---|---:|
| accordion.tsx | source | 52 | shadcn accordion: Accordion, AccordionItem, AccordionTrigger, AccordionContent | 6 |
| alert-dialog.tsx | source | 104 | shadcn alert-dialog: AlertDialog + Portal/Overlay/Trigger/Content/Header/Footer/Title/Description/Action/Cancel (11 exports, alert-dialog.tsx:92) | 19 |
| alert.tsx | source | 43 | shadcn alert: Alert, AlertTitle, AlertDescription | 18 |
| aspect-ratio.tsx | source | 5 | shadcn aspect-ratio: AspectRatio (radix re-export) | 0 |
| avatar.tsx | source | 38 | shadcn avatar: Avatar, AvatarImage, AvatarFallback | 6 |
| badge.tsx | source | 29 | shadcn badge: Badge, badgeVariants, BadgeProps (badge.tsx:23) | 71 |
| breadcrumb.tsx | source | 90 | shadcn breadcrumb: Breadcrumb + List/Item/Link/Page/Separator/Ellipsis | 0 |
| button.tsx | source | 47 | shadcn button: Button, buttonVariants, ButtonProps (variant/size cva + asChild; button.tsx:33-47) | 93 |
| calendar.tsx | source | 54 | shadcn calendar: Calendar, CalendarProps (wraps react-day-picker DayPicker; calendar.tsx:8) | 1 |
| card.tsx | source | 43 | shadcn card: Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent | 89 |
| carousel.tsx | source | 224 | shadcn carousel: Carousel, CarouselContent/Item/Previous/Next, type CarouselApi (embla-carousel-react; carousel.tsx:224) | 0 |
| chart.tsx | source | 303 | shadcn chart: ChartContainer, ChartTooltip(+Content), ChartLegend(+Content), ChartStyle, type ChartConfig (recharts wrapper; chart.tsx:9,303) | 0 |
| checkbox.tsx | source | 26 | shadcn checkbox: Checkbox | 7 |
| collapsible.tsx | source | 9 | shadcn collapsible: Collapsible, CollapsibleTrigger, CollapsibleContent (radix re-exports) | 4 |
| command.tsx | source | 132 | shadcn command (cmdk): Command, CommandDialog/Input/List/Empty/Group/Item/Shortcut/Separator (command.tsx:122) | 2 |
| context-menu.tsx | source | 178 | shadcn context-menu: ContextMenu + 14 subcomponents (context-menu.tsx:162) | 0 |
| dialog.tsx | source | 95 | shadcn dialog: Dialog + Portal/Overlay/Close/Trigger/Content/Header/Footer/Title/Description (dialog.tsx:84) | 33 |
| drawer.tsx | source | 87 | shadcn drawer (vaul): Drawer + Portal/Overlay/Trigger/Close/Content/Header/Footer/Title/Description | 0 |
| dropdown-menu.tsx | source | 179 | shadcn dropdown-menu: DropdownMenu + 14 subcomponents (dropdown-menu.tsx:163) | 7 |
| form.tsx | source | 129 | shadcn form (react-hook-form): useFormField, Form, FormItem/Label/Control/Description/Message/Field (form.tsx:129) | 0 |
| hover-card.tsx | source | 27 | shadcn hover-card: HoverCard, HoverCardTrigger, HoverCardContent | 0 |
| input-otp.tsx | source | 61 | shadcn input-otp: InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator | 0 |
| input.tsx | source | 22 | shadcn input: Input (forwardRef styled `<input>`; input.tsx:5-22) | 61 |
| label.tsx | source | 17 | shadcn label: Label | 42 |
| menubar.tsx | source | 207 | shadcn menubar: Menubar + 15 subcomponents (menubar.tsx:190) | 0 |
| navigation-menu.tsx | source | 120 | shadcn navigation-menu: NavigationMenu + 7 subcomponents + navigationMenuTriggerStyle (navigation-menu.tsx:110) | 0 |
| pagination.tsx | source | 81 | shadcn pagination: Pagination + Content/Ellipsis/Item/Link/Next/Previous (pagination.tsx:73) | 1 |
| popover.tsx | source | 29 | shadcn popover: Popover, PopoverTrigger, PopoverContent | 3 |
| progress.tsx | source | 23 | shadcn progress: Progress | 10 |
| radio-group.tsx | source | 36 | shadcn radio-group: RadioGroup, RadioGroupItem | 0 |
| resizable.tsx | source | 37 | shadcn resizable (react-resizable-panels): ResizablePanelGroup, ResizablePanel, ResizableHandle | 0 |
| scroll-area.tsx | source | 38 | shadcn scroll-area: ScrollArea, ScrollBar | 13 |
| select.tsx | source | 143 | shadcn select: Select + Group/Value/Trigger/Content/Label/Item/Separator/ScrollUpButton/ScrollDownButton (select.tsx:132) | 33 |
| separator.tsx | source | 20 | shadcn separator: Separator | 7 |
| sheet.tsx | source | 107 | shadcn sheet: Sheet + Close/Content/Description/Footer/Header/Overlay/Portal/Title/Trigger (sheet.tsx:96) | 0 |
| sidebar.tsx | source | 637 | shadcn sidebar: SidebarProvider, Sidebar + 21 subcomponents, useSidebar (sidebar.tsx:612); cookie-persisted state + Cmd/Ctrl+B shortcut (sidebar.tsx:15-20) | 4 |
| skeleton.tsx | source | 7 | shadcn skeleton: Skeleton | 23 |
| slider.tsx | source | 23 | shadcn slider: Slider | 0 |
| sonner.tsx | source | 27 | shadcn sonner: Toaster (themed via next-themes), toast re-export | 2 |
| switch.tsx | source | 27 | shadcn switch: Switch | 7 |
| table.tsx | source | 72 | shadcn table: Table + Header/Body/Footer/Head/Row/Cell/Caption | 21 |
| tabs.tsx | source | 53 | shadcn tabs: Tabs, TabsList, TabsTrigger, TabsContent | 26 |
| textarea.tsx | source | 21 | shadcn textarea: Textarea, TextareaProps (textarea.tsx:5) | 18 |
| toast.tsx | source | 111 | shadcn toast primitives: ToastProvider, ToastViewport, Toast, ToastTitle/Description/Close/Action, types ToastProps/ToastActionElement (toast.tsx:101) | 1 |
| toaster.tsx | source | 24 | shadcn toaster: Toaster() — renders toasts from @/hooks/use-toast (toaster.tsx:1-24) | 2 |
| toggle-group.tsx | source | 49 | shadcn toggle-group: ToggleGroup, ToggleGroupItem | 2 |
| toggle.tsx | source | 37 | shadcn toggle: Toggle, toggleVariants | 0 |
| tooltip.tsx | source | 28 | shadcn tooltip: Tooltip, TooltipTrigger, TooltipContent, TooltipProvider | 5 |
| use-toast.ts | source | 3 | re-export shim: useToast, toast from @/hooks/use-toast (use-toast.ts:1-3) | 0 |

Intra-kit imports (command: `grep -rn '@/components/ui/' src/components/ui/`): alert-dialog→button, calendar→button, carousel→button, command→dialog, form→label, pagination→button, sidebar→button/input/separator/sheet/skeleton/tooltip, toaster→toast, toggle-group→toggle.

Out-of-kit dependencies: sidebar.tsx:6 imports `@/hooks/use-mobile`; use-toast.ts:1 and toaster.tsx:1 import `@/hooks/use-toast` (both hooks verified present in `src/hooks/`).

## Runtime observations

- None. No entry points, request handlers, background jobs, schedulers, queues, or external service integrations in this slice — pure presentational React components. Only environment interactions found: sidebar.tsx:15-16 writes a `sidebar:state` cookie (7-day max-age) via document.cookie, and sidebar.tsx:20 registers a global Cmd/Ctrl+B keydown shortcut; sonner.tsx:1 reads theme via next-themes `useTheme`.

## Oddities

- **No file in the kit carries a `"use client"` directive** (`grep -rL '"use client"' src/components/ui/*.tsx` lists all 48 .tsx files; count of files containing it = 0). Stock shadcn for Next.js App Router emits `"use client"` in interactive components; this kit was scaffolded for Vite — first commit touching the dir is e2dfda5 (2025-10-14) "[skip lovable] Use tech stack vite_react_shadcn_ts_20250728_minor".
- **15 files with zero importers anywhere** (0 external AND not imported intra-kit): aspect-ratio, breadcrumb, carousel, chart, context-menu, drawer, form, hover-card, input-otp, menubar, navigation-menu, radio-group, resizable, slider, use-toast.ts. (sheet and toggle are 0-external but imported intra-kit by sidebar.tsx:11 and toggle-group.tsx:6.)
- **Two toast stacks coexist**: radix-based toast.tsx/toaster.tsx/@/hooks/use-toast (2 ext importers of toaster, 1 of toast) AND sonner.tsx (2 ext importers). 
- use-toast.ts is a 3-line re-export shim of `@/hooks/use-toast` with zero importers — the app imports the hook path directly.
- Last change to the dir: be9ba18 "Fix capitalization and spacing" (`git log --oneline -1 -- src/components/ui/`).

## ASSUMED

- Classified as "vendored stock shadcn" from sampling only 5 files fully (button.tsx, input.tsx, use-toast.ts, toaster.tsx, sonner.tsx) plus headers of sidebar.tsx and chart.tsx — all matched stock shadcn structure; remaining 42 files assumed stock based on matching export shapes and the Lovable scaffold commit e2dfda5. No line-by-line diff against upstream shadcn was performed.
- Import counts measure the literal string `@/components/ui/<name>"`; dynamic imports or re-exports through other aliases (none observed) would be missed.
- Absence of `"use client"` assumed to be a Vite-scaffold artifact rather than intentional; whether Next.js build relies on a client boundary declared higher up (e.g. in importing views) was not verified in this slice.
