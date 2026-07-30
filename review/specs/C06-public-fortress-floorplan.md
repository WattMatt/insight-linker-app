# C06 — public-fortress-floorplan

- Unit id: C06
- Slug: public-fortress-floorplan
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 6 (per review/unit-files.json key "C06")

## Unit header

**Unit purpose (as-is).** Three small, unrelated component directories grouped into one unit: `src/components/public/` holds the two components rendered on the anonymous QR landing page (an unauthenticated issue-report dialog and a COC verdict banner); `src/components/fortress/` holds a scaffolded, prop-driven building-asset register table plus its vitest suite; `src/components/floor-plan/` holds a controlled pin-filter bar and a one-line barrel.

**Module-level observations (cross-file facts inside the unit).**
- There are no imports between the three directories — each file's import list references only C01 ui primitives, external packages, C16, L17, or L20 (verified by reading all six files; see per-file "uses ->" lines).
- Only `PublicIssueReportDialog.tsx` carries the `"use client"` directive (PublicIssueReportDialog.tsx:1); `PublicVerdictCard.tsx`, `AssetRegister.tsx`, and `PinFilters.tsx` start directly with imports (line 1 of each).
- The unit contains exactly one test file, `AssetRegister.test.tsx`; grep of `src/**/*.test.{ts,tsx}` for "PublicIssueReportDialog", "PublicVerdictCard", and "PinFilters" returns zero hits.
- Consumption is one consumer per directory: `src/components/public/*` is imported only by V04 `src/views/PublicSubsection.tsx` (lines 8-9); `src/components/floor-plan/PinFilters` is imported only by C12 `src/components/FloorPlanPinsList.tsx:18` (direct file path, bypassing the barrel); `src/components/fortress/AssetRegister` has no consumer other than its own test (all grep-verified).
- `git status --porcelain` on the three directories returns nothing — no untracked `" 2"`-suffixed duplicates here, unlike several sibling directories.

**External contract.** The rest of the app gets: `PublicIssueReportDialog` (anonymous snag submission posting multipart form data straight to the F02 `report-issue` edge function, no Supabase client/auth header); `PublicVerdictCard` (renders L17 `presentVerdict` output as a colored banner, or nothing); `AssetRegister` (purely presentational table over L20 `BuildingAsset[]`, currently consumed by no runtime code); and `PinFilters` plus its three filter union types (`StatusFilter`, `PriorityFilter`, `TypeFilter`), consumed by C12. The barrel `index.ts` re-exports the PinFilters surface but has zero importers.

---

## src/components/public/PublicIssueReportDialog.tsx

