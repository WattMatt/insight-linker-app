# C05 — settings-panels

- Unit id: C05
- Slug: settings-panels
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 4 (`src/components/settings/*` — matches `review/unit-files.json` key "C05")

## Unit header

**Unit purpose (as-is).** `src/components/settings/` holds four sibling leaf components. Two are admin panels mounted by the Settings view (V02): a daily auto-logout editor persisting to the `settings` table, and a batch image-compression trigger that invokes the `batch-compress-images` edge function (F04). The other two — a mock PDF-page preview strip and a static SANS 10142-1:2020 reference tab — export components with no current importers anywhere in `src` or `supabase` (grep-verified).

**Module-level observations.**
- No file in this unit imports another file in the unit; each is a standalone leaf (verified by reading all four import blocks: AutoLogoutSettings.tsx:1-9, ImageCompressionManager.tsx:1-11, PDFTemplatePreview.tsx:1-4, SANSReferenceTab.tsx:1-23).
- Consumer split: `src/views/Settings.tsx` (V02) imports AutoLogoutSettings (Settings.tsx:12, rendered :328) and ImageCompressionManager (Settings.tsx:11, rendered :334). PDFTemplatePreview and SANSReferenceTab have zero grep hits outside their own files.
- An untracked duplicate `src/views/Settings 2.tsx` (git status `??`) carries the same two imports at the same line numbers (12/328 and 11/334).
- No test file anywhere under `src` references any of the four components (grep for the four component names across `*.test.*` / `*.spec.*`: zero hits).
- Only the two consumed panels touch backend state (Supabase `settings` table; edge-function invocation). The two unconsumed files are pure presentation with no I/O.
- The `settings` table columns this unit writes (`auto_logout_enabled`, `auto_logout_time`) were added by `supabase/migrations/20260206105621_98283aeb-a916-4255-912c-ca7e946e34c0.sql:1-4` and are read back for enforcement by `src/components/SessionWatcher.tsx:28-39` (C10 route-guards-auth).

**External contract.** The rest of the app receives exactly two working panels via V02's Settings page: `<AutoLogoutSettings />` (edit daily forced-logout schedule) and `<ImageCompressionManager />` (run/dry-run storage-wide image compression). `PDFTemplatePreview` and `SANSReferenceTab` are exported but contribute nothing to any current page.

---

## src/components/settings/AutoLogoutSettings.tsx

- Purpose: Admin card that reads and edits the daily auto-logout toggle and time stored in the Supabase `settings` table, with a live browser-clock display.
- Public surface:
  - `export function AutoLogoutSettings(): JSX.Element` — no props (AutoLogoutSettings.tsx:17).
  - Non-exported local interface `AutoLogoutSettingsData { id: string; auto_logout_enabled: boolean; auto_logout_time: string }` (:11-15).
- Inputs & outputs:
  - Reads: `settings` table via `.select('id, auto_logout_enabled, auto_logout_time').single()` (:46-49) — no row filter; `.single()` presumes exactly one row.
  - Writes: `.update({ auto_logout_enabled, auto_logout_time }).eq('id', settings.id)` on Save (:71-77) and `.update({ auto_logout_enabled })` on toggle (:97-100).
  - Time format conversion: DB `HH:MM:SS` truncated to `HH:MM` for the input (:57-58); on save `:00` is appended back (:75).
  - Display-only: browser current time formatted `toLocaleTimeString('en-ZA', { hour, minute, timeZoneName })`, refreshed every 60 s (:29-39, :183).
  - No localStorage/IndexedDB keys, no env vars.
- Dependencies:
  - uses -> `@/components/ui/{card,label,switch,input,button}` (C01, :2-6); `@/integrations/supabase/client` (L19, :7); `sonner` toast (external, :8); `lucide-react` (external, :9); `react` (:1).
  - used by <- V02 admin-ops-and-template-views (`src/views/Settings.tsx:12`, rendered :328). Also imported by untracked duplicate `src/views/Settings 2.tsx:12`. `src/components/SessionWatcher.tsx:11` (C10) declares its own local interface named `AutoLogoutSettings` — a name coincidence, not an import of this file. (All grep-verified.)
- Side effects: two-way Supabase network I/O on mount/save/toggle; `setInterval(..., 60000)` started on mount and cleared on unmount (:39-41); `toast.success` / `toast.error` emissions (:81, :85, :104, :107); `fetchSettings()` re-fetch after a successful save (:82).
- Error handling:
  - Fetch failure (including `.single()` failing on 0 or >1 rows): `console.error` only, no toast; `loading` set false; `settings` stays `null` and the card renders with defaults `enabled=false`, `logoutTime='02:00'` (:59-63).
  - With `settings === null`: `handleSave` returns immediately (:67); `handleToggle` first flips local `enabled` state, then returns without persisting (:91-94).
  - Save failure: `console.error` + `toast.error(error.message || 'Failed to save settings')` (:83-85).
  - Toggle failure: `console.error` + `toast.error` + revert of local `enabled` state (:105-109).
