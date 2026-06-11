# Phase 3 — Deep Sweep (Full-App Review, 2026-06-11)

Functional bugs in the high-complexity areas not deeply covered by Phases 1–2: schematic/fabric editor, PDF template manager/WYSIWYG, global search, dashboard analytics, validation/feedback flows, profile/settings. Disprove-first verified. Severities as before.

Fixed in this batch unless marked **DEFERRED**.

---

## Rendering / editors

### P3-1 — Schematic "Block Size" presets write pixel values into %-based dimensions → giant blocks — **High**
`src/components/site/SchematicDiagram.tsx:130-137` (px presets) + `:1032-1057` (`handleApplySizePreset`) vs render `:1658-1661` (`width:${w}%`). Applying any preset sets `width:220` etc. into a `%` field → blocks balloon to hundreds of percent and the corrupted sizes are bulk-persisted. **Fix:** make presets/custom range percentage-based and relabel inputs to "%".

### P3-2 — PDF WYSIWYG "Subsections" edits land on the wrong section — **High**
`src/components/settings/PDFWYSIWYGEditor.tsx:583`: `sections.find(s => s.id === 'subsections' || s.type === 'table')`. No section has id `subsections`, so the `s.type === 'table'` fallback matches the FIRST table (`summary-statistics`). All column renames/adds/visibility toggles on the Subsections table mutate `summary-statistics` and are persisted. **Fix:** match the real id (`subsection-details`); don't fall back to `type === 'table'`.

### P3-3 — Schematic block drag/resize persists out-of-bounds (negative) positions — **Medium**
`src/components/site/SchematicDiagram.tsx:565-622` (resize, no lower clamp) and `:603-617` (drag, snapped but not clamped), saved at `:636-645`. Blocks can be dragged/resized off-page and that state saved. (`handleSchematicClick` already clamps — mirror it.) **Fix:** clamp `x/y` to `[0, 100-width]`/`[0, 100-height]` in both drag and resize before save.

### P3-4 — SiteSummaryFullPreview QR effect re-runs O(N) times — **Low**
`src/components/settings/preview-renderers/SiteSummaryFullPreview.tsx:104-161`: `generateQRCodeDataUrl` is `useCallback(..., [qrCodeCache])`; each `setQrCodeCache` changes the dep → new callback identity → effect re-fires. Self-limiting (cache guard) but wasteful. **Fix:** functional-updater + drop `qrCodeCache` from deps (use a ref).

### P3-5 — Inspection-template edit/save flow is dead — **Medium · DEFERRED (product decision)**
`src/components/settings/PDFTemplateManager.tsx`: `setInspectionHasChanges(true)` is never called and `InspectionTemplatePreview` has no edit props, so the Save button/badge never appear and edits are never captured. Fix is either "wire an editable preview" (large) or "remove the dead Save UI" (removes an implied feature) — needs a product call on whether inspection-form templates should be editable here. Documented, not changed.

---

## Cross-cutting features

### P3-6 — Rejected issue reports land in an unrecognized status (`in_progress` vs `in-progress`) — **High**
`src/components/VerificationDialog.tsx:114` writes `status: 'in_progress'` to `issue_reports`, but the whole IssueReports UI uses hyphenated `'in-progress'` (`IssueReports.tsx:332,375,652`). Rejected issues then show no status icon, are excluded from the "Progress"/"Resolved"/"New" counts, and present a blank Status select. **Fix:** write `'in-progress'` for `issue_reports`. (Verify the `suggestions` table's own vocabulary before touching that path.)

### P3-7 — COC compliance rate corrupted by NULL `validated_at` sort order — **Medium**
`src/lib/complianceCalculations.ts:52-69`: `.order('validated_at', {ascending:false})` then "first row per subsection = latest". Postgres sorts NULLs first on DESC, so a null-dated/pending validation outranks a real later Fail → wrong latest status → wrong dashboard %. **Fix:** `nullsFirst:false` (or filter nulls / tiebreak on `created_at`).

### P3-8 — Global search breaks on `,` `(` `)` `%` `_` — **Medium**
`src/hooks/useGlobalSearch.ts:50,75,108-110,159`: raw query interpolated into PostgREST `.or("name.ilike.%${q}%,...")`. A comma (the `.or` delimiter) or paren produces a malformed filter → 400 → silently empty results; `%`/`_` change matches. **Fix:** sanitize (escape `%`/`_`, strip/encode `,` `(` `)`) or use per-column `.ilike()` combined client-side.

### P3-9 — Calendar PDF `pendingCount` can be negative / double-counts — **Medium**
`src/views/Calendar.tsx:262-265`: `pending = total - completed - upcoming`, but completed and upcoming overlap (a completed event with a future date is in both) → double-subtracted. **Fix:** define disjoint buckets (`completed`; `upcoming = !completed && future`; `pending = remainder`). (Builds on the Phase-2 C6 `parseISO` fix.)

### P3-10 — Dashboard COC pass-rate denominator includes non-pass/fail/pending; stacked bar gaps — **Medium**
`src/views/Dashboard.tsx:170-179,422-435`: `passed/failed/pending` match an allow-list; any other status (Expired/Error/Override…) is in `total` but no bucket, so pass-rate is diluted and the three bar widths don't sum to 100%. **Fix:** bucket "other" explicitly or compute pass-rate over `(passed+failed)`.

### P3-11 — Profile password change verifies against `profile.email` not the auth email — **Medium**
`src/views/MyProfile.tsx:164`: re-auth uses `signInWithPassword({ email: profile?.email })` while the auth email is fetched separately as `auth_email` (`:57`). If they differ/empty, a correct current password is rejected ("incorrect"). **Fix:** use `profile?.auth_email`.

### P3-12 — Site-assignment add/remove doesn't invalidate history/recent queries — **Low-Medium**
`src/views/SiteAssignments.tsx:311,332` invalidate only `["site-assignments-flat"]` (post Phase-2 C5). The on-page history (`["site-assignment-history"]:222`) and the dashboard `["recent-site-assignments"]` widget go stale until reload. **Fix:** also invalidate those keys in both mutations.

### P3-13 — VerificationDashboardWidget sorts/renders `verified_at` without a null guard — **Low**
`src/components/VerificationDashboardWidget.tsx:51,100`: selects verified/rejected rows without `verified_at is not null`, then `new Date(verified_at!)` for sort + `format(...)` → NaN sort / "Invalid Date" for legacy rows (VerificationManagement deliberately falls back `verified_at || resolved_at || created_at`). **Fix:** filter nulls or apply the same fallback.

---

## Checked clean (notable)
Add-column/KPI dialog `onOpenChange` nulling (safe), `EditableCell` double-onChange (idempotent), schematic calibration/zoom math + listener cleanup, PDFTemplateManager JSON round-trip, Settings persistence, NotificationListener, React Query provider defaults, validation-chat (no UI exists).
