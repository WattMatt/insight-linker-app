# PDF Engine Convergence Plan

**Date:** 2026-06-20
**Status:** Proposed (no code yet — Phase 5 of the investigation protocol)
**Scope:** PDF report generation across the Next.js app
**Verdict adopted:** Weak-form convergence. Reject routing the COC report through the shared template gateway; extract the genuinely-shared, low-blast-radius pieces and codify a convention.

---

## 1. Context & the two-systems problem

The app has **two coexisting PDF lineages** that have drifted apart, plus a **third, cleaner fork** (COC) that bypasses both.

### 1a. The shared "template-gateway" system

Most reports funnel through a pdfmake stack rooted at `src/lib/pdfEngine.ts` (`generateReport()`, line 809) and the helper libraries around it. Section visibility, accent colour and cover customization come from a DB-backed gateway:

- `src/hooks/usePDFTemplateGateway.ts` — `fetchPDFTemplate(reportType)` (line 350) and the `usePDFTemplateGateway` hook (line 223). `TemplateReportType` (lines 20–27) is the closed set `site_summary | inspection | floor_plan | asset_verification | compliance | coc_validation | comprehensive_inspection`.
- `src/lib/pdfMakeUtils.ts` — current helper library: `createCoverPage` (96), `createPageHeader` (418), `createPageFooter` (452), `createKpiRow` (**675 — the only definition**), `createProgressBar` (334, canvas), etc.
- `src/lib/pdfTemplates.ts` — **legacy** parallel library: `createKpiDashboard` (295), `createProgressBar` (334, canvas), plus its own cover/header/footer.
- `src/lib/pdfMakeConfig.ts`, `src/lib/pdfBranding.ts`, `src/lib/documentDesignStandards.ts` — config, branding I/O, filename/ref-number conventions.

**The dual-library divergence is real and measured:**

| Helper | Defined in | Consumers |
| --- | --- | --- |
| `createKpiRow` | `pdfMakeUtils.ts:675` | 7 — `SiteSummaryReport.tsx`, `calendarReportGenerator.ts`, `floorPlanReportGenerator.ts`, `pdfMakeUtils.ts`, `fortressChecklistReportGenerator.ts`, `complianceReportGenerator.ts`, `pdfEngine.ts` |
| `createKpiDashboard` | `pdfTemplates.ts:295` (legacy) | 3 — `complianceReportGenerator.ts`, `pdfTemplates.ts`, `assetVerificationReportGenerator.ts` |
| `createProgressBar` (canvas) | `pdfTemplates.ts:334` **and** `pdfEngine.ts:394` | **0 live call sites** (only an unused `import` in `assetVerificationReportGenerator.ts:36`) |

The **Asset Verification report** (`src/lib/assetVerificationReportGenerator.ts`, ~417 lines, just cleaned) sits on the **legacy `pdfTemplates.ts` branch**: it imports `createKpiDashboard`, `createProgressBar`, `createCoverPage` etc. from `pdfTemplates`. `SiteSummaryReport` and the calendar/floor-plan/fortress-checklist generators sit on the **current `pdfMakeUtils.ts` branch**. So the two flagship reports are not "one framework" — they are on two divergent shared-helper branches.

### 1b. The COC fork (best-engineered, intentionally separate)

The Site COC report is a clean **model/render split** that bypasses `pdfEngine.generateReport()` and `fetchPDFTemplate()` entirely:

- `src/lib/siteCoc/cocReportModel.ts` — `buildCocReportModel(input)` (line 66), a **pure** function producing an immutable typed `CocReportModel`. No I/O, no rendering.
- `src/lib/siteCoc/siteCocReport.ts` — `buildSiteCocReportDocDef(model, logoDataUrl?)` (line 132). All layout lives here. **Landscape** (line 252) to fit the 8-col schedule, 12+-col SANS verification, and 9-col file-register tables. Footer pagination (255–261). Smart `pageBreakBefore` (264–265) that only breaks on `headlineLevel === 1` when prior content already sits on the page.
- `src/lib/siteCoc/statusDisplay.ts` — pure `Tone` mappers (`scheduleStatusTone`, `verdictTone`, `ruleTone`).
- `src/lib/siteCoc/reportKpis.ts` — `buildSiteKpiBlock` over shared `kpiMetrics` helpers.

