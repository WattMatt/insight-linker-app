# C17 — single-file-subdirs

- Unit id: C17
- Slug: single-file-subdirs
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 4 (src/components/{coc,dashboard,pdf-preview,templates} — one file per subdirectory)

## Unit header

**Unit purpose.** Four presentational React components, each the sole occupant of its own `src/components` subdirectory (`coc/`, `dashboard/`, `pdf-preview/`, `templates/`), grouped as an addendum unit after the original slice partition of `src/components` missed them (review/inventory/15-src-components-missed-addendum.md:3-11). Each serves a different feature area: the COC certificate register UI inside the subsection COC tab, the dashboard "sites needing attention" triage card, a React (DOM) twin of the PDF subsection card spec, and a mock multi-page template preview.

**Module-level observations.** No file in the unit imports any other file in the unit. All four are render-only: data arrives via props, mutations leave via caller-supplied callbacks; none imports supabase, touches localStorage/IndexedDB, or issues its own network request (the only async side effect is SubsectionCard delegating QR generation to L15, src/components/pdf-preview/SubsectionCard.tsx:32). None of the four has any test coverage (grep for the component names across `*.test.*`/`*.spec.*` under src returns nothing). Consumer fan-in is one importer each for three files and zero for the fourth: CocCertificateList ← V07, SitesNeedingAttention ← V01, TemplatePreviewRenderer ← V02, SubsectionCard/SubsectionGrid ← none found (grep-verified; the `SubsectionGrid` string hit in src/components/SiteSummaryReport.tsx:410 is `renderSubsectionGrid` from L15 `src/lib/pdfSubsectionRenderer.ts:418`, a different function).

**External contract.** The rest of the app gets five exported components: `CocCertificateList` (per-COC certificate rows with actions and evaluation-report upload), `SitesNeedingAttention` (clickable triage list card), `SubsectionCard` and `SubsectionGrid` (DOM rendering of `SubsectionCardData` — currently unconsumed), and `TemplatePreviewRenderer` (named + default export; hardcoded-mock A4-page preview of an inspection template).

---

## src/components/coc/CocCertificateList.tsx

- Purpose: Renders a subsection's COC documents as an Initial certificate with indented supplementaries, each row showing type/status badges, preview/download/delete actions, and either the linked evaluation report (with the same actions) or an inline file input to upload one.
- Public surface:
  - `export function CocCertificateList(p: Props)` (line 93). `Props` (lines 7–16): `cocDocuments: SupabaseDocument[]`, `evaluationDocuments: SupabaseDocument[]`, `deletingDocumentId: string | null`, `uploadingFile: boolean`, `setPreviewDocument: (doc: { file_name: string; file_url: string } | null) => void`, `handleDownloadDocument: (url: string, fileName: string) => void`, `setDeleteDocumentId: (id: string | null) => void`, `onUploadEvaluationReport: (parentCoc: { id: string; coc_number: string | null }, file: File) => Promise<void>`.
  - Unexported internals: `today()` (line 18), `StatusBadge` (line 20), `DocActions` (line 26), `CocRow` (line 38).
- Inputs & outputs: In — already-fetched `SupabaseDocument` rows (type from src/views/subsection-detail/types.ts:35–47) plus UI-state flags. Out — JSX; empty-state paragraph when `cocDocuments` is empty (lines 95–97). No tables, buckets, storage keys, or env vars touched; all mutations delegated to the caller via the four callbacks.
- Dependencies:
  - uses -> `@/components/ui/button`, `@/components/ui/badge` (C01, lines 1–2); `lucide-react` (external, line 3); `toCocDoc`, `groupCocDocuments`, `CocDoc` from `@/lib/cocHierarchy` (L09, line 4); type-only `SupabaseDocument` from `@/views/subsection-detail/types` (V07, line 5).
  - used by <- V06 site-coc-tab? No — grep resolves the sole importer to src/views/subsection-detail/CocMeteringTab.tsx:11,114, which is manifest unit **V07 subsection-detail-module** (grep-verified).
