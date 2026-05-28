# Pre-existing EComplianceTests failures — investigation report

**Date:** 2026-05-27
**Trigger:** Stage 4c-1 (`feat/stage4c-1-coalesce-fk-on-push`) on iOS worktree fixed two test-compile errors (commit `ee92b19`). Running the test target afterwards surfaced 13 runtime failures that the compile errors had been hiding. Full suite: 81 passed, 13 failed.
**Worktree:** `/Volumes/Extreme SSD/DEVELOPER/ECompliance/.claude/worktrees/stage4c-1-coalesce-fk` @ `0b6a95d`
**xcresult:** `/tmp/ecompliance-DD-stage4c1/Logs/Test/Test-ECompliance-2026.05.27_11-06-11-+0200.xcresult`

This report covers what is broken, why, severity, and whether each blocks Stage 4 of the data-integrity audit ([2026-05-27-remediation-strategy.md](./2026-05-27-remediation-strategy.md)).

---

## TL;DR

| Failures | Root cause | Severity | Blocks Stage 4? |
|---|---|---|---|
| 12 / 13 | Tests assert `SubsectionComplianceEngine.update(...)` writes `installationStatus` / `isCompliant` to the Subsection model, but `update()` is an **intentional no-op for persistence** since Build 104 (2026-05-04). Tests were never retired. | LOW | **NO** |
| 1 / 13 | `SiteReportBindingContractTests.test_inspectionItemValues_appearInRenderedHTML` seeds `InspectionItem` rows via the **denormalised FK only** (`item.inspectionId = inspection.id`). The `inspection.items` inverse relationship is never populated, so `InspectionJsonSynthesizer.backfill` walks an empty array and renders an empty section. Test-fixture bug; latent production fragility. | LOW (test) / MEDIUM (latent) | **NO** |

**Recommendation:** ship Stage 4c-1 (FK coalescing) without these failures blocking the merge. They predate the branch, are not regressions, and do not undermine Stage 3's findings or Stage 4's plan. File follow-up work to retire/rewrite the stale tests and harden the synthesizer.

---

## Confirmed failure list (from xcodebuild run)

All 13 confirmed failing on a clean run against the worktree (xcodebuild exit 65, summary at `/tmp/stage4c1-failures.log:206-230`). Six classes pass; the listed 13 fail:

```
SiteReportBindingContractTests.test_inspectionItemValues_appearInRenderedHTML

InspectionStatusPropagationTests.test_changingOneSubsectionsInspection_doesNotAffectSiblings
InspectionStatusPropagationTests.test_isCompliant_false_whenNonCompliant
InspectionStatusPropagationTests.test_isCompliant_false_whenRequiresAttention
InspectionStatusPropagationTests.test_isCompliant_nil_whenIncomplete
InspectionStatusPropagationTests.test_isCompliant_true_whenCompliant
InspectionStatusPropagationTests.test_updateAll_eachSubsectionGetsItsOwnStatus

SubsectionComplianceEngineTests.test_update_isCompliantFalse_whenNonCompliant
SubsectionComplianceEngineTests.test_update_isCompliantFalse_whenRequiresAttention
SubsectionComplianceEngineTests.test_update_isCompliantNil_whenIncomplete
SubsectionComplianceEngineTests.test_update_isCompliantTrue_whenCompliant
SubsectionComplianceEngineTests.test_update_writesInstallationStatusAndScore
SubsectionComplianceEngineTests.test_updateAll_writesInstallationStatusToEachSubsection
```

(Identical to the list passed in the brief.)

---

## Group A — 12 failures: tests against intentionally-deleted persistence

### What the tests assert

All twelve tests share the same shape: they call `SubsectionComplianceEngine.update(...)` (or `updateAll`), then assert that one or both of these were written:

- `sub.installationStatus == "<expected raw>"`
- `sub.isCompliant == true/false/nil`
- `sub.installationScore == <expected double>`

Sample (`SubsectionComplianceEngineTests.swift:309-320` — `test_update_writesInstallationStatusAndScore`):

```swift
SubsectionComplianceEngine.update(
    sub, inspections: [insp], templates: [template], snags: [], in: context
)
XCTAssertEqual(sub.installationStatus, InstallationStatus.compliant.rawValue)
XCTAssertEqual(sub.installationScore ?? 0, 100.0, accuracy: 0.001)
```

### Why they fail

`SubsectionComplianceEngine.update()` is a thin compute-and-return shim that **never mutates** the supplied `Subsection`. See [SubsectionComplianceEngine.swift:165-179](../../../ECompliance/SubsectionComplianceEngine.swift):