The COC renderer carries the only **pdf.js-safe bar/card techniques in the codebase**, all built as **nested TABLES, never canvases**, with explanatory comments on why (siteCocReport.ts lines 90–92, 110–111, 167–169):
- `miniBar(pct, color, w, track)` (94–98) — 2-cell table progress bar.
- `verdictBar(v, W)` (99–108) — multi-segment stacked-table bar.
- `gaugeBar(pct, color)` (112–120) — wide 2-cell cover gauge.
- `cardCell` / `card` (185–196) — tinted KPI cards: nested accent-bar table + content stack + optional `miniBar`.

### The problem

Three lineages, overlapping helpers, no single source of truth for "draw a bar" or "map a status to a colour". The COC fork proves out the most reliable techniques but they are trapped inside `siteCoc/`. Meanwhile the shared system still ships a **dead canvas `createProgressBar`** (twice) that nobody calls, and a **legacy/current library split** that new work randomly lands on either side of.

---

## 2. Scope decision — what to converge vs leave alone

Adopt the **weak form** of the convergence thesis. The strong form (route both reports through `fetchPDFTemplate`) is rejected on evidence.

### CONVERGE (do)

1. **Extract a shared, canvas-free bar/card utility** (`src/lib/pdfBars.ts`) lifted from COC's `miniBar` / `verdictBar` / `gaugeBar` (and the tinted `cardCell`/`card` pattern). These are self-contained table builders with no `siteCoc/` coupling beyond the `Tone` type.
2. **Extract the semantic-status (`Tone`) convention** into a shared module so non-COC reports can colour cells/bars consistently instead of hand-rolling hex per call site.
3. **Adopt COC's model/render split as a documented CONVENTION** that other generators follow *when they are next rewritten* — not a forced refactor now.
4. **Collapse the legacy `pdfTemplates.ts` vs current `pdfMakeUtils.ts` duplication** — this is the *real* divergence and is a **prerequisite**: converging onto a still-dual base is illusory. Smallest first move: point the Asset Verification report at the surviving lineage and delete the dead canvas `createProgressBar`.

### LEAVE ALONE (do not touch)

- **COC's bypass of `fetchPDFTemplate`.** There is **no `site_coc` in `TemplateReportType`** (usePDFTemplateGateway.ts 20–27) and **no DB template row / `DEFAULT_TEMPLATES` entry** for it. Its SANS verification table (`verificationContent`, siteCocReport.ts 39–68) is a fixed bespoke 2-header-row layout keyed off `COC_SANS_RULES` groups A/B/C — section-toggle/accent-colour customization has nothing to drive. Forcing it through the gateway adds a config surface with nothing to configure.
- **COC's landscape orientation + self-contained cover.** The shared `createCoverPage` accent bars and `CONTENT_WIDTH_PT` are tuned to A4 **portrait** (`pdfMakeConfig.ts` `PAGE_CONFIG.pageOrientation: 'portrait'`, `A4_WIDTH_PT 595.28`); COC's cover rect is a 760pt landscape-tuned bar (siteCocReport.ts 145). Routing COC through the shared cover would break its layout. Landscape is load-bearing, not drift.
- **COC's model/render split internals.** Keep `buildCocReportModel` / `buildSiteCocReportDocDef` **pure and free of branding I/O**. The extraction must not pull `loadCompanyBranding` side-effects into the model layer.
- **The existing `createKpiRow` (7 consumers) and `createKpiDashboard` (3 consumers) signatures.** Do **not** widen them to accommodate COC's richer nested-card shape — that forces edits across all 10 consumers for one caller's benefit. **Add** a new function; never widen an existing one.

### Why (mapped to verification risks)

