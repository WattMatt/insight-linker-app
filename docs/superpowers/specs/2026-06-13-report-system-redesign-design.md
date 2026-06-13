# Report System Redesign — Design Spec

- **Date:** 2026-06-13
- **Status:** Approved (design); implementation pending plan
- **Branch:** `feat/report-system-redesign`
- **Owner:** Arno Mattheus

---

## 1. Context & problem

The reporting subsystem produces all client-facing compliance documents (inspection reports,
site summaries, COC/compliance, asset verification, floor plans, and several others). A deep
review (2026-06-13) found it **architecturally fragmented and silently lossy**. For a compliance
product where the PDF is legal evidence, the dominant failure class is not crashes — it is reports
that *look* complete and successful but are not.

### 1.1 Engine sprawl (current state)

Four live generation engines plus dead code:

| Engine | Renders | Offline | External dep |
|---|---|---|---|
| pdfmake (client) | site-summary, compliance, asset-verification, floor-plan | yes | none |
| WYSIWYG (html2canvas + jsPDF) | the **live** inspection report | yes | none |
| Browserless (`generate-inspection-pdf`) | bulk inspections tab | no | chrome.browserless.io (paid) |
| PDFShift cloud (`generate-pdf`) | site-drawing, fortress-checklist, calendar, inspection-template, final-report, + 2nd site-summary path | no | api.pdfshift.io (paid) |

Notable facts established during review:

- A **fully-built pdfmake inspection renderer already exists** (`pdfmakeInspectionReport.ts`) and is a
  **content superset** of the live WYSIWYG one (adds TOC + section breakdown), but it is **wired to nothing**.
- The template system is a **constrained, serializable config object** (`ReportCustomization`) that pdfmake
  already reads — there is **no free-form HTML/drag-drop layout** anywhere. Killing the HTML engines costs
  **zero customization capability**; the only loss is exact DOM-pixel fidelity.
- `site-drawing` and `inspection-template` are **not actually rendered server-side today** — they fall through
  to a near-empty `default` HTML. `final-report` **is** the `site-summary` report. Only `fortress-checklist`
  and `calendar` have real cloud builders.
- The cloud engines ship inspection data + photos to US third parties (PDFShift, Browserless) — a **POPIA /
  data-egress** concern.

### 1.2 The 12 confirmed issues (from review, re-verified against source)

