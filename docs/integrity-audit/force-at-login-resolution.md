# Force-at-login orphan resolution — spec + deployment

> **Status:** server-side complete (2026-05-27); client work pending.
> **Audience:** 3 inspectors with 28 unresolved orphan inspections — Ernst de Beer (25), Dawie (2), Heinrich Botha (1).
> **Why this exists:** the 28 active orphans (post-Stage 4b cleanup) need each inspector's first-hand knowledge to pick the correct subsection. Admin similarity-matching only got 88% of the original 233 — the remaining 12% are tenant trading names that need a human who knows the building.

## Server side — already deployed (Supabase project `oltzgidkjxwsukvkomof`)

### 1. View: `public.my_unresolved_orphans`

`security_invoker = true`, scoped by `auth.uid()`. Each row carries the candidate-subsection list and a pg_trgm best-guess pre-attached for the picker UI:

```sql
SELECT
  inspection_id, inspection_title, inspection_status, created_at,
  site_id, site_name,
  shop_name_orphan, shop_number_orphan,
  candidate_subsections,  -- jsonb: [{id, name}, ...]
  best_guess              -- jsonb: {id, name, similarity} or null
FROM public.my_unresolved_orphans
ORDER BY site_name, created_at;
```

`GRANT SELECT ... TO authenticated`. Other users see nothing.

### 2. RPC: `public.resolve_my_orphan(p_inspection_id uuid, p_subsection_id uuid)`

`SECURITY DEFINER`, `authenticated` callable. Server-side guards:

- Caller must be authenticated
- Inspection must exist and belong to the caller (`inspector_id = auth.uid()`)
- Inspection must currently be unresolved (`subsection_id IS NULL`)
- Subsection must exist and live at the same `site_id` as the inspection

On success: `inspections.subsection_id` set, audit row inserted into `integrity.inspection_remediation_proposals` (source `manual`, status `applied`, evidence `{rule: inspector_self_resolution, ...}`).

### 3. RPC: `public.archive_my_orphan(p_inspection_id uuid, p_reason text DEFAULT NULL)`

Same shape, sets `inspections.deleted_at = now()` instead of linking. For "not mine / discard" cases. Audit row carries the reason.

## Client side — direct implementation in `insight-linker-app`

> ⚠️ Earlier draft of this doc referenced a "Lovable prompt". That's stale — the repo was de-Lovabled (see commits `3b0f48a` favicon-strip and `16640b9` cache-bust). The code is now a plain Next.js 14 + shadcn/ui + Supabase JS app, edited directly via git.

### Files to add