- **Don't gateway COC** — high-severity risk: no `site_coc` type, no DB row, bespoke non-toggleable SANS layout.
- **Don't sell table-bars as a pdf.js bugfix for the shared path** — the only canvas bar (`createProgressBar`) is **dead**, and Asset Verification already emits no canvas (it was "simplified to avoid canvas issues", assetVerificationReportGenerator.ts:161). The win is *consolidation + reuse for future reports* (e.g. the Fortress Asset Register), not a fix.
- **Don't widen shared KPI helpers** — med-severity shared-mutable regression across 7/3 consumers.
- **Collapse the dual library first** — adding COC patterns on top of an unresolved `pdfTemplates.ts`/`pdfMakeUtils.ts` split is net-negative.

---

## 3. Concrete steps (ordered, smallest high-value first)

> Each step is independently shippable and independently verifiable. Do **not** reorder: Step 1 is a prerequisite for an honest "shared" layer.

### Step 1 — Collapse the legacy/current library divergence (prerequisite)

**Goal:** one KPI/bar lineage, dead canvas code gone.

- In `src/lib/assetVerificationReportGenerator.ts`:
  - Remove the unused `createProgressBar` import (line 36). It is imported and never called — zero live call sites confirmed across `src/`.
  - Decide the KPI lineage: it currently uses `createKpiDashboard` from legacy `pdfTemplates.ts`. Either (a) leave on `pdfTemplates` for now and only delete dead code, or (b) migrate its KPI block to the current `pdfMakeUtils.ts` `createKpiRow` lineage. **Recommended: (a) for this step** — keep the Asset Verification refactor minimal; lineage migration is its own change with its own visual diff to verify.
- Delete the **dead canvas `createProgressBar`** definitions: `src/lib/pdfTemplates.ts:334` and `src/lib/pdfEngine.ts:394`. Both have **0 call sites**. Confirm with `grep -rn "createProgressBar" src/` returning only the definitions before deleting.

**What stays untouched:** `createKpiRow` (pdfMakeUtils.ts:675) and `createKpiDashboard` (pdfTemplates.ts:295) signatures and bodies — only the dead progress-bar functions and the dead import are removed.

**Blast radius:** near-zero. Removing functions with no call sites cannot break consumers. Asset Verification is the only file touched for the import removal; tsc must stay clean.

### Step 2 — Extract a shared, canvas-free bar/card utility: `src/lib/pdfBars.ts`

**Goal:** one home for pdf.js-safe table-bars, reusable by future reports (Fortress Asset Register first in line).

- Create `src/lib/pdfBars.ts` exporting pure functions lifted (copy-then-generalize, do not mutate COC yet) from `siteCocReport.ts`:
  - `miniBar(pct, color, opts?: { width?, track? }): Content` (from 94–98)
  - `segmentedBar(segments: { value: number; color: string }[], opts?: { width?, height? }): Content` (generalized from `verdictBar` 99–108, so it is not COC-verdict-specific)
  - `gaugeBar(pct, color, opts?: { width?, height? }): Content` (from 112–120)
  - `tintedKpiCard({ label, value, sub, tone, barPct? }): Content` (from `cardCell`/`card` 185–196), using the shared `Tone` from Step 3.
- All functions return pdfmake `Content` built **only from tables** (carry the explanatory comments at 90–92 / 110–111 / 167–169 verbatim — they document a real pdf.js constraint).
- **Do not** route these into `createKpiRow`/`createKpiDashboard`. They are a new, additive module.

**Migrate COC to consume it (optional, same step or deferred):** once `pdfBars.ts` exists and is test-covered, replace the inline `miniBar`/`verdictBar`/`gaugeBar`/`card` in `siteCocReport.ts` with imports. This is a pure internal refactor of the renderer — the produced doc-def must be byte-stable (verify via snapshot, see Test plan). If risk of visual drift is a concern, **defer this migration** and let COC keep its inline copies until a snapshot test exists; the shared module still stands alone for new consumers.

**What stays untouched:** `pdfMakeUtils.ts`, `pdfTemplates.ts`, all 10 KPI consumers, COC's landscape/cover/SANS layout.

**Blast radius:** new file = zero existing-consumer risk. If COC is migrated to consume it, blast radius is COC-only and snapshot-gated.

### Step 3 — Extract the semantic-status (`Tone`) convention

**Goal:** a single status→colour vocabulary so reports stop hand-rolling hex.

