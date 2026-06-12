# UI Primitives Inventory (`src/components/ui/*.tsx`)

**Scope:** Vendored shadcn/ui + Radix primitives — the design-system layer under `src/components/ui/`. App-specific composite components live elsewhere (`src/components/...`) and are documented in other chapters.

**Files covered:** 48 `.tsx` files (every `*.tsx` in `src/components/ui/`). These are boilerplate `shadcn add` output; the table records the underlying primitive + any local deviation from stock shadcn. Color/theme tokens (`bg-primary`, `text-muted-foreground`, etc.) are project Tailwind theme variables, not per-component customization.

Convention across all files: `cn()` from `@/lib/utils` merges classes; most components are `React.forwardRef`; `displayName` is set from the Radix primitive. Unless the "Local customization" column says otherwise, the file is **stock shadcn** (only the standard theme classes).

---

## Inventory

| File | Exported symbol(s) | Underlying primitive | Local customization (deviation from stock shadcn) |
|---|---|---|---|
| `accordion.tsx` | `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` | `@radix-ui/react-accordion` | none (stock) |
| `alert-dialog.tsx` | `AlertDialog`, `AlertDialogPortal`, `AlertDialogOverlay`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` | `@radix-ui/react-alert-dialog` | none; Action/Cancel reuse `buttonVariants` from `button.tsx` (stock) |
| `alert.tsx` | `Alert`, `AlertTitle`, `AlertDescription` | plain `<div>`/`<h5>` + `cva` (`alertVariants`) | none (stock; `default` / `destructive` variants) |
| `aspect-ratio.tsx` | `AspectRatio` | `@radix-ui/react-aspect-ratio` (`.Root` re-export) | none. **Unused** — no callers (see Notes) |
| `avatar.tsx` | `Avatar`, `AvatarImage`, `AvatarFallback` | `@radix-ui/react-avatar` | none (stock) |
| `badge.tsx` | `Badge`, `badgeVariants` | plain `<div>` + `cva` | none (stock; default/secondary/destructive/outline) |
| `breadcrumb.tsx` | `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis` | semantic HTML + `@radix-ui/react-slot` | none. **Unused.** Note: `BreadcrumbEllipsis.displayName` typo'd `"BreadcrumbElipssis"` (stock shadcn bug, harmless) |
| `button.tsx` | `Button`, `ButtonProps`, `buttonVariants` | `<button>` / Radix `Slot` + `cva` | none (stock). Foundation reused by alert-dialog, pagination, carousel, sidebar |
| `calendar.tsx` | `Calendar`, `CalendarProps` (type) | `react-day-picker` `DayPicker` | none (stock; `buttonVariants` for nav/day cells). **Unused** |
| `card.tsx` | `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardDescription`, `CardContent` | plain `<div>`/`<h3>`/`<p>` | none (stock) |
| `carousel.tsx` | `CarouselApi` (type), `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext` | `embla-carousel-react` + context | none (stock; internal `useCarousel` context hook, keyboard nav). **Unused** |
| `chart.tsx` | `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `ChartStyle` | `recharts` + context | none (stock). `ChartStyle` injects per-chart CSS vars via `dangerouslySetInnerHTML` (stock shadcn pattern; values are config-driven, not user input). **Unused** |
| `checkbox.tsx` | `Checkbox` | `@radix-ui/react-checkbox` | none (stock) |
| `collapsible.tsx` | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` | `@radix-ui/react-collapsible` (re-exports) | none (stock) |
| `command.tsx` | `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator` | `cmdk` + `dialog.tsx` | none (stock) |
| `context-menu.tsx` | `ContextMenu`(+ Trigger/Content/Item/CheckboxItem/RadioItem/Label/Separator/Shortcut/Group/Portal/Sub/SubContent/SubTrigger/RadioGroup) | `@radix-ui/react-context-menu` | none (stock). **Unused** |
| `dialog.tsx` | `Dialog`, `DialogPortal`, `DialogOverlay`, `DialogClose`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` | `@radix-ui/react-dialog` | none (stock) |
| `drawer.tsx` | `Drawer`, `DrawerPortal`, `DrawerOverlay`, `DrawerTrigger`, `DrawerClose`, `DrawerContent`, `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription` | `vaul` | none (stock; `shouldScaleBackground` default). **Unused** |
| `dropdown-menu.tsx` | `DropdownMenu`(+ Trigger/Content/Item/CheckboxItem/RadioItem/Label/Separator/Shortcut/Group/Portal/Sub/SubContent/SubTrigger/RadioGroup) | `@radix-ui/react-dropdown-menu` | none (stock) |
| `form.tsx` | `useFormField` (hook), `Form`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `FormField` | `react-hook-form` + `label.tsx` | none (stock; `FormFieldContext`/`FormItemContext` + a11y wiring) |
| `hover-card.tsx` | `HoverCard`, `HoverCardTrigger`, `HoverCardContent` | `@radix-ui/react-hover-card` | none (stock). **Unused** |
| `input-otp.tsx` | `InputOTP`, `InputOTPGroup`, `InputOTPSlot`, `InputOTPSeparator` | `input-otp` | none (stock). **Unused** |
| `input.tsx` | `Input` | plain `<input>` | none (stock) |
| `label.tsx` | `Label` | `@radix-ui/react-label` + `cva` | none (stock) |
| `menubar.tsx` | `Menubar`(+ Menu/Trigger/Content/Item/Separator/Label/CheckboxItem/RadioGroup/RadioItem/Portal/SubContent/SubTrigger/Group/Sub/Shortcut) | `@radix-ui/react-menubar` | none. **Unused.** Note: `MenubarShortcut.displayname` (lowercase typo) — stock shadcn bug, harmless |
| `navigation-menu.tsx` | `navigationMenuTriggerStyle`, `NavigationMenu`, `NavigationMenuList`, `NavigationMenuItem`, `NavigationMenuContent`, `NavigationMenuTrigger`, `NavigationMenuLink`, `NavigationMenuIndicator`, `NavigationMenuViewport` | `@radix-ui/react-navigation-menu` + `cva` | none (stock). **Unused** |
| `pagination.tsx` | `Pagination`, `PaginationContent`, `PaginationEllipsis`, `PaginationItem`, `PaginationLink`, `PaginationNext`, `PaginationPrevious` | semantic HTML + `buttonVariants` | none (stock). **Unused** |
| `popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverContent` | `@radix-ui/react-popover` | none (stock) |
| `progress.tsx` | `Progress` | `@radix-ui/react-progress` | none (stock) |
| `radio-group.tsx` | `RadioGroup`, `RadioGroupItem` | `@radix-ui/react-radio-group` | none (stock) |
| `resizable.tsx` | `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` | `react-resizable-panels` | none (stock). **Unused** |
| `scroll-area.tsx` | `ScrollArea`, `ScrollBar` | `@radix-ui/react-scroll-area` | none (stock) |
| `select.tsx` | `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` | `@radix-ui/react-select` | none (stock) |
| `separator.tsx` | `Separator` | `@radix-ui/react-separator` | none (stock) |
| `sheet.tsx` | `Sheet`, `SheetClose`, `SheetContent`, `SheetDescription`, `SheetFooter`, `SheetHeader`, `SheetOverlay`, `SheetPortal`, `SheetTitle`, `SheetTrigger` | `@radix-ui/react-dialog` + `cva` (`sheetVariants`) | none (stock; top/bottom/left/right side variants) |
| `sidebar.tsx` | `useSidebar` (hook) + `SidebarProvider`, `Sidebar`, and 20 sub-parts (`SidebarContent`, `SidebarFooter`, `SidebarGroup*`, `SidebarHeader`, `SidebarInput`, `SidebarInset`, `SidebarMenu*`, `SidebarRail`, `SidebarSeparator`, `SidebarTrigger`) | composed from `button`/`input`/`separator`/`sheet`/`skeleton`/`tooltip` + `@/hooks/use-mobile` | **Stock shadcn "sidebar block"** (largest file, 638 lines). Customization is the standard block, not app-specific: `SidebarProvider` persists open/closed to a `sidebar:state` **cookie** (client-side `document.cookie` write — cosmetic UI state, not security-relevant), Cmd/Ctrl+B keyboard shortcut, `useSidebar` context. **In use** (5 caller files) |
| `skeleton.tsx` | `Skeleton` | plain `<div>` | none (stock) |
| `slider.tsx` | `Slider` | `@radix-ui/react-slider` | none (stock) |
| `sonner.tsx` | `Toaster`, `toast` (re-export) | `sonner` + `next-themes` | none (stock). Theme-aware Sonner wrapper. **Unused** — second/duplicate toast system (see Notes) |
| `switch.tsx` | `Switch` | `@radix-ui/react-switch` | none (stock) |
| `table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption` | semantic `<table>` | none (stock) |
| `tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | `@radix-ui/react-tabs` | **Customized:** `TabsTrigger` adds `min-h-[44px]` (mobile/Capacitor touch target), `text-foreground/80 hover:text-foreground`, `tracking-normal whitespace-nowrap` — deviates from stock |
| `textarea.tsx` | `Textarea`, `TextareaProps` | plain `<textarea>` | none (stock) |
| `toast.tsx` | `ToastProps`(type), `ToastActionElement`(type), `ToastProvider`, `ToastViewport`, `Toast`, `ToastTitle`, `ToastDescription`, `ToastClose`, `ToastAction` | `@radix-ui/react-toast` + `cva` | none (stock; default/destructive variants). Radix-based toast system, paired with `toaster.tsx` + `use-toast` hook |
| `toaster.tsx` | `Toaster` | composes `toast.tsx` + `@/hooks/use-toast` | none (stock). Renders the Radix toast queue. **In use** (1 caller) |
| `toggle.tsx` | `Toggle`, `toggleVariants` | `@radix-ui/react-toggle` + `cva` | none (stock); `toggleVariants` reused by `toggle-group.tsx` |
| `toggle-group.tsx` | `ToggleGroup`, `ToggleGroupItem` | `@radix-ui/react-toggle-group` + `toggleVariants` | none (stock; context propagates variant/size). **In use** (2 callers) |
| `tooltip.tsx` | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` | `@radix-ui/react-tooltip` | none (stock) |