- Purpose: Unauthenticated "report an issue" dialog for QR landing pages that multipart-POSTs a snag report (title, description, up to 3 photos, optional Turnstile token) directly to the `report-issue` edge function.
- Public surface: `PublicIssueReportDialog({ subsectionId, trigger }: Props): JSX.Element` (line 38), where `Props = { subsectionId: string; trigger: React.ReactNode }` (lines 33-36). Named export only. Module constant `MAX_PHOTOS = 3` (line 31) is not exported.
- Inputs & outputs: Inputs are the two props plus local state `open`, `title`, `description`, `photos: File[]`, `captchaToken: string | null`, `submitting` (lines 39-44). Output on submit is a `FormData` POST with fields `turnstile_token` (appended only when a token exists, line 69), `subsection_id`, `title`, `description`, and one `photos` entry per file (lines 68-75). Env var: `process.env.NEXT_PUBLIC_SUPABASE_URL` with `|| ""` fallback (line 78). No tables, buckets, or client-side storage touched directly — persistence happens server-side in F02.
- Dependencies: uses -> `react` (`useRef`, `useState`, line 3); `sonner` `toast` (line 4, external); C01 ui-kit-shadcn `Dialog*`/`Button`/`Input`/`Label`/`Textarea` (lines 6-18); C16 ui-utility-primitives `CaptchaTurnstile`, `CAPTCHA_ENABLED`, `CaptchaTurnstileHandle` from `@/components/CaptchaTurnstile` (lines 19-23; `CAPTCHA_ENABLED = Boolean(NEXT_PUBLIC_TURNSTILE_SITE_KEY)`, CaptchaTurnstile.tsx:20-21). Network contract: F02 edge-public-qr `supabase/functions/report-issue`. used by <- V04 public-and-entry-views: `src/views/PublicSubsection.tsx:9` (import), rendered at line 282 (always, top of page) and again at line 377 (second instance, rendered only when `presentVerdict(verdict, new Date()).kind === "fail"`, line 375). Grep-verified; no other consumers.
- Side effects: `fetch` POST to `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/report-issue` with no auth header (lines 77-83; the header comment at lines 25-29 states this is deliberate for anonymous visitors); sonner toasts on success/failure (lines 88, 92, 95); imperative captcha widget reset via ref (lines 47-50), invoked in `finally` after every submit attempt (line 97) — the C16 header comment documents this as required because Turnstile tokens are single-use server-side (CaptchaTurnstile.tsx:11-14).
- Error handling: `handleSubmit` returns silently when the title is blank or (`CAPTCHA_ENABLED && !captchaToken`) (line 64) — the same condition also disables the submit button (line 160). A `res.json()` parse failure is swallowed to `{}` (line 85). Non-ok response → `toast.error(body.error || "Could not submit the report.")` (line 92), dialog stays open, form values retained. Thrown fetch error → generic `toast.error` in a bare `catch` (lines 94-95). `finally` always resets the captcha and clears `submitting` (lines 96-99). Success → success toast, `resetForm()`, `setOpen(false)` (lines 87-90).
- Tests: None found — grep of `src/**/*.test.{ts,tsx}` for "PublicIssueReportDialog" returned no hits.
- Observed issues:
  - Closing the dialog without submitting does not clear form state: `resetForm()` runs only on the success path (lines 88-90), so cancelling and reopening shows the previous title/description/photos.
  - Selecting more than 3 files silently keeps only the first 3 (`files.slice(0, MAX_PHOTOS)`, line 60); the only feedback is the "N photos selected" count (lines 147-151).
  - With `NEXT_PUBLIC_SUPABASE_URL` unset, the `|| ""` fallback (line 78) makes the POST target the relative path `/functions/v1/report-issue` on the current origin.
  - No client-side file-size or MIME validation beyond the input's `accept="image/*"` attribute (line 143).
- ASSUMED: The server-side behavior described in the header comment (Turnstile verification, snag creation, lines 25-29) is implemented in F02's `report-issue` function — the function file exists (`supabase/functions/report-issue/index.ts`, F02 per manifest) but its contents were not verified for this spec.

## src/components/public/PublicVerdictCard.tsx

- Purpose: Banner card that presents a subsection's public COC verdict by mapping L17 `presentVerdict` output to a colored, icon-bearing panel with optional certificate detail lines, rendering nothing for a "none" verdict.
- Public surface: `PublicVerdictCard({ verdict }: { verdict: PublicVerdict | null }): JSX.Element | null` (line 12); arrow-function component, named export only. Module constant `STYLE: Record<string, { wrap: string; Icon: typeof CheckCircle2 }>` (lines 4-10) is not exported.
- Inputs & outputs: Input is the single `verdict` prop (`PublicVerdict = { coc_required, status, cert_number, issue_date, expiry_date }`, publicVerdict.ts:4-10). At render it calls `presentVerdict(verdict, new Date())` (line 13); returns `null` when `p.kind === "none"` (line 14), otherwise a styled `div` with headline + icon (lines 17-20), optional sub-line (line 21), and up to three detail lines — `COC No.`, `Issued`, `Expiry date` — each rendered only when the corresponding field is non-null (lines 23-25, dates via `toLocaleDateString`). No tables, buckets, storage keys, or env vars touched.
- Dependencies: uses -> L17 site-scoring-compliance `presentVerdict`, `PublicVerdict` from `@/lib/publicVerdict` (line 1); `lucide-react` icons `CheckCircle2`/`XCircle`/`Clock`/`HelpCircle` (line 2). used by <- V04 public-and-entry-views: `src/views/PublicSubsection.tsx:8` (import), rendered at line 373. Grep-verified; no other consumers.
- Side effects: None — pure render; constructs a fresh `Date` on every render (line 13).
- Error handling: None. The `STYLE[p.kind]` lookup (line 15) is typed `Record<string, …>` rather than `Record<VerdictKind, …>` (line 4); its five keys exactly cover the five non-"none" values of `VerdictKind` (`"pass" | "pass-expiring" | "fail" | "pending" | "missing" | "none"`, publicVerdict.ts:12), and the "none" case returns before the lookup (line 14).
- Tests: None render this component (grep-verified). `src/lib/publicVerdict.test.ts` (L17) exists and exercises `presentVerdict`, not the card.
- Observed issues:
  - The detail lines render for any non-"none" kind whenever the fields are non-null (lines 23-25) — including "fail", "pending", and "missing" verdicts.
  - Lines 23-25 use `verdict?.` optional chaining even though a non-"none" presentation implies `verdict` was non-null (`presentVerdict` returns kind "none" for null input, publicVerdict.ts:25-27).
  - The consumer evaluates `presentVerdict` a second time with another fresh `Date` two lines below the card, to gate the fail-only second report dialog (PublicSubsection.tsx:375).