- Promote the `Tone` type and the tint table to a shared location. Two viable shapes:
  - **(a) Minimal:** export `Tone` and a `TONE_TINT` map (the `TINT` object at siteCocReport.ts 170–175) from `src/lib/pdfBars.ts` (so the card util and tone live together).
  - **(b) Dedicated:** new `src/lib/pdfStatusTone.ts` holding `Tone`, `TONE_TINT`, and re-exporting/aliasing the generic mappers.
- Keep COC's **domain-specific** mappers (`scheduleStatusTone`, `verdictTone`, `ruleTone`) in `src/lib/siteCoc/statusDisplay.ts` — they encode COC business rules (e.g. "MISSING/FAIL → red"). Only the **generic `Tone` enum + tint palette** is shared. `statusDisplay.ts` then imports `Tone` from the shared module instead of declaring it.

**What stays untouched:** the COC business-rule mappers and the Tailwind class maps (`TONE_PILL`, `TONE_CELL` at statusDisplay.ts 31–44) — those are screen-side, not PDF-side.

**Blast radius:** `statusDisplay.ts` re-points its `Tone` import; `siteCocReport.ts` re-points `Tone`/`TINT`. COC-only. The shared Tailwind class maps are unaffected.

### Step 4 — Document the model/render split as a convention (no refactor)

**Goal:** future generators copy COC's good structure without a big-bang rewrite of existing ones.

- Add a short section to the PDF system reference (or a `docs/` note) describing the convention, citing COC as the reference implementation:
  1. A pure `build<X>Model(input): <X>Model` (no I/O) — cf. `cocReportModel.ts:66`.
  2. A pure `build<X>DocDef(model, logoDataUrl?): TDocumentDefinitions` (no I/O) — cf. `siteCocReport.ts:132`.
  3. Branding I/O stays in the caller/UI layer (cf. `ReportSubTab.tsx` calling `imageUrlToBase64` then passing `logoDataUrl` in).
  4. Bars/cards via `pdfBars.ts`; status colours via the shared `Tone`.
- **No existing generator is rewritten in this plan.** The convention is the deliverable; adoption is opportunistic (next time a generator is touched, or when the Fortress Asset Register PDF is built — see that separate plan).

**Blast radius:** docs only. Zero code risk.

---

## 4. Risks & mitigations

| Risk (from adversarial verification) | Severity | Mitigation in this plan |
| --- | --- | --- |
| Forcing COC through `fetchPDFTemplate` adds config with nothing to configure (no `site_coc` type, no DB row, bespoke SANS layout) | High | **Explicitly out of scope.** Section 2 "LEAVE ALONE". |
| Table-bars sold as a pdf.js fix when the only canvas bar is dead and Asset Verification already emits no canvas | High | Framed as **consolidation + future reuse**, not a fix. Step 1 deletes the dead `createProgressBar`. |
| Routing COC through shared portrait cover/header breaks its landscape layout | High | COC cover + landscape **left alone**. Shared `createCoverPage` not touched. |
| Widening `createKpiRow` (7 consumers) / `createKpiDashboard` (3) regresses unrelated reports | Med | New `pdfBars.ts` module is **additive**; existing signatures unchanged. |
| Adding COC patterns on top of unresolved `pdfTemplates.ts` vs `pdfMakeUtils.ts` split increases surface | Med | Step 1 (collapse divergence) is sequenced **first**, as a prerequisite. |
| Migrating COC to consume `pdfBars.ts` causes silent visual drift | Med | Snapshot-test `buildSiteCocReportDocDef` output **before** migrating (Test plan §5). If no snapshot, defer the COC migration; ship the module standalone. |
| Pulling branding I/O into the model layer during extraction | Low | Convention (Step 4) mandates pure model + pure docdef; `pdfBars.ts` functions take colours/values only, no I/O. |
| `Tone` extraction breaks COC's screen-side pill/cell classes | Low | Only `Tone` + tint palette move; `TONE_PILL`/`TONE_CELL` stay in `statusDisplay.ts`. |

---

## 5. Test plan

### Existing tests that must stay green (regression gate)