```swift
@discardableResult
static func update(
    _ subsection: Subsection,
    inspections: [Inspection],
    templates: [InspectionTemplate] = [],
    snags: [Snag],
    in context: ModelContext
) -> InstallationComplianceResult {
    return compute(
        for: subsection,
        inspections: inspections,
        templates: templates,
        snags: snags
    )
}
```

The rationale is documented in the same file at lines 150-164:

> 2026-05-04 (Build 104): the WRITE step has been removed. Server-side triggers (migration `2026-05-04_server_side_compliance_recompute.sql`) recompute installation_status authoritatively when inspections / snags / templates / subsections change. Persisting the local compute here would overwrite freshly-pulled server values — different devices have different cached state, so each device's local compute differs, which causes the iPad-50% / Mac-88% / server-90% divergence on YARONA.

[InstallationStatus.swift:25-37](../../../ECompliance/InstallationStatus.swift) goes further and lists `SubsectionComplianceEngine.compute / update / updateAll` under **"What's deleted (never to return)"** — though in practice only the **persistence step** was removed; the compute/update/updateAll methods still exist as pure-compute shims that the assembler uses for read-only display.

[SiteReportInputAssembler.swift:22-29](../../../ECompliance/SiteReportInputAssembler.swift) corroborates from the read side:

> `subsection.installationStatus` is server-authoritative and is never written locally (see `SubsectionComplianceEngine.update` — explicit no-op).

So every test that asserts `sub.installationStatus` after calling `update()` is testing functionality that was **deliberately removed two builds ago**. The Subsection field stays whatever it was before the call (nil in these test fixtures, which makes the `XCTAssertEqual` against `"compliant"` / `"non_compliant"` / `"requires_attention"` / `"incomplete"` fail). Even the `XCTAssertNil(sub.isCompliant)` cases (e.g. `test_isCompliant_nil_whenIncomplete`) fail their **preceding** `XCTAssertEqual(sub.installationStatus, "incomplete")` assertion before they ever reach the nil check.

### Per-test file:line references