- Side effects: None on render. The hidden file input's `onChange` (lines 80–84) awaits `onUploadEvaluationReport` and then resets `e.target.value = ""` so the same file can be re-picked; accepted extensions `.html,.htm,.pdf,.doc,.docx,.jpg,.jpeg,.png` (line 78), input disabled while `uploadingFile` (line 79).
- Error handling: None in this file. `await p.onUploadEvaluationReport(...)` (line 82) has no try/catch — a rejected promise from the callback surfaces as an unhandled rejection from the event handler; the input value reset on line 83 still runs only after a successful await (it is inside the same handler, after the await, so it is skipped on rejection). Missing raw rows would make the non-null assertions on lines 102/105 throw (see Observed issues).
- Tests: None found (grep for `CocCertificateList` in `*.test.*`/`*.spec.*` under src: no hits).
- Observed issues:
  - `toCocDoc` conversion runs twice per document: once for the whole list to build the group (line 94/98) and again per row inside `CocRow` (line 39).
  - `rawById.get(group.initial.id)!` and `rawById.get(s.id)!` (lines 102, 105) use non-null assertions; correctness depends on `groupCocDocuments` only returning ids present in the same input array.
  - `today()` (line 18) is computed and passed to `groupCocDocuments` (line 98), but per src/lib/cocHierarchy.ts:47–55 the `today` parameter is documented as no longer affecting the result ("kept for call-site stability").
  - Evaluation-report pairing takes the *first* `evaluationDocuments` entry whose `parent_document_id` matches (line 45); any additional evaluation docs for the same COC are not rendered.
  - The `Pending` status renders as "Awaiting verification" (line 23), a label distinct from the `Pending` vocabulary in L09.
- ASSUMED: The empty-state text "Upload one below" (line 96) refers to the upload block that the consumer (CocMeteringTab.tsx:126ff) renders beneath this component — inferred from the call site, not from this file.

## src/components/dashboard/SitesNeedingAttention.tsx

- Purpose: Dashboard card that lists up to `limit` sites having outstanding deliverables, each row a full-width button showing a band-colored dot, site name, blocking-issue badge, outstanding count, and completion percentage, invoking `onSelectSite` on click.
- Public surface: `export function SitesNeedingAttention({ rows, onSelectSite, limit = 6 }: Props)` (line 18). `Props` (lines 12–16): `rows: SiteTriageRow[]`, `onSelectSite: (siteId: string) => void`, `limit?: number` (default 6). Unexported internal: `BAND_DOT` color map (lines 6–10, `satisfies Record<SiteTriageRow['band'], string>`).
- Inputs & outputs: In — `SiteTriageRow[]` (shape at src/lib/siteDeliverables.ts:88–96: `siteId`, `siteName`, `band: 'success'|'warning'|'danger'`, `blockingCount`, `outstandingCount`, `completionPct`, `byCategory`). Out — JSX; rows filtered to `outstandingCount > 0` then `.slice(0, limit)` (line 19); empty-state text "No outstanding work across sites." (line 29). No stores touched.
- Dependencies:
  - uses -> `@/components/ui/card`, `@/components/ui/badge` (C01, lines 1–2); `lucide-react` (line 3); type-only `SiteTriageRow` from `@/lib/siteDeliverables` (L17, line 4).
  - used by <- V01 admin-entity-views: src/views/Dashboard.tsx:12,375 (grep-verified; Dashboard passes `triageRows` and navigates to a client-scoped or plain site route in `onSelectSite`, Dashboard.tsx:375–381). No other importers.
- Side effects: None; the only interaction is the per-row `onClick` calling back with `r.siteId` (line 36).
- Error handling: None. `BAND_DOT[r.band]` (line 40) is total over the declared band union; there is no runtime fallback for an out-of-union value.
- Tests: None found (grep-verified).
- Observed issues: The `CardDescription` reads "Ranked by blocking issues, then outstanding work" (line 25), but the component performs no sorting — only filter + slice (line 19); any ranking must already exist in the `rows` prop supplied by the caller.
- ASSUMED: The ranking described on line 25 is implemented upstream in L17 (`summarizeSitesForTriage`, src/lib/siteDeliverables.ts:326) — inferred from the data flow, not verified in this unit.