- ASSUMED: None.

## src/components/fortress/AssetRegister.tsx

- Purpose: Presentational, prop-driven building-asset register table with client-side text search, condition filtering, and loading/error/empty states, self-described as the scaffold reference pattern for the other Fortress registers.
- Public surface: `AssetRegister({ assets, loading = false, error = false, onRetry }: AssetRegisterProps): JSX.Element` (line 30); `AssetRegisterProps = { assets: BuildingAsset[]; loading?: boolean; error?: boolean; onRetry?: () => void }` (lines 23-28). Named export only. Module constants `CONDITION_BADGE: Record<AssetCondition, string>` (lines 14-19) and `CONDITION_FILTERS: Array<"all" | AssetCondition>` (line 21) are not exported.
- Inputs & outputs: Data in via props only — the header comment states data will be supplied by "a future useBuildingAssets hook" (lines 10-12). Local state: `search` (line 31) and `condition` (line 32). A `useMemo` filter matches condition (with `a.condition ?? "N/A"`) and case-insensitive substring over `name`/`category`/`make_model`/`contractor` (lines 34-41). Output: a loading spinner card (lines 43-51), an error card with optional Retry button (lines 53-69), an empty state when `assets.length === 0` (lines 104-109), or a 6-column table (Asset, Category, Make / Model, Condition badge, Next Service, Contractor; lines 111-148) with a "no assets match" row when the filter is empty (lines 124-129), plus a footer count line "`{filtered.length} of {assets.length}` asset(s)" (lines 150-152). The Next Service cell renders `a.next_service_date || a.next_service_due || "-"` (line 141). No tables, buckets, storage keys, env vars, or network.
- Dependencies: uses -> `react` (`useMemo`, `useState`, line 1); C01 ui-kit-shadcn `Card*`/`Input`/`Badge`/`Button`/`Table*` (lines 2-6); `lucide-react` icons (line 7); L20 fortress-kpis type-only imports `BuildingAsset`, `AssetCondition` from `@/lib/fortress/types` (line 8). used by <- its own test only (`src/components/fortress/AssetRegister.test.tsx:7`); no runtime consumer found (grep-verified: the only repository references to "AssetRegister" or "components/fortress" are the two files in this directory).
- Side effects: None beyond invoking `onRetry` when the error-state Retry button is clicked (line 61).
- Error handling: The `error` prop renders a static error card ("Unable to load the asset register", lines 53-69); the component has no failure paths of its own.
- Tests: `AssetRegister.test.tsx` (same directory) — see its section below.
- Observed issues:
  - The footer count sits outside the empty-state ternary (lines 150-152), so the empty state renders "0 of 0 assets" beneath "No building assets imported yet".
  - The search input and condition filter buttons render in the header regardless of whether `assets` is empty (lines 73-101).
  - The scaffold comment (lines 10-12) matches reality: grep confirms no hook or view imports the component.
  - The Next Service preference for `next_service_date` over `next_service_due` (line 141) matches the L20 type comments, which mark `next_service_date` as the parsed date and `next_service_due` as raw imported text (types.ts:28-29).
- ASSUMED: "S1-4" in the scaffold comment (line 10) is a spec/task identifier; its definition was not located in this unit.

## src/components/fortress/AssetRegister.test.tsx