---

## Notes (notable findings)

- **One genuinely customized primitive: `tabs.tsx`.** `TabsTrigger` deviates from stock — `min-h-[44px]` (a deliberate 44px touch-target for the Capacitor/mobile build), plus `text-foreground/80 hover:text-foreground` and `tracking-normal whitespace-nowrap`. Everything else in the directory is unmodified `shadcn add` output (only standard theme tokens).
- **`sidebar.tsx` is large but NOT app-specific.** It is the verbatim shadcn "sidebar" block (638 lines, `useSidebar` hook + 22 exports). The only behavioral notables are stock-block features: a client-side `document.cookie` write of `sidebar:state` (cosmetic open/collapsed persistence — **not** auth/security-relevant) and a Cmd/Ctrl+B shortcut. Depends on `@/hooks/use-mobile` (verified present at `src/hooks/use-mobile.tsx`).
- **Two parallel toast systems coexist (duplicate logic).** `toast.tsx` + `toaster.tsx` + `@/hooks/use-toast` (Radix-based) AND `sonner.tsx` (Sonner-based, exports its own `Toaster`/`toast`). Only the Radix `toaster.tsx` has a caller; **`sonner.tsx` is unused**. Pick-one cleanup candidate.
- **Unused / dead vendored primitives (0 callers outside `src/components/ui/`):** `aspect-ratio`, `breadcrumb`, `calendar`, `carousel`, `chart`, `context-menu`, `drawer`, `hover-card`, `input-otp`, `menubar`, `navigation-menu`, `pagination`, `resizable`, `sonner`. These are scaffold-installed shadcn components never wired into the app — safe-to-remove candidates, but they are inert (no runtime cost unless imported). Not flagged as a defect; typical of a shadcn-bootstrapped project.
- **Two cosmetic stock-shadcn typos (harmless, present upstream):** `breadcrumb.tsx` → `BreadcrumbEllipsis.displayName = "BreadcrumbElipssis"`; `menubar.tsx` → `MenubarShortcut.displayname` (lowercase `n`, so no real `displayName` is set). Neither affects behavior.
- **`chart.tsx` uses `dangerouslySetInnerHTML`** in `ChartStyle` to inject per-chart CSS color variables. This is the stock shadcn pattern and the injected values come from the developer-supplied `config` object (not user input), so it is not an XSS vector. Component is unused anyway.
- **No security-relevant client writes** found in this directory beyond the cosmetic sidebar-state cookie. None of these primitives touch Supabase, storage, or auth — they are pure presentation. Data-layer writes are documented in the flows/edge-function chapters.
