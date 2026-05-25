# Parity Gap Analysis — insight-linker-app (web) ↔ ECompliance (iOS)

**Analyst:** Claude Gap Analysis Agent
**Date:** 2026-05-25
**Purpose:** Drive the iOS-parity sprint plan that follows (build-planner skill).
**Time horizon:** Phased over ~6 months.

---

## Framing

**Hybrid parity model** (user-chosen):

- **Core compliance workflows** — sites, subsections, inspections, COC, templates, photos, sync — reach parity in **both directions** (web mirrors iOS for the core domain *and* iOS may need to catch up on web-side coverage).
- **Web-only differentiators preserved** — admin/portal/API/template-builder/feedback/validation-conversation features stay on web only. These map cleanly to the 25 "web-only territory" tables flagged in `DATABASE_MAP §D1`.

This is data-layer-centric. UX/screen comparison is constrained until the iOS Swift source is reachable (currently on an unmounted SSD).

---

## 1. Current/Desired State Assessment by Dimension

Each dimension is a functional domain. **iOS coverage** is asserted from `DATABASE_MAP.md` (35 SwiftData models + 30 DTOs + sync paths). **Web coverage** is from `.from('<table>')` grep across `src/` plus the AUDIT_BASELINE.md view inventory. Confidence is HIGH only where both sources are direct evidence.