- `src/lib/siteCoc/cocReportModel.test.ts` — model builder unchanged by this plan; must pass untouched.
- `src/lib/siteCoc/statusDisplay.test.ts` — guards the `Tone` mappers; must pass after `Tone` is re-pointed to the shared module (Step 3).
- `src/lib/siteCoc/reportKpis.test.ts` — KPI aggregation; unaffected.
- `src/lib/pdfMakeUtils.footer.test.ts`, `src/lib/pdfMakeConfig.margins.test.ts`, `src/lib/pdfBranding.dates.test.ts` — guard the shared system; must stay green after the dead `createProgressBar` deletions (Step 1).
- `src/lib/pdfDocumentSaver.test.ts` — persistence layer; unaffected but run as part of the suite.

### New tests to add

- **`src/lib/pdfBars.test.ts`** (new) — for the extracted utilities:
  - `miniBar` clamps `pct` to `[0,100]`; produces a 2-cell table; both widths ≥ 1.
  - `segmentedBar` drops zero-value segments; falls back to a single track cell when all segments are zero; widths sum sensibly.
  - `gaugeBar` clamps and produces a 2-cell table.
  - `tintedKpiCard` emits the nested accent-bar + content structure and includes a `miniBar` only when `barPct` is provided.
  - **Assert no `canvas` key appears** anywhere in the returned `Content` (the whole point — guards the pdf.js constraint).
- **`src/lib/siteCoc/siteCocReport.test.ts`** (new — the renderer is currently **untested**; only model/status/kpis are): a **snapshot/structural test** of `buildSiteCocReportDocDef(model)` for a representative model. This both (a) establishes a baseline so the Step 2 COC→`pdfBars` migration can be proven byte-stable, and (b) closes a real coverage gap on the best-engineered report. Assert: `pageOrientation === 'landscape'`, footer present, `pageBreakBefore` defined, and no `canvas` keys in body content.

### Verification commands (run before any commit, per investigation protocol)

- `npx tsc --noEmit` clean on every touched file.
- `npm test -- pdfBars siteCocReport statusDisplay cocReportModel reportKpis pdfMakeUtils pdfMakeConfig` green.
- `grep -rn "createProgressBar" src/` returns **nothing** after Step 1 (proves the dead code is fully removed, no orphan call site).
- Runtime: regenerate a Site COC report via `ReportSubTab.tsx` and an Asset Verification report via `AssetComparisonTable.tsx` in the in-app `DocumentPreviewDialog` (pdf.js viewer) and confirm bars/cards render in-position (no bottom-bumped/stretched rows). This is the only true check that the table-bar technique still holds; do it **before** claiming completion.

---

## 6. Open questions

1. **KPI lineage target.** Should `createKpiDashboard` (legacy `pdfTemplates.ts:295`) be retired in favour of `createKpiRow` (`pdfMakeUtils.ts:675`) entirely, migrating its 3 consumers (`complianceReportGenerator.ts`, `assetVerificationReportGenerator.ts`, `pdfTemplates.ts`)? This plan defers it (Step 1 keeps Asset Verification on legacy and only deletes dead code). Confirm whether full legacy retirement is in scope for a follow-up.
2. **COC→`pdfBars` migration now or later?** Step 2 can either migrate COC to consume the shared module immediately (snapshot-gated) or leave COC's inline copies until the snapshot test lands. Which sequencing does the team prefer given COC is the most visually load-bearing report?
3. **`Tone` module shape.** Step 3 offers (a) co-locate `Tone` + tint in `pdfBars.ts` vs (b) a dedicated `pdfStatusTone.ts`. Preference?
4. **Should the shared `tintedKpiCard` eventually back the non-COC KPI rows?** Long-term, `createKpiRow`'s flat stack-of-text cards and COC's tinted nested cards are visually different. Is unifying them on the tinted card a desired end-state, or are the two card styles intentionally distinct per report family? (No action now — flagged so the additive `pdfBars.ts` is designed without precluding it.)
5. **Cover-page convergence.** COC's landscape cover is left alone. If a future report wants COC-style tinted cards on a portrait cover, does the shared `createCoverPage` need a landscape variant, or do landscape reports keep bespoke covers? (Out of scope; noted for the convention doc.)