- Purpose: jsdom vitest suite exercising AssetRegister's empty, populated, search-filtered, condition-filtered, and error/retry states.
- Public surface: None — test module only (`describe`/`it`). Local helper `asset(over: Partial<BuildingAsset> = {}): BuildingAsset` factory populating all 25 `BuildingAsset` fields with defaults (lines 10-36).
- Inputs & outputs: Renders via `@testing-library/react` `render` with `createElement` (lines 5-6); asserts through `screen.getByText`/`getByRole`/`queryByText` and `fireEvent.change`/`click`. No stores, env vars, or network.
- Dependencies: uses -> `vitest` (`describe`, `it`, `expect`, `vi`, line 4); `@testing-library/react` (line 5); `react` `createElement` (line 6); `./AssetRegister` (same unit, line 7); L20 type-only `BuildingAsset` (line 8). used by <- the vitest runner only: matched by `vitest.config.ts` include pattern `src/**/*.test.{ts,tsx}` (vitest.config.ts:22); opts into jsdom via the `@vitest-environment jsdom` pragma (lines 1-3) because the config default environment is `node` (vitest.config.ts:18).
- Side effects: None outside the test runner.
- Error handling: n/a — assertion failures surface as test failures.
- Tests: This file is the unit's only test. Five cases (lines 38-73): (1) empty `assets` renders "No building assets imported yet"; (2) two assets render both rows and "2 of 2 assets"; (3) typing "HVAC" into the search input hides "Fire Pump" and shows "1 of 2 assets"; (4) clicking the "Poor" condition button hides the "Good" asset; (5) `error: true` renders "Unable to load the asset register" and clicking Retry calls the `onRetry` spy exactly once.
- Observed issues: Uses `createElement` instead of JSX throughout despite the `.tsx` extension (lines 40, 45, 52, 60, 68).
- ASSUMED: None.

## src/components/floor-plan/PinFilters.tsx

- Purpose: Fully controlled three-dropdown filter bar (status, priority, type) for floor-plan pins, with an active-filter-count badge and a conditional Clear button.
- Public surface: `PinFilters(props: PinFiltersProps): JSX.Element` (lines 27-36), arrow-function component, named export. `PinFiltersProps = { statusFilter: StatusFilter; priorityFilter: PriorityFilter; typeFilter: TypeFilter; onStatusChange: (s: StatusFilter) => void; onPriorityChange: (p: PriorityFilter) => void; onTypeChange: (t: TypeFilter) => void; onClearFilters: () => void; activeFilterCount: number }` (lines 16-25, interface itself not exported). Exported types: `StatusFilter = 'all' | 'open' | 'in_progress' | 'finished' | 'closed'` (line 12), `PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'` (line 13), `TypeFilter = 'all' | 'snag' | 'observation'` (line 14).
- Inputs & outputs: Controlled entirely by props — no internal state. Renders a header row (Filter icon, "N active" `Badge` when `activeFilterCount > 0` at lines 43-47, ghost Clear button when count > 0 at lines 49-59) and a 3-column grid of C01 `Select`s whose items carry emoji-prefixed labels (lines 62-99). No stores, env vars, or network.
- Dependencies: uses -> C01 ui-kit-shadcn `Badge`/`Button`/`Select*` (lines 1-9); `lucide-react` `Filter`, `X` (line 10). used by <- C12 floor-plan-annotation: `src/components/FloorPlanPinsList.tsx:18` (named value + type import via the direct path `"./floor-plan/PinFilters"`), rendered at line 274 inside a collapsible filter section gated by that component's `showFilters` state (lines 272-285). Grep-verified; no other consumers.
- Side effects: None — each `Select`'s `onValueChange` casts the string to the corresponding union (`v as StatusFilter` line 63, `v as PriorityFilter` line 76, `v as TypeFilter` line 89) and forwards it to the parent callback.
- Error handling: None.
- Tests: None found — grep of `src/**/*.test.{ts,tsx}` for "PinFilters" returned no hits.
- Observed issues:
  - The `onValueChange` casts (lines 63, 76, 89) have no runtime validation; the possible values are constrained only by the rendered `SelectItem`s.
  - Select item labels embed emoji characters (lines 69-72, 82-85, 95-96).
  - The status vocabulary here is the four-state set `open / in_progress / finished / closed` (line 12, lines 68-72).
- ASSUMED: None.

## src/components/floor-plan/index.ts

- Purpose: One-line barrel re-exporting `PinFilters` and its three filter types.
- Public surface: `export { PinFilters, type StatusFilter, type PriorityFilter, type TypeFilter } from './PinFilters'` (line 1). Nothing else in the file.
- Inputs & outputs: None — pure re-export module.
- Dependencies: uses -> `./PinFilters` (same unit). used by <- none found (grep-verified: no file imports from `@/components/floor-plan` or a `components/floor-plan` directory path; the sole PinFilters consumer imports the file directly at FloorPlanPinsList.tsx:18).
- Side effects: None.
- Error handling: n/a.
- Tests: None.
- Observed issues: The barrel has zero importers; the directory's only export is consumed by its direct file path instead.
- ASSUMED: None.