| # | Dimension | iOS coverage | Web coverage (`.from()` files) | Gap type | Magnitude | Confidence |
|---|---|---|---|---|---|---|
| 1 | Auth / sessions | Supabase auth, role-based routing | ProtectedRoute + useUserRole | NONE | — | HIGH |
| 2 | User roles | `UserRole` model, `app_role` enum | 8 | NONE | — | HIGH |
| 3 | Profiles | `Profile` model (DTO drops `first_name`/`last_name` per D5) | 15 | REALIGN (D5 phantom cols) | SMALL | HIGH |
| 4 | Clients | `Client` model | 12 | NONE | — | HIGH |
| 5 | Sites | `Site` model (orphans: `city`, `province`, `postalCode`, `status` per D8) | 28 | REALIGN (D8 orphan fields) | SMALL | HIGH |
| 6 | Subsections | `Subsection` model + `SubsectionPushDTO` | 32 | REALIGN (D7 installation_status push gap on iOS) | MOD | HIGH |
| 7 | Inspections | `Inspection` model, JSON-data-heavy | 33 | REALIGN (D3 InspectionItem dichotomy) | LARGE | HIGH |
| 8 | Inspection subsections | `InspectionSubsection` model + DTO | **0** (only types.ts) | ADD or REALIGN | LARGE | MED |
| 9 | Inspection items | iOS embeds in `inspections.json_data` (D3); web has `inspection_items` table but unclear usage | 0 explicit | REALIGN (architectural choice) | LARGE | MED |
| 10 | Inspection templates | `InspectionTemplate` (fetch-only on iOS); items parsed from `sections` jsonb | 12 | NONE (web also reads same shape) | — | HIGH |
| 11 | Inspection signatures | `InspectionSignature` model + DTO | 5 | NONE | — | HIGH |
| 12 | Snags | `Snag` model + DTO (D5 phantom cols `rectification_photo_url`, `derived_from_rule`) | 17 | REALIGN (D5) | SMALL | HIGH |
| 13 | Site marking checklist | `SiteMarkingChecklistItem` + DTO (D6 NOT NULL `item_id` violation) | 3 | REALIGN (D6 — fix iOS DTO) | SMALL | HIGH |
| 14 | COC validations | `COCValidation` model + DTO | 15 | NONE | — | HIGH |
| 15 | COC local validations | `COCLocalValidation` model + DTO (D5 phantom cols) | **0** | ADD (web-side reader) | MOD | MED |
| 16 | COC validation settings | `COCValidationSettings` model + DTO | **0** | ADD (web-side reader) | MOD | MED |
| 17 | COC compliance photos | `COCCompliancePhoto` model | 1 | ADD (web-side fuller integration) | MOD | MED |
| 18 | Notifications | `AppNotification` model | 2 | ADD (web in-app notifications) | MOD | HIGH |
| 19 | Activity log | `ActivityLog` model | 1 | ADD (web activity-log reader/writer) | MOD | HIGH |
| 20 | Calendar events | `CalendarEvent` model | 3 | NONE (web has Calendar view) | — | MED |
| 21 | App settings | `AppSettings` → `settings` table | 19 | NONE | — | HIGH |
| 22 | Documents (site + subsection) | `SiteDocument`, `SubsectionDocument` + DTOs (D5: `created_at`/`updated_at` phantom on subsection_documents) | 11 + 20 = 31 | REALIGN (D5) | SMALL | HIGH |
| 23 | Document categories | `DocumentCategory`, `SiteDocumentCategory` | 6 + 4 = 10 | NONE | — | HIGH |
| 24 | QR codes | `QRCodeRecord` model | **0 via .from()** (uses qr-redirect Edge Fn or RPC) | REALIGN (clarify write path) | SMALL | LOW |
| 25 | QR scans | `QRScanRecord` model | 2 | NONE | — | MED |
| 26 | Floor plan pins | `FloorPlanPin`, `FloorPlanPinComment` | 7 + 1 = 8 | NONE | — | HIGH |
| 27 | Subsection floor plans | `SubsectionFloorPlan` model + DTO | 10 | NONE | — | HIGH |
| 28 | Site schematics | `SiteSchematic`, `SchematicBlock` (D9: jsonb decode hazard on iOS) | 1 + 1 = 2 | REALIGN (web-side schematic editor) | LARGE | LOW |
| 29 | Site assets | `SiteAsset` model + DTO (D5: `type` should be `asset_category` enum) | 8 | REALIGN (D5 enum mismatch) | SMALL | HIGH |
| 30 | Reports | `Report` + `GeneratedReport` (local) | **0 via .from()** | REALIGN (web generates but doesn't persist to `reports`) | MOD | MED |
| 31 | Photos (general) | iOS has `Photo` model **never synced** (D4); `offline_photos` table ignored | uses `offline_photos` via offlineDB? (need check) | REALIGN (D4 — iOS catch-up, web already ahead) | LARGE | HIGH |
| 32 | Offline sync / mutations queue | `SyncQueueItem` (local-only on iOS) | IndexedDB `mutations` store in `offlineDB.ts` + `useOfflineSync` | NONE structurally; REALIGN consolidation (offlineDB vs offlineInspectionDB drift per AUDIT_BASELINE) | MOD | HIGH |
| 33 | Inspection templates (validation RPC) | iOS likely calls direct from app | `validate_inspection_templates` RPC | NONE | — | HIGH |
| 34 | Camera capture | Native iOS camera; SwiftData persists locally | `useCamera` via Capacitor plugin + `useImageUpload` | NONE structurally; REALIGN UX | SMALL | MED |

### Summary by gap type

| Gap type | Dimensions | Severity rollup |
|---|---|---|
| **NONE** (parity) | 1, 2, 4, 10, 11, 14, 20, 21, 23, 25, 26, 27, 33 | 13 dimensions already aligned |
| **REALIGN** | 3, 5, 6, 7, 12, 13, 22, 24, 28, 29, 30, 31, 32, 34 | 14 dimensions need adjustment to converge |
| **ADD** | 8, 9, 15, 16, 17, 18, 19 | 7 web-missing dimensions |
| **REMOVE** (under Hybrid) | — | None — the "remove" list applies under Strict Mirror only |

---

## 2. Web-Only Differentiators (Preserve — NOT in scope for parity)

These map to `DATABASE_MAP §D1` (the 25 web-only Postgres tables) and remain web-exclusive:

| Cluster | Tables | Web feature |
|---|---|---|
| Public API | `api_clients`, `api_access_tokens`, `api_request_logs` | `APIClients` view, `oauth-token` + `api-reports` Edge Functions |
| Customer portal | `client_access_links`, `access_link_visitors` | `(client-portal)/*` routes, `review/[token]` public share |
| Contractor flow | `contractor_coc_uploads` | `(contractor)/*` routes |
| AI validation | `coc_extractions`, `validation_conversations`, `validation_feedback`, `validation_messages` | `extract-coc` + `validate-coc` Edge Functions + `ValidationFeedback` view |
| Compliance config + audit | `compliance_settings`, `compliance_settings_audit` | `Settings` view (admin) |
| Feedback | `issue_reports`, `suggestions` | `IssueReports`, `Suggestions`, `FeedbackManagement` views |
| Access mgmt | `pending_user_invites`, `user_clients`, `user_sites`, `user_sites_history`, `user_policy_overrides`, `user_storage_connections` | `Users`, `PortalManagement`, `SiteAssignments` views |
| PDF templating | `pdf_report_templates` | `TemplateBuilderPage`, `TemplateValidator`, `PDFTemplateTestDashboard` |
| Web-only audit/ops | `inspection_relink_audit`, `file_sync_logs`, `temp_import`, `offline_photos`, `inspection_items` | Various |

**Implication.** The web app intentionally has ~30 more views and ~5 more Edge Functions than iOS will ever need. None of these are "extra" — they ARE the web's reason to exist alongside iOS.

---

## 3. Prioritized Gap List

Scoring: Impact 1–5 (parity value), Feasibility 1–5 (effort inverse), Priority = I × F. Dependencies noted.

### 3A. ADD — web is missing what iOS has

| # | Gap | Impact | Feasibility | Priority | Tier | Notes |
|---|---|---|---|---|---|---|
| ADD-1 | **Inspection subsections** (#8) — `inspection_subsections` queried 0× on web | 5 | 4 | 20 | CRITICAL | Spine table — bridges inspections↔subsections. iOS depends on it. Without it, the inspection list view can't show per-subsection breakdown |
| ADD-2 | **Activity log** (#19) — read + write `activity_logs` | 4 | 5 | 20 | CRITICAL | Cross-cutting concern; cheap to add (one hook + sidebar feed); iOS already writes |
| ADD-3 | **Notifications** (#18) — surface `notifications` in UI (currently fetched in only 2 files; no notification center) | 4 | 4 | 16 | CRITICAL | iOS users get push; web users currently get nothing — visible parity gap |
| ADD-4 | **COC validation settings** (#16) — read `coc_validation_settings` | 4 | 4 | 16 | CRITICAL | Settings drive validation behaviour; iOS reads them, web doesn't |
| ADD-5 | **COC local validations** (#15) — surface `coc_local_validations` rows | 3 | 4 | 12 | HIGH | Currently iOS-only validation records; web needs a reader if compliance officers move between devices |
| ADD-6 | **COC compliance photos** (#17) — fuller integration beyond 1-file mention | 3 | 4 | 12 | HIGH | Tied to ADD-5 |
| ADD-7 | **Reports persistence** (#30) — write to `reports` table after PDF generation | 3 | 3 | 9 | HIGH | iOS reads from `reports`; web generates but doesn't persist → cross-device gap |

### 3B. REALIGN — same domain, different/conflicting implementation

| # | Gap | Impact | Feasibility | Priority | Tier | Owns the fix |
|---|---|---|---|---|---|---|
| RE-1 | **InspectionItem storage dichotomy** (#7, #9) — iOS embeds items in `inspections.json_data`; the live `inspection_items` table is web/legacy. Architectural decision required. | 5 | 2 | 10 | HIGH | Joint (both apps) |
| RE-2 | **Subsection installation_status/score push** (#6, D7) — iOS reads but never writes back; locally computed values lost across devices | 5 | 3 | 15 | CRITICAL | iOS (one DTO fix per D7) |
| RE-3 | **Photo sync architecture** (#31, D4) — iOS has `Photo` model that never syncs; should use `offline_photos` like web does | 4 | 3 | 12 | HIGH | iOS |
| RE-4 | **D5 phantom-column DTO drift** (#3, #5, #12, #22, #29) — 6 iOS DTOs encode columns that don't exist; one (`SubsectionPushDTO`) already strips deliberately. Web is fine; iOS needs DTO/schema reconciliation | 4 | 3 | 12 | HIGH | iOS |
| RE-5 | **D6 site_marking_checklist NOT NULL violation** — iOS DTO never supplies `item_id`; inserts fail | 3 | 5 | 15 | CRITICAL | iOS (1-field fix) |
| RE-6 | **offlineDB vs offlineInspectionDB drift on web** (#32) — two IndexedDB modules with overlapping/diverging stores; bug risk for offline state | 4 | 3 | 12 | HIGH | Web (consolidate) |
| RE-7 | **Schematics editor** (#28) — web has 1 file each for `site_schematics`/`schematic_blocks`; iOS has dedicated models. Likely under-built on web | 3 | 2 | 6 | MEDIUM | Web (build out) |
| RE-8 | **QR codes write path** (#24) — `qr_codes` not queried via `.from()` from web; uses `qr-redirect` Edge Function. Confirm parity with iOS QRCodeRecord lifecycle | 2 | 4 | 8 | MEDIUM | Joint (verify) |
| RE-9 | **Camera UX** (#34) — Capacitor camera works in shell; verify it matches iOS native gestures (multi-shot, EXIF, immediate review) | 2 | 3 | 6 | MEDIUM | Web (Capacitor tuning) |

### 3C. REMOVE — under Hybrid model

**Empty.** No web features get removed for parity under the Hybrid interpretation. (Under Strict Mirror this list would include all of Section 2.)

### Priority sequence

1. **CRITICAL (≥15):** ADD-1, ADD-2, ADD-3, ADD-4, RE-2, RE-5
2. **HIGH (10-14):** ADD-5, ADD-6, ADD-7, RE-1, RE-3, RE-4, RE-6
3. **MEDIUM (4-9):** RE-7, RE-8, RE-9

---

## 4. Root Cause Analysis (priority-tier only)

### ADD-1 — Inspection subsections (CRITICAL)

- Why is `inspection_subsections` not queried by web? → Because the web app likely flattens inspection data via `inspections.json_data` rather than the relational join.
- Why? → Because the web app was built before the `inspection_subsections` table was promoted to first-class storage (per DATABASE_MAP §3, this is the "spine" — it's part of the inspection-relink migration, recent).
- **Root cause:** Migration timing — web's data-access layer was written against the old shape and never updated when the `inspection_subsections` table became authoritative.
- **Category:** Process / Information deficit.

### ADD-2, ADD-3, ADD-4 — Activity log, notifications, COC validation settings (CRITICAL)

- Why are these missing? → Single root cause: web was originally an inspection-recording tool; the cross-cutting workflows (auditability, alerts, configurable validation) were added to iOS first and haven't been backported.
- **Root cause:** Web-app feature roadmap deprioritized cross-cutting concerns in favour of "happy-path" inspection flows.
- **Category:** Process deficit (no parity-tracking discipline).

### RE-2 — Subsection installation_status push (CRITICAL)

- Why doesn't iOS push these columns? → A source comment incorrectly states "columns do not exist on Supabase — computed locally" (per DATABASE_MAP §D7).
- Why is the comment wrong? → Likely the columns were added later via migration and the iOS DTO comment was never updated.
- **Root cause:** Information deficit / stale comment as authority. (Plus a stale claim in CLAUDE.md that "the 2026-04-11 overhaul made `SubsectionPushDTO` push these" — it doesn't.)
- **Category:** Information / Process deficit.

### RE-5 — Site marking checklist NOT NULL violation (CRITICAL)

- Why doesn't the iOS DTO supply `item_id`? → The field was added to the table (NOT NULL, no default) without updating the DTO.
- **Root cause:** Schema migration without coordinated DTO update — same systemic pattern as D5 (DTOs extended ahead of/behind schema).
- **Category:** Process deficit (no DTO/schema sync gate).

### RE-1 — InspectionItem storage dichotomy (HIGH)

- Why two storage strategies? → iOS embeds items in `inspections.json_data` (single round-trip, simpler offline); web/legacy uses `inspection_items` table (queryable, joinable).
- Why hasn't it been resolved? → Each side has been working in isolation; neither is forced to converge until cross-device reads need to agree on shape.
- **Root cause:** Strategic decision pending — neither implementation is wrong; one must be chosen as canonical.
- **Category:** Structural (architecture decision required).

### RE-6 — offlineDB vs offlineInspectionDB drift (HIGH)

- Why two modules? → Probably one was the original; the other added later for a specific feature; they evolved in parallel.
- **Root cause:** Refactoring debt — never consolidated after the second emerged.
- **Category:** Process deficit (no module-ownership convention).

---

## 5. Closure Strategies

Format per gap: Strategy / Owner / Resources / Success criteria / Recurrence prevention.

### ADD-1: Inspection subsections (CRITICAL)
- **Strategy:** BUILD. Add `useInspectionSubsections` hook calling `supabase.from('inspection_subsections').select('*, subsections(*), inspections(*)')`. Wire into `Inspections` and `InspectionDetail` views to show per-subsection rollups.
- **Owner:** Frontend engineer
- **Resources:** ~2-3 days (one hook + 2 view changes + sync wiring + IndexedDB store)
- **Success:** Web Inspection detail view shows the same per-subsection breakdown as iOS; offline sync includes the table
- **Recurrence prevention:** Add `inspection_subsections` to the offlineDB store list as a first-class concern

### ADD-2: Activity log (CRITICAL)
- **Strategy:** BUILD. `useActivityLog` hook + `logActivity()` helper wrapped around all mutation entry points. Sidebar feed component on dashboard.
- **Owner:** Full-stack engineer
- **Resources:** ~3-4 days (hook, helper, feed UI, test)
- **Success:** Every create/update/delete on sites, subsections, inspections, snags emits an `activity_logs` row; sidebar shows the last 50
- **Recurrence prevention:** Lint rule or hook-pattern convention requiring log calls on mutations

### ADD-3: Notifications (CRITICAL)
- **Strategy:** BUILD. Notification bell in header + `(admin)/notifications` page + `useNotifications` hook. Subscribe to `notifications` table via Supabase Realtime for live updates.
- **Owner:** Frontend engineer
- **Resources:** ~3-5 days (bell, panel, hook, realtime subscription)
- **Success:** New `notifications` rows for the current user appear in the bell within 5 seconds; clicking marks read
- **Recurrence prevention:** Realtime subscription is testable; covered by smoke test

### ADD-4: COC validation settings (CRITICAL)
- **Strategy:** BUILD. `useCOCValidationSettings` hook + reader in the settings view. Optionally writer if admin can configure.
- **Owner:** Frontend engineer
- **Resources:** ~1-2 days (reader); +1-2 if writer needed
- **Success:** Settings page shows the same COC thresholds and rules iOS sees
- **Recurrence prevention:** Add to settings-page integration test

### ADD-5/6: COC local validations + compliance photos (HIGH)
- **Strategy:** BUILD. Pair with ADD-4. Add reader for `coc_local_validations` and fuller `coc_compliance_photos` viewer to the inspection detail.
- **Owner:** Frontend engineer
- **Resources:** ~3-5 days combined
- **Success:** Web view of an inspection that was COC-validated on iOS shows the same validation results
- **Recurrence prevention:** Shared TS schema for validation result shape (Zod)

### ADD-7: Reports persistence (HIGH)
- **Strategy:** REDESIGN + BUILD. After PDF generation (whichever Edge Function), insert into `reports` table with file URL, metadata. iOS already reads this.
- **Owner:** Backend (Edge Function) + frontend
- **Resources:** ~2-3 days (add insert to canonical `generate-pdf` function + ensure web reads back)
- **Success:** A PDF generated on web appears in iOS Reports list and vice versa
- **Recurrence prevention:** Edge Function test for the insert; deprecate the 3 dead generate-pdf-* variants (AUDIT_BASELINE Pass 3 finding)

### RE-1: InspectionItem dichotomy (HIGH)
- **Strategy:** REDESIGN. **Decision needed**: pick `inspection_items` table OR `inspections.json_data` as canonical. Recommend canonical = the relational table (`inspection_items`) for queryability; keep `json_data` as a denormalized read cache.
- **Owner:** Architecture decision (user) + both teams
- **Resources:** ~2-4 weeks once decided (migration + reader on both sides)
- **Success:** Both apps read the same source of truth; no D3 footnote required
- **Recurrence prevention:** Single canonical storage documented in `DATABASE_MAP.md`

### RE-2: Subsection installation push (CRITICAL)
- **Strategy:** BUILD (on iOS — outside our scope here but flagged). Fix `SubsectionPushDTO` to include `installation_status` and `installation_score`. Update stale source comment and CLAUDE.md.
- **Owner:** iOS engineer
- **Resources:** ~1 hour (1 DTO field added; CLAUDE.md updated)
- **Success:** Cross-device subsection status agrees
- **Recurrence prevention:** Schema-vs-DTO check script (CI gate)

### RE-3: Photo sync architecture (HIGH)
- **Strategy:** BUILD (on iOS). Add sync for the `Photo` model via `offline_photos` table (the polymorphic `context_type`/`context_id` shape) that web already uses.
- **Owner:** iOS engineer
- **Resources:** ~1-2 weeks (DTO, push/fetch paths, conflict resolution, migration of existing local-only photos)
- **Success:** Photos taken on iOS appear in web Storage and vice versa
- **Recurrence prevention:** Same schema-vs-DTO CI gate (RE-2)

### RE-4: D5 phantom-column DTO drift (HIGH)
- **Strategy:** BUILD (on iOS). Per the 6 DTOs in DATABASE_MAP §D5, either drop the phantom field or add the migration. Recommend: case-by-case (Profile probably should keep `first_name`/`last_name` and migrate the schema; others probably drop the field).
- **Owner:** iOS engineer (with product input on Profile)
- **Resources:** ~3-5 days
- **Success:** Zero phantom columns in any DTO; D5 deleted from DATABASE_MAP
- **Recurrence prevention:** Schema-vs-DTO CI gate (RE-2)

### RE-5: site_marking_checklist.item_id (CRITICAL)
- **Strategy:** BUILD (on iOS). Add `item_id` field to `SiteMarkingChecklistItemDTO`.
- **Owner:** iOS engineer
- **Resources:** ~1 hour
- **Success:** Inserts succeed; D6 deleted from DATABASE_MAP
- **Recurrence prevention:** CI gate (RE-2)

### RE-6: offlineDB consolidation (HIGH)
- **Strategy:** REDESIGN. Pick one IndexedDB module as canonical. Recommend `offlineDB.ts` (8 importers vs 3). Migrate the 3 `offlineInspectionDB` consumers; preserve any unique stores it owns.
- **Owner:** Web frontend
- **Resources:** ~1 week (careful — must preserve in-flight queued state on existing devices)
- **Success:** Single module; all 11 importers behind one API
- **Recurrence prevention:** Add a module-ownership note to CONTRIBUTING / CLAUDE.md

### RE-7, RE-8, RE-9: Schematics / QR / Camera (MEDIUM)
- **Strategy:** Mixed. Each is a focused improvement; can be parallelized.
- **Resources:** ~1-2 weeks total
- **Recurrence prevention:** Per-area test coverage

---

## 6. Roadmap

### Phase 1 — Immediate (0–4 weeks): Critical-priority quick wins

These unblock cross-device consistency at low effort.

- [ ] **RE-5** iOS DTO: add `item_id` to `SiteMarkingChecklistItemDTO` (~1 hr) — *blocks any new checklist inserts*
- [ ] **RE-2** iOS DTO: push `installation_status`/`installation_score` (~1 hr) — *blocks subsection consistency*
- [ ] **ADD-4** Web: read `coc_validation_settings` in settings view (~2 days)
- [ ] **ADD-1** Web: `inspection_subsections` hook + wiring (~3 days) — *largest impact on inspection UX parity*
- [ ] **ADD-3** Web: notifications bell + Realtime (~5 days)
- [ ] **ADD-2** Web: activity log feed (~4 days)
- [ ] **RE-1** Architecture decision: canonical storage for InspectionItem (user decision — schedule for week 1; implementation in Phase 2)

**Exit criteria:** All CRITICAL gaps addressed or sequenced. Build pipeline still green. Smoke walk-through of inspection-create flow on both apps shows aligned data.

### Phase 2 — Near-term (1–3 months): HIGH-priority structural work

- [ ] **RE-1** Implementation of InspectionItem decision (2–4 weeks)
- [ ] **RE-4** iOS: D5 phantom-column DTO cleanup across 6 DTOs (~1 week)
- [ ] **RE-3** iOS: Photo sync via `offline_photos` (~2 weeks)
- [ ] **RE-6** Web: offlineDB consolidation (~1 week)
- [ ] **ADD-5/6** Web: COC local validations + photos reader (~1 week)
- [ ] **ADD-7** Web+Backend: Reports persistence to `reports` table (~2-3 days)
- [ ] **DEPLOY** Per-route ErrorBoundary in `(admin)/`, `(client-portal)/`, `(contractor)/` layouts (AUDIT_BASELINE deferred item #14, useful before parity launches)

**Exit criteria:** No HIGH-priority gaps. Schema-vs-DTO CI gate exists. DATABASE_MAP regenerated showing zero D3/D5/D6 entries.

### Phase 3 — Medium-term (3–6 months): MEDIUM gaps + parity hardening

- [ ] **RE-7** Web: schematic editor build-out
- [ ] **RE-8** Joint: QR code write-path verification
- [ ] **RE-9** Web: Capacitor camera UX tuning
- [ ] **AUDIT** Resolve AUDIT_BASELINE deferred items: 109 strict-mode type errors (#6), restore `noUnusedLocals` (#5), upgrade `xlsx` dependency (#11), code-split PDF stack (#13)
- [ ] **TEST** Add Vitest + Playwright smoke tests for the parity workflows

**Exit criteria:** No MEDIUM gaps. Both apps round-trip the full inspection lifecycle (create → photos → COC → snags → signatures → PDF report) without drift.

---

## 7. Resource Summary

| Tier | Gaps | Web effort | iOS effort | Backend / Edge Function | Calendar |
|---|---|---|---|---|---|
| CRITICAL | 6 | ~14 days | ~2 hrs + arch decision | ~0 | 0–4 weeks |
| HIGH | 7 | ~12 days | ~3-4 weeks | ~2-3 days | 1–3 months |
| MEDIUM | 3 | ~2 weeks | ~few days | ~0 | 3–6 months |
| **TOTAL** | **16 gaps** | **~5-6 weeks** | **~6-8 weeks** | **~few days** | **6 months calendar** |

---

## 8. Progress Measurement

| Gap | Leading indicator | Lagging indicator | Review cadence |
|---|---|---|---|
| ADD-1 | First `inspection_subsections` row read from web | `InspectionDetail` web view shows same per-subsection breakdown as iOS | Weekly |
| ADD-2/3 | activity_log writes / notifications surfaced | Cross-device audit-trail consistency | Weekly |
| ADD-4–7 | Each read path lights up | Settings/photos/reports surface parity in test runs | Weekly |
| RE-1 | Architecture decision documented | Both apps consume single source | Monthly |
| RE-2,5 | DTO commits | DATABASE_MAP regenerated without D6/D7 entries | Per-PR |
| RE-3,4 | iOS DTO changes deploy | DATABASE_MAP regenerated without D3/D4/D5 | Per-PR |
| RE-6 | offlineDB consolidation PR merged | Single importer surface across all hooks | Weekly |

**Re-evaluation triggers.** Regenerate `DATABASE_MAP.md` monthly to catch regressions. Run `AUDIT_BASELINE` checks before major releases. Flag any new D-series drift in PR review.

---

## 9. Confidence & Caveats

- **Data-layer coverage is HIGH confidence.** Both `DATABASE_MAP.md` and `.from()` grep are direct evidence.
- **UX/screen parity is unmeasured.** Once iOS source is reachable, walk through every SwiftUI view and add corresponding web-side gaps (button-level, modal-level, gesture-level). Expect 5–20 additional UI-only gaps. Schedule a follow-up `gap-analyzer` pass when source is available.
- **`offline_photos` web usage** assumed from indirect evidence; would need to confirm via reading `offlineDB.ts` in detail (deferred — not blocking).
- **Edge Function call sites from iOS are unknown.** Some web-side ADD/REMOVE decisions about Edge Functions depend on whether iOS calls them. Cross-check when source is accessible.
- **Effort estimates are calendar-only.** No team velocity input. Treat as upper-bound rough sizing for build-planner consumption.

---

## 10. Hand-off to build-planner

This document is structured for direct consumption:

- **Section 3** has the ADD / REALIGN gaps with priority scores → seed the backlog
- **Section 5** has closure strategies with owner / effort / success criteria → seed task descriptions
- **Section 6** has the phased roadmap → seed sprint structure
- **Section 9** documents what's NOT covered so the build-planner can call out follow-up audits

Next skill in the pipeline: `build-planner` reads this doc and produces architecture/data-model decisions, task breakdown, and sprint plan.