| # | Sev | Issue | Location |
|---|---|---|---|
| 1 | Crit | Inspection sections taller than A4 are **squashed/distorted into one page** (no slicing). | `wysiwygPdfGenerator.ts:78,86` |
| 2 | Crit | `formatPdfDate`/`DateTime` print literal **"Invalid Date"**; missing date silently becomes *today*. | `pdfBranding.ts:337-358` |
| 3 | High | Site Summary **silently truncates** COC + inspection tables to 20 rows. | `SiteSummaryReport.tsx:464,491` |
| 4 | High | Inspection PDF renders header banner + "Page 1 of N" **on the cover**, shifting all pages by one. | `pdfmakeInspectionReport.ts:1486,1520` + `pdfEngine.ts:914-919` |
| 5 | High | **"Saved" reports that don't exist** — upload ok, DB insert fails → `console.warn` + `success:true` → orphan blob. | `pdfmakeInspectionReport.ts:1633-1637` |
| 6 | High | `downloadBlob` **toasts success even when nothing downloaded** (`window.open` can't throw on popup-block); documented 3-tier fallback never runs. | `fileDownload.ts:128-191` |
| 7 | High | **No list pagination** — `inspections`/`clients`/`profiles` fetched whole + full DOM render. | `Inspections.tsx:81`, `Clients.tsx:73`, `Users.tsx:202` |
| 8 | High | **Date locale inconsistent** — en-GB day-first in generators, bare `toLocaleDateString()` (host locale) + date-fns US `MMM d, yyyy` elsewhere. | `complianceReportGenerator.ts:179`, `SiteReports.tsx:336`, others |
| 9 | Med | **Object-URL leak** per report — engine `previewUrl` created, never revoked. | `pdfEngine.ts:951` + `SiteSummaryReport.tsx:729` |
| 10 | Med | **`NaN%`** in compliance summary on empty dataset (unguarded division). | `complianceReportGenerator.ts:152-155` |
| 11 | Med | **UTC filename** can be one day behind the in-document local date. | `documentDesignStandards.ts:404` |
| 12 | Low | **`mmToPt(50)` margin unit confusion** (~141pt vs intended 50pt). | `pdfMakeConfig.ts:60` |

---

## 2. Decision

**Consolidate all report generation onto a single client-side pdfmake engine.** Delete the WYSIWYG,
Browserless, and PDFShift engines and all dead PDF edge functions. Wire the existing pdfmake inspection
renderer; build/port the remaining report types to pdfmake.

### 2.1 Drivers

- **Online-only is accepted** — report generation does not need to work offline (confirmed with owner),
  so pdfmake is not strictly forced, but the other factors make it the most robust choice.
- **Testability** — pdfmake's input is a plain `docDefinition` object; report builders become pure functions
  we can unit-test deterministically without rendering. This is the single biggest robustness lever.
- **Zero external dependency / cost / vendor risk** — removes the "API key/quota lapse silently kills prod"
  failure mode entirely.
- **Zero data egress** — POPIA-clean; inspection data + photos never leave the client.
- **The hard layouts are already proven in pdfmake** — floor-plan and the full inspection report already
  render in pdfmake; the per-report scoping found **no hard blockers**.

### 2.2 Alternatives considered

- **B — All-in self-hosted HTML→PDF (Chromium/Puppeteer rendering React).** Pixel-perfect and reuses
  React components, but harder to verify (golden/visual snapshots, flakier), adds serverless infra, and
  keeps a network dependency. Rejected: testability and self-containment outrank pixel fidelity for a
  compliance document.
- **C — Deliberate two-tier (pdfmake + one HTML engine).** Least porting, but two engines and two test
  strategies forever — a permanent half-measure. Rejected on "nothing left on the table."

---

## 3. Target architecture — six thin layers

| Layer | Responsibility | Files (new / refactored) |
|---|---|---|
| **Data** | `gather<Type>Data()` async — fetch + aggregate from Supabase → typed plain object | existing generators, cleaned |
| **Image prep** | `resolveImages(data)` — load *all* images to dataURLs up front, track success/failure explicitly | new `reportImages.ts` (replaces scattered loaders + the dead `embedAllImages`) |
| **Builder (pure)** | `build<Type>ReportDoc(data, template, branding) → TDocumentDefinitions` — synchronous, deterministic | one per report type |
| **Kernel** | cover / header / footer (correct page math), tables (auto-flow), photo grid, KPI, status-color, **guarded formatters** | new `reportKernel.ts` (absorbs `pdfMakeUtils` + `pdfBranding` formatting) |
| **Output** | `renderToBlob()` (validates non-empty) · `saveReport()` (fail-closed, deletes orphan on DB failure) · `downloadReport()` (real fallback chain + success detection) | refactored `pdfMakeConfig`, `pdfDocumentSaver`, `fileDownload` |
| **Orchestrator** | `generateReport(type, params)`: gather → resolveImages → build → render → save/download; owns object-URL lifecycle | refactored `pdfEngine.ts` |

### 3.1 Principles

- **One engine, one pipeline.** No html2canvas, no Browserless, no PDFShift.
- **Builders are pure functions** — the seam that makes PDFs unit-testable (assert on the document object, not pixels).
- **Fail-closed.** "Saved" and "Downloaded" must be true or the call throws. No false success, no orphan blobs.
- **No silent loss.** No row caps, no swallowed image/save errors, guarded dates and divisions. A degraded report is reported as degraded.
- **The template gateway is genuinely mandatory** — every builder receives a resolved `ReportCustomization`; bypassing it becomes impossible.

---

## 4. Issue → fix mapping (nothing left on the table)

| # | Fix | Layer |
|---|---|---|
| 1 | WYSIWYG **deleted**; inspection uses pdfmake builder (auto-paginates) | Builder |
| 2 | `formatDate()` with `isNaN` guard → `"—"`; remove missing→today | Kernel |
| 3 | Remove the 20-row cap; tables auto-flow across pages | Kernel/Builder |
| 4 | Cover via engine `coverPage` option; skip-first-page math correct | Kernel |
| 5 | `saveReport` deletes the blob + throws on DB-insert failure | Output |
| 6 | Real FS-Access → anchor → window.open chain with success detection | Output |
| 7 | Server-side `range()`/count pagination + reusable hook + wired control | (Phase 5) |
| 8 | One `formatDate`/`formatDateTime` (en-ZA, day-first) everywhere; ban bare `toLocaleDateString` | Kernel |
| 9 | Orchestrator owns a single create + revoke of the object URL | Orchestrator |
| 10 | `percent(n, d)` guards `d === 0` | Kernel |
| 11 | `localDateStamp()` (local tz) for filenames | Kernel |
| 12 | Correct pt value; derive header/footer bands from element heights | Kernel |

Plus deletions (see §7).

---

## 5. Verification strategy

- **Tier 1 — unit tests (primary, CI).** Builders are pure → assert on the docDefinition tree. Prove each fix:
  21 rows in → 21 rows out (no cap); `""`/`"garbage"` date → `"—"`; 0-total → `"0%"`; skip-cover page math;
  section toggles honored; every status maps to a color.
- **Tier 2 — golden fixtures.** Representative `data` fixtures (empty / typical / 100-photo / missing-fields)
  → render → extract text via `pdfjs-dist` (already a dependency) → snapshot text + page count. Catches
  content & pagination regressions.
- **Tier 3 — visual smoke.** A dev script renders every report type from fixtures to a folder for a manual
  eyeball pre-release. Documented, not automated.
- **Error-path tests.** DB-save failure → blob deleted + throws; image-load failure → result carries warnings,
  not silence.

Test runner: **vitest** (`npm test` → `vitest run`), jsdom env, already configured.

---

## 6. Phasing (one PR per phase; each ships with tests green)

- **Phase 0 — Kernel + test harness.** Build `reportKernel.ts` with guarded formatters, correct page math,
  auto-flow tables; stand up the vitest report test suite. Fixes **#2, #3, #8, #10, #11, #12** at the root,
  locked with tests. *Exit:* kernel unit tests green; the 4 classic pdfmake reports still generate.
- **Phase 1 — Output layer.** Fail-closed `saveReport`, real `downloadReport`, orchestrator URL lifecycle.
  Fixes **#5, #6, #9**. *Exit:* error-path tests green (orphan deleted on DB failure; no false success).
- **Phase 2 — Inspection → pdfmake.** Wire the existing pdfmake renderer to the live buttons
  (`ComprehensiveInspectionReport`, bulk); fix cover header/footer (**#4**); image-prep replaces dead embed.
  **Side-by-side checkpoint:** render WYSIWYG vs pdfmake for a real inspection and get owner sign-off
  *before* deleting WYSIWYG (output will look different — more consistent, but different). Fixes **#1, #4**.
  *Exit:* owner approves the pdfmake inspection output; WYSIWYG components deleted.
- **Phase 3 — Port the 5 reports.** fortress-checklist (S), calendar (S), inspection-template (S),
  site-drawing (M — clone floor-plan + Fabric `canvas.toDataURL` hand-off), final-report (re-point to
  site-summary). Each with a builder + unit tests. *Exit:* all five generate via pdfmake with tests.
- **Phase 4 — Delete cloud engines.** Remove `generate-pdf` / `generate-inspection-pdf` / dead edge fns,
  PDFShift + Browserless keys/config, `useUnifiedPdfGeneration` / `useServerPdfGeneration`. *Exit:* zero
  importers of removed code; build green.
- **Phase 5 — List pagination.** Server-side pagination for inspections / clients / users + reusable hook
  + wired control. Fixes **#7**. *Exit:* lists fetch bounded pages; pagination tests green.
- **Phase 6 — Cleanup + guardrails.** Make gateway-bypass impossible (lint/assert), fix stale naming
  (`pdfshiftInspectionReport`), final dead-code sweep, remove `react-pdf` only if unused for generation
  (it is retained for viewing). *Exit:* no dead report code remains; gateway enforced.

---

## 7. Dead code to delete (inventory)

**Client files:** `wysiwygPdfGenerator.ts` + WYSIWYG components (`InspectionReportPreview.tsx`, `SectionPage.tsx`,
`CoverPage.tsx`, `QualityDashboard.tsx`, `SnagSection.tsx`, `TenantSection.tsx`, `SignaturePage.tsx`),
`pdfshiftInspectionReport.ts`, `TemplateBasedReport.tsx`, `inspectionReportGenerator.ts` (dead dispatcher),
`useUnifiedPdfGeneration.ts`, `useServerPdfGeneration.ts`.

**Edge functions (0 client invocations):** `generate-pdf`, `generate-inspection-pdf`, `generate-pdf-browserless`,
`generate-pdf-google`, `generate-pdf-pdfmake`, `generate-docx-report`, `save-template`, `template-sync`, `templates`.
(`detect-schematic-regions` flagged separately — unrelated to PDF; confirm before removing.)

**Config:** `BROWSERLESS_API_KEY`, PDFShift token/secrets.

Each deletion is verified by grep (zero importers) before removal, within its phase.

---

## 8. Out of scope / risks

- **Out of scope:** redesigning report *content/layout* beyond fixing the listed defects; offline report
  generation (explicitly deferred — online-only accepted); changing the template-customization feature set.
- **Risk — inspection visual change.** Switching WYSIWYG → pdfmake changes the inspection report's look.
  Mitigated by the Phase-2 side-by-side sign-off gate.
- **Risk — large photo reports in the browser.** Client-side generation of 100+ photo reports is memory-heavy.
  Mitigated by image-prep with explicit limits/warnings and a golden 100-photo fixture in Tier 2.
- **Risk — `generate-pdf` is very recent.** Deleting it reverses recent work; accepted as part of the
  consolidation decision.