- Tests: none found (grep-verified — no test file references `AutoLogoutSettings`).
- Observed issues:
  - On any fetch error the component silently presents the feature as disabled with no user-visible error (:59-63), and the toggle then mutates UI state without persisting anything (:91-94).
  - "Current time" is the browser's local clock rendered with `en-ZA` formatting (:30-35), while the DB column is a zone-less `time` (migration 20260206105621:4); the card compares/displays without stating which clock enforcement uses.
  - Save path updates both fields and toggling updates one field — two separate write paths to the same row (:71-77 vs :97-100).
  - `SessionWatcher.tsx:11` (C10) duplicates the interface name `AutoLogoutSettings` with a different shape (no `id`).
- ASSUMED:
  - The `settings` table holds exactly one row (implied by unfiltered `.single()`; not verified against data).
  - RLS on `settings` permits the current admin user's update (not verified).
  - Enforcement of the schedule happens in SessionWatcher (C10), which reads the same two columns (SessionWatcher.tsx:28-39 verified; the full enforcement path is C10's spec, not re-verified here).

---

## src/components/settings/ImageCompressionManager.tsx

- Purpose: Admin card that invokes the `batch-compress-images` Supabase edge function against the `inspection-photos` bucket with tunable width/quality/size/limit parameters, defaulting to dry-run, and renders summary stats plus a per-file result list.
- Public surface:
  - `export function ImageCompressionManager(): JSX.Element` — no props (ImageCompressionManager.tsx:32).
  - Non-exported local interfaces `ProcessedFile { path: string; originalSize: number; compressedSize?: number; status: 'compressed'|'skipped'|'error'|'already_compressed'; error?: string }` (:13-19) and `BatchResult { success: boolean; processed: number; compressed: number; skipped: number; errors: number; totalSavings: number; files: ProcessedFile[]; continuationToken?: string }` (:21-30).
- Inputs & outputs:
  - Data in: local state defaults `isDryRun=true`, `maxWidth=800`, `quality=70`, `minSizeKB=150`, `limit=50` (:33-38), edited via number inputs and a switch (:113-175).
  - Data out: `supabase.functions.invoke('batch-compress-images', { body: { bucket: 'inspection-photos', maxWidth, quality, minSizeKB, dryRun, limit } })` (:48-57); bucket name is hardcoded (:50). Response cast to `BatchResult` (:63). The invoked function's own request defaults mirror these values (`supabase/functions/batch-compress-images/index.ts:101-106`).
  - Stores touched: none directly — the storage-bucket mutation happens inside the F04 edge function when `dryRun=false`.
- Dependencies:
  - uses -> `@/components/ui/{card,button,input,label,switch,badge,progress}` (C01, :2-8); `@/integrations/supabase/client` (L19, :9); `sonner` (external, :10); `lucide-react` (external, :11); `react` (:1). The invoked edge function belongs to F04 edge-media-maintenance.
  - used by <- V02 admin-ops-and-template-views (`src/views/Settings.tsx:11`, rendered :334). Also imported by untracked duplicate `src/views/Settings 2.tsx:11`. (Grep-verified.)
- Side effects: one network call per button press to the F04 edge function (which, in live mode, overwrites storage objects); `toast.info` at start, `toast.success`/`toast.error` at end (:46, :66-68, :73); state mutations only otherwise.
- Error handling: `invoke` returning `error` → `throw new Error(error.message)` (:59-61); catch block logs `console.error` and shows `toast.error('Compression failed: ' + message)` with `'Unknown error'` fallback for non-Error throws (:71-74); `finally` clears `isRunning` (:74-76). No retry, no partial-result rendering on error (`result` stays `null`, :43).
- Tests: none found (grep-verified).
- Observed issues:
  - `Progress` is imported (:8) but never rendered.
  - `result.continuationToken` is only used to show the text "More files available. Run again to continue processing." (:247-251); the request body never sends a continuation token, so "run again" restarts from the function's own listing order (:49-56).
  - Number inputs constrain via HTML `min`/`max` attributes only; `onChange` applies `Number(e.target.value)` with no clamping, and an emptied field becomes `0` (:118-156).
  - The per-file size arrow `file.compressedSize && ...` suppresses the compressed size when it is `0` (:238).
- ASSUMED:
  - `functions.invoke` attaches the session's auth headers automatically (SDK behaviour; not verified here).
  - The edge function's response actually matches `BatchResult` (the cast at :63 is unchecked; response construction is F04's spec).

---

## src/components/settings/PDFTemplatePreview.tsx