## src/components/pdf-preview/SubsectionCard.tsx

- Purpose: Renders a subsection compliance card in the DOM (header, COC status/number, metering line, QR code, snags list, compliance footer) using the shared `SubsectionCardSpec` constants so the layout mirrors the pdfmake output, plus a stacked full-width grid wrapper.
- Public surface:
  - `export function SubsectionCard({ data, accentColor = '#3b82f6', logoUrl }: SubsectionCardProps)` (line 27); `SubsectionCardProps` (lines 21–25): `data: SubsectionCardData`, `accentColor?: string`, `logoUrl?: string | null`.
  - `export function SubsectionGrid({ subsections, accentColor, logoUrl }: SubsectionGridProps)` (line 298); `SubsectionGridProps` (lines 292–296): `subsections: SubsectionCardData[]`, `accentColor?: string`, `logoUrl?: string | null`.
  - Unexported internals: `StatusBadge` (line 202), `getStatusIcon` (line 218), `SnagsSection` (line 231).
- Inputs & outputs: In — `SubsectionCardData` (src/lib/subsectionCardSpec.ts:18–31, extends `SubsectionData`; fields consumed here: `qrCodeUrl`, `cocStatus`, `cocNumber`, `isCompliant`, `name`, `tenantName`, `category`, `meteringStatus`, `meterSerialNumber`, `ctRatio`, `snags`, `id`). Out — JSX; local state `qrCodeDataUrl: string | null` (line 28) holds the generated QR data-URL. Layout numbers come from `CARD_LAYOUT` (qrCodeSize 90, labelSize 9, maxSnagsShown 3, etc. — src/lib/subsectionCardSpec.ts:37–64). No tables/buckets/storage keys.
- Dependencies:
  - uses -> `react` (line 8); `SubsectionCardData`, `SnagData`, `CARD_LAYOUT`, `STATUS_COLORS`, `RISK_COLORS`, `getCocStatusLabel`, `getComplianceLabel`, `generateSubsectionQRCode` from `@/lib/subsectionCardSpec` (L15, lines 9–18); `lucide-react` (line 19).
  - used by <- none found (grep-verified): no file imports `components/pdf-preview`; the `SubsectionGrid` text matches in src/components/SiteSummaryReport.tsx:49,410 are `renderSubsectionGrid` imported from `@/lib/pdfSubsectionRenderer` (L15), a distinct pdfmake-side function.
- Side effects: `useEffect` (lines 30–36) fires whenever `data.qrCodeUrl` or `logoUrl` changes and invokes the async L15 `generateSubsectionQRCode(url, logoUrl): Promise<string>` (src/lib/subsectionCardSpec.ts:90–93, backed by a module-level cache), then stores the result in state.
- Error handling: QR generation failure is `.catch(console.error)` (line 34); the card then keeps showing the dashed "No QR" placeholder (lines 150–159). Unrecognized `cocStatus` strings normalize to `'pending'` (lines 39–43) with `STATUS_COLORS.pending` as an additional `||` fallback (line 43); `isCompliant === null/undefined` gets inline gray colors (line 48); unknown snag `riskLevel` falls back to `RISK_COLORS.low` (line 262).
- Tests: None found (grep-verified).
- Observed issues:
  - `accentColor` is accepted with a default (line 27) and threaded through `SubsectionGrid` (line 305) but never referenced anywhere in `SubsectionCard`'s render output (grep hits only at lines 23, 27, 294, 298, 305).
  - Zero importers for both exports (grep-verified), despite the header comment "Renders subsection cards in the template preview" (lines 1–6).
  - The COC-status normalization list (`['approved','valid','pass']` / `['rejected','invalid','fail','failed']`, lines 40–41) duplicates, with a slightly different word set, L09's `normalizeCocDocStatus` (src/lib/cocHierarchy.ts:39–44, which lacks `'invalid'`).
  - The footer uses `mt-auto` (line 170) but the card's root div (lines 51–58) declares no flex/grid display, so `mt-auto` resolves to zero in block layout; the "Fixed at bottom" comment (line 169) describes intent, not the produced layout.