- `src/hooks/useUnresolvedOrphans.ts` — wraps `supabase.from('my_unresolved_orphans').select('*')` + the two RPCs, exposes `{rows, loading, resolveOne, archiveOne, refresh}`.
- `src/components/OrphanResolutionModal.tsx` — controlled `<AlertDialog>` (so it's non-dismissable on backdrop click); inside, a scroll area listing one card per orphan with a `<Select>` picker populated from `row.candidate_subsections`, pre-selected to `row.best_guess.id` when `row.best_guess.similarity >= 0.6`. Per-row "Save" calls `resolveOne(inspection_id, picker_value)`; "Not mine — archive" opens a small `<AlertDialog>` for the reason and calls `archiveOne(inspection_id, reason)`.

### Wiring

- Insert the modal into `src/components/ProtectedRoute.tsx` (or the role-specific wrapper that contractors hit — likely `ContractorProtectedRoute.tsx`). Render the modal as a sibling to `{children}`; the hook auto-opens when `rows.length > 0`. As resolutions/archives reduce the count to zero, the dialog closes itself and `{children}` becomes interactive.

### Types

- After deploy, run `supabase gen types typescript --project-id oltzgidkjxwsukvkomof > src/types/database.ts` (or whatever the existing types path is) to pick up `my_unresolved_orphans` + the two RPC signatures. Until then, type the hook with a hand-written interface (the view's columns are stable: `inspection_id`, `inspection_title`, `inspection_status`, `created_at`, `site_id`, `site_name`, `shop_name_orphan`, `shop_number_orphan`, `candidate_subsections`, `best_guess`).

### UX details

- **Pre-selection**: if `best_guess.similarity >= 0.6`, pre-select that subsection in the picker and tag the row with a green "suggested" badge. Below 0.6, leave the picker empty so the user has to choose actively.
- **RPC errors as toasts**: re-use whatever toast component is already in the project (`<Toaster>` from sonner is in the package.json).
- **Per-row state**: while the RPC is in flight, disable that row's buttons; on success, animate-out and `refresh()` the hook.
- **No server-side validation duplicated in client**: the RPC enforces ownership, same-site, idempotency. The client just surfaces errors.
- **Mobile** (Capacitor): same component works — Radix dialogs are responsive.

### Test plan

- Vitest unit test for the hook with a mocked Supabase client (verify the SELECT shape and the two RPC payloads).
- Optional Playwright e2e: stub the auth session, mock the view to return 2 rows, click resolve on row 1, assert row 2 remains and dialog stays open, then resolve row 2, assert dialog closes.

### Sequencing relative to iOS

Web modal ships first (smaller surface area, faster iteration). Once Ernst clears his 25 via web, the active-orphan count is verified at 0. Then we know the server contract holds and can mirror the flow into the iOS app (Stage 4c-5).

## Client side — iOS spec for ECompliance

Equivalent SwiftUI flow, fifth worktree branch `feat/stage4c-5-orphan-resolution-modal` (not yet built).

- On `ECompliance.appLaunch` after `SupabaseService.shared.isAuthenticated` becomes true, query the view via `client.from("my_unresolved_orphans").select()`.
- If non-empty, present a `.fullScreenCover` whose dismiss is gated on the count reaching zero.
- For each row, a `Form` row with a `Picker` populated from `candidate_subsections`, plus "Save" and "Not mine" buttons calling the corresponding RPC.

Defer this until the web flow lands and we see Ernst's orphans actually clear.

## Adjacent iOS bug to fix in the same TestFlight cycle — finding (f)

`inspector_id` is NULL on **all 1,109 inspections** because the iOS `InspectionDTO` `encode(to:)` (`ServicesSupabaseSyncService.swift:1846-1870`) omits `inspectorId` from the encoded payload. The model carries it (`Inspection.swift:83`) and `AddInspectionView.swift:246-247` sets it correctly from the auth session — but it never reaches Supabase.

Fix is one line per direction:

- `encode(to:)`: add `try c.encodeIfPresent(inspectorId, forKey: .inspectorId)` (and ensure `case inspectorId = "inspector_id"` is in `CodingKeys` — appears to be already since `inspectorName = "inspector_name"` exists).
- `fetchInspections` SELECT list (line ~851): add `inspector_id` to the column list so pulls populate it too.

Same TDD pattern as 4c-1: add a unit test that builds an `Inspection` with `inspectorId = some UUID string`, calls `makeInspectionDTO`, asserts the resulting DTO has `inspectorId` set. Currently fails (field unset by encode). After fix, passes.

Without this, the force-at-login flow only works on existing orphans (the 28 we backfilled via SQL above). New inspections would land with NULL `inspector_id` again — but Stage 4c-4's validator now blocks completion without subsection so new orphans of this exact class can't be created anyway. Still worth fixing for clean attribution.

## Communication

Email Ernst (and CC Dawie, Heinrich):

> Subject: One-time shop attachment screen on your next sign-in
>
> Hi Ernst — when you next sign in to the compliance app, you'll see a one-time screen listing N inspections that need a shop attached. Each row shows the shop name you typed at the time + a list of every shop at that site to pick from. Most should be obvious from the shop name; the system also pre-selects its best guess where confident.
>
> Should take about ten minutes for your 25 rows. If any row is something you didn't do or want to discard, hit "Not mine — archive". Everything is reversible.
>
> Cheers, Arno

## Why this beats other options we considered

- **Admin manually researches**: I'd have to look up which tenant is at which shop number per row × 28 rows. Slow, error-prone, and discards the inspector's first-hand knowledge.
- **Send each inspector a CSV**: same answer to a worse interface. They'd still need access to the subsection list per site.
- **Pure pg_trgm auto-apply**: we did the high-confidence rows already (2 STRONG). Pushing the threshold lower risks wrong attribution that needs reverting.

## After this lands

`SELECT count(*) FROM inspections WHERE subsection_id IS NULL AND deleted_at IS NULL` should drop to **0** (or stay at 5 if the 3 inspector-outreach Completed + 2 dark-Completed-with-real-data aren't owned by the 3 inspectors above — they are, so it goes to 0).

Combined with iOS Stage 4c-1, 4c-2, 4c-4 in TestFlight, the orphan count stays at 0 going forward.
