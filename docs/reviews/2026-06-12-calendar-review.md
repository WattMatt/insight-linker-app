# Calendar Feature — Full Review (battle-tested, nothing assumed)

**Date:** 2026-06-12 · **Reviewer:** multi-agent fan-out (6 dimensions) + controller verification
**Scope:** admin `src/views/Calendar.tsx` (676 lines, 12-month year grid + CRUD + PDF export), client `src/views/ClientPortalCalendar.tsx` (223 lines), the `generate-pdf` edge function calendar path, and the `calendar_events` table.

**Method:** every finding cites `file:line` or a DB object. The two headline criticals (PDF 400, grid crash) and the RLS hole were re-verified against code by the controller, not just relayed.

## Remediation status (updated 2026-06-12, deployed `main @ c61b35f`)
**Fixed:** C1 (PDF payload + H5 casing + M5 columns/escaping/empty/locale, edge fn redeployed), C2 (site_id FK + created_by/updated_by + role-aware RLS replacing the permissive policy; admin site picker H3, client view scoped by site_id; migrations `20260612250000` applied), C3 (UI + defensive grid guard + DB CHECK `20260612240000`), C4 (loading/error/empty states), C7 (client `parseISO` off-by-one), and folded-in H6 (double-submit), H9 (trim), H10 (attribution), L1 (header), M1 (status/priority CHECKs), M4 (error messages).
**⚠ Needs in-app verification:** that staff can still create/edit events under the new RLS (mirrors the working inspections policy, but RLS can't be tested with the service-role key) — and a visual check of the now-working PDF export.
**Fixed — UX pass (deployed `main @ d1c8201`):** C6 (day-detail dialog wired + click-empty-day-to-add), H1 (+N more overflow cap), H12 (status dots on bars), M3 (AlertDialog delete), M6 (Year/Agenda view toggle + site/status filters), H4 (client portal hides internal priority + client status vocabulary), M8 (client "Schedule" relabel), M9 (client Upcoming/Past grouping), L7 (truncation) + partial C5 (aria-labels). PDF report: month grouping, real status-derived KPIs + priority breakdown (M10), legend, and proper pagination (M5).

**Still open (next tiers):** H2 (year-boundary overlap fetch), H7/H8 (concurrency, overlap detection), H11 (events-by-day memo index), full C5 (complete keyboard grid nav), and the LOW backlog (recurring events, reminders, drag-to-reschedule).

## Verified data model
`calendar_events` (41 rows, range 2025-07 → 2026-04): `id, title (NOT NULL), site_name (text — NOT a FK to sites), start_date (date NOT NULL), end_date (date null), status (default 'Scheduled'), priority (default 'High'), event_type (text), created_at, updated_at`. No `created_by`/owner. No CHECK constraints. RLS enabled with a **single** policy `"All authenticated users full access"` = `cmd=ALL, USING/CHECK (auth.uid() IS NOT NULL)`.

---

## 🔴 CRITICAL (broken or unsafe in production today)

### C1 — PDF export is completely broken (always HTTP 400)
- **Evidence:** `Calendar.tsx:269-291` builds `reportData` with `events` + `stats` at the TOP LEVEL (`reportType:'calendar'`, no `calendar` key). The edge function requires it nested: `generate-pdf/index.ts:3035` `if (!body.calendar) return 400 'Missing calendar data…'`; `:2828` `const cal = data.calendar!`. `useUnifiedPdfGeneration` posts the payload as-is (no remap). **Every "Export PDF" click returns 400 → "Export failed" toast.** The feature has never produced a PDF in this shape.
- **Fix:** wrap the payload as `calendar: { year, events, stats }` (matching `CalendarData`, `generate-pdf/index.ts:763-782`) **and** fix the `CalendarReportData` interface (`useUnifiedPdfGeneration.ts:152-171`), or have the edge `'calendar'` case build `body.calendar` from top-level fields (mirror the inspection flat/nested handling at `index.ts:2988-3004`).

### C2 — `calendar_events` is a global shared table: any authenticated user can read/update/delete every tenant's events
- **Evidence:** the single RLS policy authorizes all rows for any `auth.uid()`; there is no `client_id`/`created_by` and `site_name` is free text. The client portal's `.in("site_name", siteNames)` (`ClientPortalCalendar.tsx:64-68`) is a cosmetic filter, not a security boundary — a client can run `supabase.from('calendar_events').select('*')` (no filter) and read **all** events, or `.delete().eq('id', <other tenant's id>)` and destroy them, with no audit trail.
- **Fix:** add `site_id uuid REFERENCES sites(id)`; split the `ALL` policy into role-aware `SELECT/INSERT/UPDATE/DELETE`: clients get **SELECT only**, scoped via `user_clients → sites`; writes restricted to staff (`has_role`). Add `created_by`/`updated_by` for attribution.

### C3 — Saving an event with `end_date < start_date` crashes the entire year grid
- **Evidence:** `handleSaveEvent` validates only presence of title/site_name/start_date (`Calendar.tsx:183-191`); no date-order check, and the DB has no CHECK. On render, `getEventsForDay` calls `isWithinInterval(day, { start, end })` (`:94`) for **every** day cell — date-fns throws `RangeError: Invalid interval` when `end < start`, crashing the whole grid for anyone viewing that year.
- **Fix:** in `handleSaveEvent`, reject `end_date < start_date` with a toast (string compare is safe for `yyyy-MM-dd`); set `min={start_date}` on the end-date input (`:599-606`); add DB `CHECK (end_date IS NULL OR end_date >= start_date)`; defensively skip/swap in `getEventsForDay`.

### C4 — No loading or error state: fetch failures render as a confusing empty calendar
- **Evidence:** `Calendar.tsx:69-82` destructures only `{ data, refetch }` from `useQuery` — ignores `isLoading`/`isError`. On failure `events` stays `undefined`, `getEventsForDay` returns `[]`, the grid renders empty and the table shows "No scheduled events" (`:540`) — **indistinguishable from a genuinely empty year**. Same masking in `ClientPortalCalendar.tsx` (sites queries discard `error`, `:22/:54`). Violates the project investigation protocol (silent data-layer failure).
- **Fix:** consume `isLoading`/`isError`; show a skeleton, a distinct error card with Retry (`refetch`), and a real empty state inside the grid.

### C5 — The calendar grid is unusable by keyboard / screen readers
- **Evidence:** day `<button>`s expose only a bare number with no `aria-label` (`Calendar.tsx:388-398`); event bars are `<div onClick>` with no `role`/`tabIndex`/`aria-label`/key handler (`:414-431`) — invisible to AT and keyboard. Fails WCAG 2.1.1 + 4.1.2.
- **Fix:** `aria-label={format(day,'EEEE, MMMM d, yyyy')}` + event count on day buttons; convert event bars to real `<button>` with `aria-label`; add an adjacent visually-hidden per-day event list.

### C6 — Clicking a day/event does nothing — `selectedEvent` is dead state
- **Evidence:** `setSelectedEvent` is called at `Calendar.tsx:389` (day) and `:429` (bar), but **no Dialog/consumer is bound to `selectedEvent`** — the only dialog is the add/edit form (`isEventDialogOpen`). The grid advertises interactivity (cursor-pointer, onClick) that delivers nothing; a day with multiple events only ever targets `dayEvents[0]`.
- **Fix:** wire a day-detail popover/dialog to `selectedEvent` listing **all** that day's events, or remove the misleading click affordances.

### C7 — Client portal renders dates off-by-one across timezones (`new Date` vs `parseISO`)
- **Evidence:** `ClientPortalCalendar.tsx:118-120, 197-198` use `new Date(dateString)` — a date-only string parses as **UTC midnight**, shifting the displayed day by one in negative-UTC offsets and diverging from the admin view, which correctly uses `parseISO` (local midnight).
- **Fix:** use `parseISO()` everywhere in the client view (already a dependency).

---

## 🟠 HIGH

- **H1 — Event-density overflow:** bars stack at `top: 20 + idx*8 %`, 6px tall, no cap, no "+N more" (`Calendar.tsx:401-441`); ~10+ events overflow the cell and become invisible/unreachable. → cap to N + "+N" badge + day-detail popover.
- **H2 — Year-boundary events vanish:** query filters on `start_date` only (`:75-76`); a Dec→Jan event shows only in its start year, its other half never renders. → fetch by interval overlap (`start_date <= yearEnd AND (end_date IS NULL OR end_date >= yearStart)`).
- **H3 — `site_name` free text, no FK:** typos/renames orphan events and break the client name-match scoping; same-named sites across clients cross-leak (`Calendar.tsx:576-583`, `ClientPortalCalendar.tsx:61-67`). → `site_id` FK + a `<Select>` from `sites`.
- **H4 — Internal fields exposed to clients:** priority, raw status, event_type rendered to clients (`ClientPortalCalendar.tsx:174-206`) — internal triage signals. → client-facing projection; hide priority, map status to friendly vocab.
- **H5 — PDF status/priority casing mismatch:** frontend sends `"Completed"/"High"`; edge compares `=== 'completed'/'high'` (`generate-pdf/index.ts:2873-2876`) — never matches, all badges fall to amber/grey. Also `upcoming`/`pending` aren't real statuses. → `.toLowerCase()` + map real statuses (surfaces only after C1).
- **H6 — No double-submit guard:** Save/Create button has no `disabled`/`isSaving` (`Calendar.tsx:666`); slow network → duplicate inserts. → `isSaving` state (the Export button already does this at `:320`).
- **H7 — Last-write-wins concurrency:** bare `.update().eq('id')` with no version guard (`:195-206`); two editors silently clobber. → optimistic concurrency via `.eq('updated_at', loadedUpdatedAt)`.
- **H8 — No overlap/double-booking detection:** same site same day saves silently (`:183-236`). → pre-save overlap query + non-blocking warning.
- **H9 — Whitespace-only title/site_name bypass validation:** `!formData.title` is true-for-spaces (`:184`). → validate/persist `.trim()`.
- **H10 — No `created_by`/owner:** no attribution/audit on a world-writable table. → add `created_by`/`updated_by`.
- **H11 — Performance: O(cells × events) per render, no memoization:** `getEventsForDay` filters the full array for each of ~365 cells on every render incl. each keystroke in the dialog (`:84-99, 382`). Fine at 41 rows, janky at 500+. → `useMemo` an events-by-day index (Map keyed `yyyy-MM-dd`); isolate the form from the grid.
- **H12 — Color-only encoding of status/priority** (WCAG 1.4.1) + likely sub-AA contrast; grid bars carry no text (`:406, 101-125`). → add non-color cues + text labels; verify contrast.
- **H13 — Tooltip detail unreachable by keyboard:** the only grid event detail is a hover tooltip on a non-focusable `<div>` (`:412-439`). → fixed by C5's real buttons.

## 🟡 MEDIUM

- **M1** — No CHECK constraints on status/priority/event_type; **form priority default 'Medium' (`:59`) ≠ DB default 'High'** — reconcile + add CHECKs/enums.
- **M2** — `event_type` is free text despite an enum-like placeholder (`:647-656`) → `<Select>`.
- **M3** — Delete uses native `window.confirm` (`:239`), inconsistent with the app's `AlertDialog`, no undo/soft-delete.
- **M4** — Errors swallowed into generic toasts, real `error.code/message` discarded (`:229-235, 250-256`) — undebuggable, esp. RLS `42501` after C2 is fixed; surface the message (and in `useUnifiedPdfGeneration` read `error.context.json()` so C1-class failures are diagnosable).
- **M5** — PDF: `end_date` + `event_type` are sent but never rendered (only start date, `generate-pdf/index.ts:2864-2881`); single-page layout with hardcoded footer "1/1" overflows at 41 rows; no empty-state branch; `toLocaleDateString()` with no locale (non-deterministic); **unescaped HTML interpolation** of title/site (`:2879-2883`) — injection/layout-break sink. → add columns, paginate, empty state, `'en-ZA'`, `escapeHtml`.
- **M6** — No mobile/narrow story: 12 stacked month grids, 6px bars below tap-target size (`:348, 422`); year-only navigation. → month/agenda view on mobile.
- **M7** — Two divergent color systems; `getStatusColor`/`getPriorityColor` helpers are **dead code** (`:101-125`); table's `else` defaults unknown status→green, unknown priority→green (wrong-by-default, `:500, 511`).
- **M8** — Client view mislabeled "Inspection Calendar" but merges `inspections` + generic `calendar_events` (`ClientPortalCalendar.tsx:104-149`); a Maintenance event shows as "Inspection at <site>". → rename/source-agnostic copy or per-type labels.
- **M9** — Client query has no date window (`:64-68`) vs admin's year bound — unbounded flat scroll, no calendar affordance/parity. → add windowing + grouping (upcoming/past).
- **M10** — PDF stat buckets are date-derived ("upcoming"/"pending") not status-derived, won't reconcile with the on-screen table; "today" misclassified as pending (`Calendar.tsx:262-267`). → derive from real statuses or relabel.

## 🟢 LOW / enhancements

- **L1** — Header always reads "January {year}" above year-nav chevrons (`:339-341`) → show the year only.
- **L2** — Dead `weekDays` constant (`:307`); grid uses an inline array (`:364`).
- **L3** — No **recurring events** (no rrule/recurrence) — recurring inspections entered manually.
- **L4** — No **reminders/notifications** before an event (`reminder_at` + scheduled fn).
- **L5** — Past-date events allowed with no signal (sometimes valid — show a hint when status is Scheduled & date < today).
- **L6** — No click-empty-day-to-add affordance (`:388-389`); no "Today" jump; no search/filter; no drag-to-reschedule.
- **L7** — Long titles overflow table/tooltip with no truncation (`:487, 435`).
- **L8** — Over-broad `select('*')` everywhere → explicit column lists.
- **L9** — Admin client-preview is correctly Admin-gated (`useUserRole.tsx:64`) — sound, but don't mistake it for the (absent) DB tenancy boundary.

---

## Recommended remediation order

1. **Ship now (correctness + safety):** C1 (PDF payload), C3 (date-order crash + DB CHECK), C4 (loading/error state), C2 (RLS redesign + `site_id` + `created_by`). These are functional/security defects.
2. **Next (integrity + UX):** C6/C5 (wire day-detail + a11y), C7 (client date off-by-one), H1/H2 (overflow + year-boundary), H3/H4 (site_id scoping + client projection), H5/M5 (PDF correctness once C1 lands).
3. **Then:** the remaining HIGH (concurrency, double-submit, overlap, validation, perf memoization, contrast) and MEDIUM hygiene.
4. **Backlog:** recurring events, reminders, month/week views, drag-to-reschedule.

**Root cause cluster:** most CRITICAL/HIGH items trace to two design gaps — (a) `calendar_events` has no tenancy/identity columns (`site_id`, `created_by`) and a permissive RLS policy, so it's a global shared table; (b) the grid was built display-first without validation, async-state, or accessibility. Fixing (a) closes C2/H3/H4/H10 and the client-scoping issues at once.