| Test | File | Test source | Assertion that fails |
|---|---|---|---|
| `test_update_writesInstallationStatusAndScore` | [SubsectionComplianceEngineTests.swift:309-320](../../../EComplianceTests/SubsectionComplianceEngineTests.swift#L309) | `update()` then expects status+score written | L318 (`installationStatus`) |
| `test_update_isCompliantTrue_whenCompliant` | SubsectionComplianceEngineTests.swift:322-331 | `update()` then `isCompliant == true` | L330 |
| `test_update_isCompliantFalse_whenNonCompliant` | SubsectionComplianceEngineTests.swift:333-345 | `update()` with all-fail then `isCompliant == false` | L344 |
| `test_update_isCompliantFalse_whenRequiresAttention` | SubsectionComplianceEngineTests.swift:347-361 | `update()` 5/10 pass then `installationStatus == "requires_attention"` | L359 |
| `test_update_isCompliantNil_whenIncomplete` | SubsectionComplianceEngineTests.swift:363-373 | `update()` with no inspections then `installationStatus == "incomplete"` | L371 |
| `test_updateAll_writesInstallationStatusToEachSubsection` | SubsectionComplianceEngineTests.swift:377-408 | per-subsection status writes | L405-407 |
| `test_isCompliant_true_whenCompliant` | [InspectionStatusPropagationTests.swift:301-310](../../../EComplianceTests/InspectionStatusPropagationTests.swift#L301) | `update()` then `isCompliant == true` | L309 |
| `test_isCompliant_false_whenNonCompliant` | InspectionStatusPropagationTests.swift:312-324 | `update()` with all-fail then `isCompliant == false` | L323 |
| `test_isCompliant_false_whenRequiresAttention` | InspectionStatusPropagationTests.swift:326-339 | `installationStatus == "requires_attention"` | L337 |
| `test_isCompliant_nil_whenIncomplete` | InspectionStatusPropagationTests.swift:341-350 | `installationStatus == "incomplete"` | L348 |
| `test_updateAll_eachSubsectionGetsItsOwnStatus` | InspectionStatusPropagationTests.swift:354-381 | per-subsection status writes | L378-380 |
| `test_changingOneSubsectionsInspection_doesNotAffectSiblings` | InspectionStatusPropagationTests.swift:383-416 | per-subsection status writes (two passes) | L402-403, L414-415 |

(All asserted writes are to `Subsection.installationStatus`, `Subsection.installationScore`, or `Subsection.isCompliant`. The intervening `compute()` call returns the correct value — every `test_compute_*` test in the same file passes, confirming the scoring engine itself is intact.)

### Severity & Stage 4 impact

- **Severity: LOW.** The engine's *scoring logic* (`compute()`) is sound — every `test_compute_*` case in `SubsectionComplianceEngineTests` passes. Only the *persistence assertions* fail, and they're asserting a behaviour the codebase has explicitly disowned.
- **Stage 4 impact: NONE.** Stage 4 trusts the server-side `recompute_subsection_installation_status(uuid)` trigger as the sole canonical writer ([ADR-001](https://github.com/WattMatt/insight-linker-app/blob/main/docs/decisions/ADR-001-single-compliance-scoring-path.md) per `InstallationStatus.swift:34-35`). Re-introducing client-side writes to satisfy these tests would resurrect the iPad-50% / Mac-88% / server-90% divergence on YARONA that motivated the Build 104 change in the first place.

### Fix options (for a follow-up branch — not blocking)

1. **Delete the 12 tests.** Cleanest. They test deleted functionality. The test file headers in both files refer to "back-compat per spec §5.5" — that back-compat path is gone.
2. **Rewrite as compute-only assertions.** Capture `let result = SubsectionComplianceEngine.update(...)` (or `compute(...)`) and assert against `result.status` / `result.score` instead of the Subsection fields. Preserves the regression coverage on the scoring rules without re-asserting the removed write step.
3. **Move the "Subsection.installationStatus reflects status X" tests to an integration test against the server trigger.** Out of scope for the iOS test target.

Option 2 is the recommended path because it preserves the spec §5.4 / §5.5 coverage that motivated these tests; option 1 loses it.

---

## Group B — 1 failure: HTML render contract test, fixture bug + latent fragility

### What the test asserts

`SiteReportBindingContractTests.test_inspectionItemValues_appearInRenderedHTML` at [SiteReportBindingContractTests.swift:47-75](../../../EComplianceTests/SiteReportBindingContractTests.swift#L47) seeds an InspectionItem with response `"voltage-marker-9F3A2C"` and another with notes `"phase-Y-198V-marker"`, runs the full assembler + builder pipeline, and asserts both unique strings appear in the rendered HTML.

### Why it fails

The seeding loop at [SiteReportBindingContractTests.swift:204-215](../../../EComplianceTests/SiteReportBindingContractTests.swift#L204) creates each `InspectionItem` and sets only the denormalised foreign key:

```swift
for (secId, itemKey, isCompliant, response, notes) in itemAnswers {
    let item = InspectionItem(...)
    item.inspectionId = inspection.id   // ← only the FK
    ctx.insert(item)
}
```

It never assigns `item.inspection = inspection`. The relationship is declared one-sided on the parent only — [Inspection.swift:98-99](../../../ECompliance/Inspection.swift#L98) has `@Relationship(... inverse: \InspectionItem.inspection)` and [ModelsInspectionItem.swift:48](../../../ECompliance/ModelsInspectionItem.swift#L48) declares `var inspection: Inspection?` as a plain optional. The denorm FK `inspectionId` at [ModelsInspectionItem.swift:38-41](../../../ECompliance/ModelsInspectionItem.swift#L38) exists precisely because the relationship is acknowledged as unreliable:

> Denormalized FK — mirrors inspection.id so items can be fetched directly without relying on the SwiftData @Relationship fault (which can be unreliable).

Setting the FK alone does **not** propagate into `inspection.items`. So the pipeline behaves like this:

1. `SiteReportInputAssembler.assemble(...)` calls `InspectionJsonSynthesizer.backfill(...)` ([SiteReportInputAssembler.swift:93-96](../../../ECompliance/SiteReportInputAssembler.swift#L93)).
2. `backfill` reads `let items = inspection.items ?? []` at [InspectionJsonSynthesizer.swift:79](../../../ECompliance/InspectionJsonSynthesizer.swift#L79) — gets `[]`.
3. `guard !items.isEmpty else { continue }` skips the inspection. No `jsonData` is written.
4. The HTML builder reads the inspection via `JSONDataParser` against the (still-nil) `jsonData` and renders nothing for the two items.
5. `XCTAssertTrue(html.contains("voltage-marker-9F3A2C"))` fails.

Production code does **not** have this problem because every call site that creates an `InspectionItem` populates both sides — see [InspectionDetailView.swift:700-701](../../../ECompliance/InspectionDetailView.swift#L700) and [AddInspectionView.swift:268-269](../../../ECompliance/AddInspectionView.swift#L268):

```swift
item.inspection   = inspectionToView
item.inspectionId = inspectionToView.id
```

### Severity & Stage 4 impact

- **Severity (test): LOW.** Single-line fixture fix. The test, once corrected, is genuinely valuable — it is the only end-to-end binding contract that the synthesizer→parser→HTML chain has, per the file header at [SiteReportBindingContractTests.swift:5-23](../../../EComplianceTests/SiteReportBindingContractTests.swift#L5).
- **Severity (production, latent): MEDIUM.** The synthesizer at `InspectionJsonSynthesizer.swift:79` trusts `inspection.items` despite the model author's own admission that the relationship is unreliable. If a sync code path ever drops a relationship fault (and they do — that is what `inspectionId` exists to backstop), the synthesizer silently produces no `jsonData`, the report renders blank, AND `SubsectionComplianceEngine.compute` returns `.incomplete`. This is the same failure mode the synthesizer was created to fix (per its own file header at lines 24-27), just re-introduced via a different path. The risk is non-hypothetical but is not currently observed in Stage 1 production data.
- **Stage 4 impact: NONE.** Stage 4's photo / FK / orphan remediation does not depend on this code path. Note however that Stage 3 Finding (d) discusses a separate use of the same synthesizer (`backfillAndMerge` for photo-URL rewrites) — see `root-causes.md` line ~280 onward. The hardening recommendation below would also benefit that flow.

### Fix options (for a follow-up branch — not blocking)

1. **(Immediate, 1 line)** Patch the test fixture to assign both sides:
   ```swift
   item.inspection   = inspection
   item.inspectionId = inspection.id
   ```
   at SiteReportBindingContractTests.swift:213.
2. **(Recommended hardening, also separate)** Teach `InspectionJsonSynthesizer.backfill` and `backfillAndMerge` to fall back to `ModelContext.fetch(FetchDescriptor<InspectionItem>(predicate: #Predicate { $0.inspectionId == inspId }))` when `inspection.items` is empty. The denorm FK was added for exactly this defensive case; the synthesizer should use it. Without this, the synthesizer remains coupled to the SwiftData relationship being faulted in correctly, contradicting the explicit warning in the InspectionItem model header.

Do (1) immediately to unblock CI signal. Do (2) as part of a Stage 4c hardening sweep — it overlaps thematically with Stage 3 Finding (d) (photo URL flow through the same synthesizer) and could be bundled.

---

## Investigation notes

### How the failures were hidden before this branch

Two test files had pre-existing compile errors that the worktree's commit `ee92b19` fixed:
- `EComplianceTests/InspectionJsonSynthesizerTests.swift` — missing `import SwiftData`
- `EComplianceTests/SiteReportBindingContractTests.swift` — four `ctx.insert(...)` calls used stale init signatures

When a test target fails to compile, `xcodebuild test` skips the entire target on the CLI. (Xcode's incremental builds in the IDE were lenient and ran the rest of the suite, so this only manifested on clean CLI runs.) Fixing the compile errors made the runtime failures visible. None of the 13 failures are caused by the compile-error fixes — they predate the branch.

### Cross-reference with Stage 3 root-causes

`InspectionJsonSynthesizer` IS mentioned in [root-causes.md](./root-causes.md) (search "InspectionJsonSynthesizer") but only in Finding (d) (photo URLs) and Finding (e) (web-app schemas) — never in the context of the engine no-op or this test. The 13 failures here are **distinct from** every Stage 3 finding (a)-(e).

### Cross-reference with Stage 4 plan

[2026-05-27-remediation-strategy.md](./2026-05-27-remediation-strategy.md) does not reference these tests, the engine no-op, or the synthesizer-fixture issue. The recommended follow-up work (test rewrites, synthesizer hardening) is small enough to slot into a Stage 4c iOS-code-fix pass without affecting the proposal-table / NOT-NULL-promotion sequencing.

### Investigation Protocol completion

Per `~/.claude/CLAUDE.md` Investigation Protocol:
- **Phase 1 — Full-system map:** layers traversed: test fixture → SwiftData @Relationship/FK semantics → `SubsectionComplianceEngine.update/updateAll` → `Subsection` field writes → `InspectionJsonSynthesizer.backfill` → `JSONDataParser` → `SiteReportHTMLBuilder` output. ✓
- **Phase 2 — Verified each link:** read engine source, test source, assembler source, model definitions, production call sites, and Stage 3/4 docs. ✓
- **Phase 3 — Root-cause statements:** stated above for both groups, each with file:line evidence. ✓
- **Phase 4 — Architecture-or-symptom check:** Group A — the *test* is wrong, not the architecture (engine no-op is the deliberate post-Build-104 design). Group B — fixture is wrong AND there's a latent architectural fragility (synthesizer ignoring its own model's "FK fallback" guidance) that's worth hardening separately. ✓
- **Phases 5-7:** out of scope for this report. Fix recommendations are listed per group; the user should choose whether to schedule them now or in Stage 4c.