- ASSUMED: This component is the React twin of L15's `pdfSubsectionRenderer.ts` (same spec imports, same default accent `'#3b82f6'`) — pairing inferred from comments and imports, not from any shared registration.

## src/components/templates/TemplatePreviewRenderer.tsx

- Purpose: Renders a client-side mock preview of an inspection template as a stack of A4-aspect (`aspect-[210/297]`) "pages" — cover page, general-information page with category summary and test-results table, one page per template section with mock field values, and an optional tenants table page — populated entirely from hardcoded category-specific sample data.
- Public surface:
  - `export const TemplatePreviewRenderer: React.FC<TemplatePreviewRendererProps>` (line 407) and `export default TemplatePreviewRenderer` (line 593). Props (lines 45–47): `template: InspectionTemplate`.
  - Local (unexported) interfaces: `TemplateSection` (lines 5–16: `id`, `name`, `order_index`, `items?` with `id/name/type/required/options?`), `Tenant` (lines 18–26), `InspectionTemplate` (lines 28–43: `id`, `name`, `category`, `description`, `sections_count`, `pages_count`, `sections?`, `tenants?`, `cover_page?` with `title/subtitle/company_name/logo_url?`).
  - Module-level helpers: `getMockDataForCategory(category, templateName)` (line 50), `renderField(item, category, index)` (line 160), `renderCategorySummary(category, mockData)` (line 287), `renderTestResults(category, mockData)` (line 377), `getCategoryColor` (inside the component, line 411).
- Inputs & outputs: In — a structurally-typed template object. Out — JSX only. All displayed values other than template name/category/sections/tenants/cover_page fields are hardcoded mock data per category (`Medium Voltage`, `Low Voltage`, `Generator`, `Solar`, `Progress`, `Site Drawing`, default; lines 61–156) including fixed names ("Evaton Mall", "John Smith", fallback company "Watson Mattheus", line 465). `new Date()` at line 58 makes the mock report date the render date. No stores, no env vars.
- Dependencies:
  - uses -> `react` (line 1); `@/components/ui/badge` (C01, line 2); `templateSupportsTenants` from `@/lib/templateTenants` (L18, line 3 — returns true iff the template name contains "main board", src/lib/templateTenants.ts:13–17).
  - used by <- V02 admin-ops-and-template-views: src/views/InspectionTemplates.tsx:16,657 (rendered inside the preview dialog when `previewTemplate` is set). Additionally the untracked working-copy duplicate `src/views/InspectionTemplates 2.tsx`:16,655 imports it (file is not in `git ls-files`, hence outside the manifest's 936 tracked files). No other importers (grep-verified).
- Side effects: None — pure render from props plus module constants; no network, no subscriptions, no events.
- Error handling: None explicit. Unknown categories fall through to the `'General'` mock set (line 179) and default accent color (line 421); unknown field `type` renders "Field type: {type}" (lines 277–283); absent/empty `sections` renders a "No Sections Defined" page (lines 538–545); sections with no items render "No fields defined for this section" (lines 526–530); the tenants page renders only when `templateSupportsTenants(template)` and `tenants.length > 0` (line 548), showing at most 10 rows with a "Showing 10 of N tenants" note beyond that (lines 565, 577–581).
- Tests: None found (grep-verified).
- Observed issues:
  - The `templateName` parameter of `getMockDataForCategory` (line 50) is never used in the function body (grep: single occurrence in the file).
  - The test-results table renders a hardcoded "PASS" badge for every row regardless of the mock result value (line 397).
  - `cover_page.title` and `cover_page.logo_url` are declared in the local interface (lines 38, 41) but never read — only `subtitle` (line 448) and `company_name` (line 465) are used; the cover title is always `template.name` (line 445).
  - The template's entity shape is redeclared locally (lines 5–43) rather than imported from a shared types module; the prop is matched structurally by the V02 caller.
- ASSUMED: The category strings switched on (lines 61–148, 171–177, 288–370, 412–420) match the categories the template editor actually stores — not verified inside this unit.