- Purpose: Pure presentational strip of A4-aspect (`210/297`) mock pages — cover, optional table of contents, optional executive summary, enabled content sections, optional notes page — visualising a `ReportCustomization` with hardcoded sample data.
- Public surface:
  - `export const PDFTemplatePreview: React.FC<PDFTemplatePreviewProps>` (PDFTemplatePreview.tsx:20).
  - Props `PDFTemplatePreviewProps { customization: ReportCustomization; sections: ReportSection[]; reportType: string }` (:6-10); the types come from C04 (`src/components/pdf-editor/types.ts:19-61`).
  - Non-exported module const `ACCENT_COLORS: Record<string, { primary; light; text }>` with blue/green/orange/red/purple hex palettes (:12-18).
- Inputs & outputs: props in, JSX out. Sample placeholder values (`"Example Site Name"`, `"Client Company Ltd"`, `"REF-2026-0001"`, today's date via `format(new Date(), "dd MMMM yyyy")`) are generated on every render (:29-34). No stores, no network, no env vars.
- Dependencies:
  - uses -> `@/components/pdf-editor/types` (C04, :2); `date-fns` (external, :3); `cn` from `@/lib/utils` (L18, :4 — imported, never called); `react` (:1).
  - used by <- none found (grep-verified: zero hits for `PDFTemplatePreview` outside the file itself).
- Side effects: none.
- Error handling: unknown `customization.accentColor` falls back to the blue palette (:25). No other failure paths exist.
- Tests: none found (grep-verified).
- Observed issues:
  - Zero importers (grep-verified).
  - `reportType` prop is declared and destructured (:9, :23) but never referenced in the body.
  - `cn` is imported (:4) and never used (grep: no `cn(` call in the file).
  - When `includePageNumbers` is true, the cover page block (:40-81) renders no page number, the TOC hardcodes "1" (:107-111), and the "N pages" total at :278 counts the cover — so the printed labels run one behind the count that includes the cover.
  - All section content (table rows, KPI numbers 42/38/3/1, lorem-ipsum text, chart bar heights) is hardcoded sample data (:174-236).
- ASSUMED: none.

---

## src/components/settings/SANSReferenceTab.tsx

- Purpose: Fully static reference tab rendering hardcoded SANS 10142-1:2020 data — clause catalogues, COC types and hierarchy rules, test instruments, expiry guidelines, and automatic-failure "red flags" — in accordions, tables, and cards.
- Public surface:
  - `export function SANSReferenceTab({ className }: SANSReferenceTabProps): JSX.Element` (SANSReferenceTab.tsx:106); props `{ className?: string }` (:102-104).
  - Non-exported helpers: `ClauseCard({ clause, type })` (:416-452), `COCTypeCard({ coc })` (:455-491), `RedFlagItem({ title, description, clause })` (:494-517).
  - Non-exported module constants: `CLAUSE_REFERENCES` with `mandatory` (7 entries), `safety_critical` (4), `additional` (4) (:26-48); `COC_TYPES` (3 entries, :50-84); `TEST_INSTRUMENTS` (5, :86-92); `EXPIRY_GUIDELINES` (5, :94-100).
- Inputs & outputs: `className` in, JSX out. One outbound anchor to `https://www.sabs.co.za` with `target="_blank" rel="noopener noreferrer"` (:399-403). No stores, no network calls, no env vars.
- Dependencies:
  - uses -> `@/components/ui/{card,badge,accordion,scroll-area,separator,table}` (C01, :1-6); `lucide-react` (external, :7-22); `cn` from `@/lib/utils` (L18, :23 — used at :108, :424, :470).
  - used by <- none found (grep-verified: zero hits for `SANSReferenceTab` outside the file itself).
- Side effects: none.
- Error handling: none — no failure paths; `COCTypeCard.getTypeColor` has a `default: "bg-muted"` branch for unknown types (:465).
- Tests: none found (grep-verified).
- Observed issues:
  - Zero importers (grep-verified).
  - Unused imports: `CardDescription`, `CardHeader`, `CardTitle` (:1 — only `Card`/`CardContent` are rendered, :127-148, :389-390); `ScrollArea` (:4); `Zap`, `Scale`, `Users` from lucide (:8-17 — each name appears only in the import).
  - Regulatory thresholds (e.g. "≤ 5Ω", "≥ 0.25 MΩ", trip times) are hardcoded literals inside the component (:28-47, :348-382).
  - A separate SANS-related catalogue exists at `src/lib/siteCoc/sansRules.ts` (L01) keyed by A/B/C rule codes (`COC_SANS_RULES`, sansRules.ts:4-26); it shares no identifiers with this file's clause-numbered data — two unconnected SANS vocabularies in the codebase.
- ASSUMED:
  - Accuracy of the quoted SANS figures against the actual standard is not verified.
  - "Edition 3.1 (2020)" badge text (:121) matches the standard's real edition — not verified.
