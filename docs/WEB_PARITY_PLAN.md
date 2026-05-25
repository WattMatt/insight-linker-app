# Web Parity Plan — insight-linker-app

> Sprint-able plan to bring the web app (Next.js 15 at https://insight-linker-app.vercel.app) to feature parity with the ECompliance iOS app on shared compliance workflows, while preserving the web-only differentiators that justify its separate existence.

**Date:** 2026-05-25
**Authors:** Audit + planning pipeline (codebase-audit-cleanup → gap-analyzer → build-planner → doc-coauthoring)
**Audience:** Web team, iOS team, PM
**Pipeline inputs:** [AUDIT_BASELINE.md](./AUDIT_BASELINE.md) · [PARITY_GAP_ANALYSIS.md](./PARITY_GAP_ANALYSIS.md) · [DATABASE_MAP.md](../../ECompliance%202/docs/DATABASE_MAP.md)

**Convention used throughout this doc:** `D1`–`D11` refer to drift items catalogued in [DATABASE_MAP §7 Drift Report](../../ECompliance%202/docs/DATABASE_MAP.md). "AUDIT deferred #N" refers to the 17 items in [AUDIT_BASELINE §Deferred](./AUDIT_BASELINE.md). When the plan says "the kickoff date", insert your team's actual Sprint 0 start date — all sprint windows in §5 are expressed relative to that.

---

## Executive Summary

The web app and iOS app share a Supabase backend but have drifted on coverage. Sixteen prioritized gaps separate them from cross-device parity on the core compliance workflow (sites → subsections → inspections → COC → signatures → reports).

**The plan** brings web and iOS to parity over ~13 weeks (six 2-week sprints + a 1-week Sprint 0). The web team owns 11 gaps (mostly read paths the web app never wired up plus one IndexedDB consolidation). The iOS team owns 4 small DTO-level fixes plus the photo-sync catch-up. One architectural decision — drop the orphan `inspection_items` table in favour of the `inspections.json_data` shape iOS already uses — unlocks the largest single gap with minimal code churn.

**The cost.** ~13 weeks calendar at **1.5 FTE web** (e.g., one senior + one mid, or two engineers at 0.75 FTE each) plus ~6-8 weeks of iOS effort delivered in two concentrated bursts on the iOS team's cadence. The plan deliberately bakes Sprint 6 as Tech Debt to clear the audit deferred items in the same window rather than push them out.

**What we deliberately don't change.** Web's admin, contractor portal, customer portal, public-token shares, OAuth/API surface, PDF template builder, and feedback workflows — all the features that have no iOS counterpart — stay as-is. They are why web exists alongside iOS.

**The biggest single risk** is iOS-team availability for RE-2/3/4/5. Sprint 0 includes a coordination check; if iOS can't commit in-window, web-side work still ships but cross-device parity is partial.

---

## 1. Context

### 1.1 The two apps, today

| | iOS app (ECompliance) | Web app (insight-linker-app) |
|---|---|---|
| Stack | Swift / SwiftUI / SwiftData | Next.js 15.3 App Router / React 18 / TS 5.8 |
| Backend | Supabase project `oltzgidkjxwsukvkomof` | Same Supabase project |
| Tables it persists to | 33 of 67 live tables | All 67 (via direct client + Edge Functions) |
| Strengths | Offline-first inspection workflow; native UX | Admin tooling; portals; OAuth/API; public sharing; PDF templating |
| Documentation status | Mapped in [DATABASE_MAP.md](../../ECompliance%202/docs/DATABASE_MAP.md) | Mapped in [AUDIT_BASELINE.md](./AUDIT_BASELINE.md) |

### 1.2 Parity framing — Hybrid (user-confirmed)

Two directions of parity, one default policy on each:

- **Core compliance workflows reach parity in both directions.** Sites, subsections, inspections, templates, COC, snags, signatures, photos, sync. Whichever side is ahead pulls the other up.
- **Web-only differentiators stay web-only.** All features that map to the 25 "web-only territory" tables flagged in [DATABASE_MAP §D1](../../ECompliance%202/docs/DATABASE_MAP.md) — the admin, contractor portal, customer portal, OAuth/API, validation conversations, PDF template builder, feedback workflows — remain untouched by this plan.

The "REMOVE" column of the gap analysis is intentionally empty.

### 1.3 What's locked

Tech stack, architecture, and data model are unchanging. No new framework choices, no new infrastructure. The plan adds rows to existing patterns: new hooks, new components, new schemas — no new layers. See [PARITY_GAP_ANALYSIS §1, dimensions 1-34](./PARITY_GAP_ANALYSIS.md) for the per-dimension current/desired assessment.

---

## 2. The Gap (at a glance)

Full prioritization in [PARITY_GAP_ANALYSIS §3](./PARITY_GAP_ANALYSIS.md). Summary:

| Gap | Type | Tier | Owner | Effort (buffered) |
|---|---|---|---|---|
| ADD-1 Inspection subsections hook + wiring | ADD | CRITICAL | Web | 5d |
| ADD-2 Activity log feed + write hooks | ADD | CRITICAL | Web | 7d (split S1/S2) |
| ADD-3 Notifications bell + Realtime | ADD | CRITICAL | Web | 6d |
| ADD-4 COC validation settings reader | ADD | CRITICAL | Web | 3d |
| RE-2 iOS subsection installation push | REALIGN | CRITICAL | iOS | 1h |
| RE-5 iOS site_marking_checklist.item_id | REALIGN | CRITICAL | iOS | 1h |
| ADD-5 COC local validations reader | ADD | HIGH | Web | 4d |
| ADD-6 COC compliance photos viewer | ADD | HIGH | Web | 4d |
| ADD-7 Reports persistence + dead-PDF-fn cleanup | ADD | HIGH | Web + Edge | 5d |
| RE-1 InspectionItem canonical = json_data; drop table | REALIGN | HIGH | Architecture + Backend | 1d (post-decision) |
| RE-3 iOS photo sync via offline_photos | REALIGN | HIGH | iOS | 2 weeks |
| RE-4 iOS D5 phantom-column DTO cleanup | REALIGN | HIGH | iOS | 1 week |
| RE-6 Web offlineDB consolidation | REALIGN | HIGH | Web | 7-10d |
| RE-7 Web schematics editor build-out | REALIGN | MED | Web | 8-10d |
| RE-8 QR codes write path verification | REALIGN | MED | Web + iOS | 2d |
| RE-9 Capacitor camera UX tuning | REALIGN | MED | Web | 3d |

**Web track total:** ~60-70 dev-days. **iOS track total:** ~25-30 dev-days. Cross-team coordination overhead not counted separately — assume ~10% of all efforts.

---

## 3. Architecture & Data Model Implications

No structural changes. The existing architecture (see [AUDIT_BASELINE §1 Critical Path Map](./AUDIT_BASELINE.md)) handles parity. New things land in existing folders following existing patterns. One new addition: a CI gate (Sprint 0).

### 3.1 New: schema-vs-DTO CI gate

A script in `scripts/check-schema-drift.ts` diffs the Postgres OpenAPI spec against the web Zod schemas and the iOS DTO field list (extracted from the DATABASE_MAP source). PR review fails when drift is detected. Catches D5/D6/D7-class drift at PR time instead of months later.

### 3.2 Schema changes (minimal)

| Decision | Affected | Action | Sprint |
|---|---|---|---|
| RE-1: canonical = `inspections.json_data` | `inspection_items` table (orphan) | Drop after zero-readers verified | 4 |
| RE-3: photo sync via `offline_photos` | iOS `Photo` model | iOS-side DTO + push/fetch path | 3-4 (iOS) |
| RE-4: D5 phantom columns | 6 iOS DTOs | iOS-side: drop field or add migration per case | 2-3 (iOS) |
| RE-5: `site_marking_checklist.item_id` | iOS `SiteMarkingChecklistItemDTO` | 1-field add | 0 (iOS) |

All other ADD gaps read existing tables — no schema work.

### 3.3 The RE-1 decision

**Canonical = `inspections.json_data` (iOS style). Deprecate the `inspection_items` table.**

Rationale: both apps currently have zero `.from('inspection_items')` readers (web grep confirms; iOS DATABASE_MAP §D3 confirms). iOS embeds inspection responses in `inspections.json_data` via `InspectionJsonSynthesizer`. The relational table is genuinely orphan from the app code. Dropping it removes a footnote and matches the offline-friendly single-row read both apps already do.

**Before the Sprint 4 migration, verify zero readers outside the app code:**

| Check | Where | How |
|---|---|---|
| Foreign keys pointing at `inspection_items` | Postgres `information_schema.referential_constraints` | SQL Editor query |
| Postgres triggers referencing the table | `information_schema.triggers` + `pg_trigger` | SQL Editor query |
| RLS policies on or referencing the table | `pg_policies` | SQL Editor query |
| BI / dashboard tools (Metabase, Retool, etc.) querying it | Each tool's saved queries | Manual sweep |
| Ad-hoc SQL in team notebooks / Slack history | — | Ask team in #data channel |
| Other Edge Functions querying it (besides web call sites) | `supabase/functions/*/index.ts` | `grep "inspection_items" supabase/functions/` |

If any of the above turns up a reader, escalate before the migration — the recreate-from-jsonb backfill is a project, not a one-line revert.

**Quarantine:** one week between rename-to-`_inspection_items_orphan` (Sprint 4 start) and final DROP (end of Sprint 4) gives external readers a chance to surface as errors.

---

## 4. Capacity & Calendar

### 4.1 Team assumption

| Role | Allocation | Capacity per 2-week sprint |
|---|---|---|
| Web frontend engineers | 1.5 FTE (e.g., 1 senior + 1 mid, or 2× 0.75 FTE) | ~15 dev-days of shippable work |
| iOS engineer | Delivered in two concentrated bursts on iOS-team cadence (not 0.25 FTE smeared): **Burst A** ~1.5 weeks for RE-2/5/4 around web Sprint 0-2; **Burst B** ~2 weeks for RE-3 around web Sprint 3-4 | — |
| Backend / Edge Function engineer | ~0.1 FTE (touches Sprint 4 only) | ~1 dev-day in S4 |
| PM (coordination + open-items resolution) | ~0.2 FTE | — |

**Web sprints target ≤15 dev-days of work each.** Reviewer time, PR review, merge-and-deploy, meetings are baked into the FTE — they are not extra capacity that produces code.

### 4.2 Calendar

| Sprint | Window | Theme |
|---|---|---|
| 0 | Week 1 | Foundation (coordination, CI gate, iOS quick fixes) |
| 1 | Weeks 2-3 | CRITICAL parity reads |
| 2 | Weeks 4-5 | CRITICAL writes + notifications |
| 3 | Weeks 6-7 | HIGH parity adds + offlineDB consolidation start |
| 4 | Weeks 8-9 | Reports + schematic editor + tests + RE-1 migration |
| 5 | Weeks 10-11 | Medium gaps + iOS verification + cross-device walkthroughs |
| 6 | Weeks 12-13 | Tech debt (AUDIT_BASELINE deferred items) |

### 4.3 Honest sizing notes

- The plan assumes 1.5 FTE web. At 1.0 FTE the calendar extends to ~17 weeks. At 2.0 FTE it compresses to ~9 weeks but cross-engineer coordination overhead grows.
- Total web work across S1-S6 sums to **80 dev-days**; 1.5 FTE × 6 sprints × 10 = 90 capacity. **~11% slack** — workable but not generous. Earlier-sprint slip cascades unless absorbed into Sprint 6 (tech debt drop).
- Sprints **3 and 5 are at capacity (15d each)**. Sprint 4 (13d) and Sprint 2 (11d) carry the natural slack.
- Sprint 6 (tech debt) is the explicit "drop if parity work runs long" stretch — defer to a separate cycle if Sprints 1-5 slip.

---

## 5. Sprint Plan

### 5.1 Sprint 0 — Foundation (Week 1)

Goal: clear runway. No new features.

| Task | Owner | Effort | Why this sprint |
|---|---|---|---|
| Fix `next lint` flat-config incompatibility (AUDIT_BASELINE deferred #7) | Web | 0.5d | Without lint, parity-track PRs add to the debt |
| Build schema-vs-DTO CI gate (`scripts/check-schema-drift.ts`) | Web + iOS | 2d | Prevents D5/D6/D7 recurrence as parity work churns DTOs |
| iOS coordination handshake: confirm RE-2/3/4/5 bandwidth | PM + iOS | 0.5d | Sprint-plan realism check |
| Confirm RE-1 decision (canonical = `inspections.json_data`) | User + Architecture | 0.25d | Unblocks Sprint 4 migration |
| Land iOS RE-5 (`item_id`) and RE-2 (push installation_*) — both 1-hour fixes | iOS | 0.5d | Removes two D-entries from DATABASE_MAP early |

**Exit criteria.** Lint runs. CI gate exists (stub OK). iOS commits for RE-2 and RE-5 in. RE-1 decision documented in the [Decision Log](#10-decision-log).

### 5.2 Sprint 1 — CRITICAL parity reads (Weeks 2-3)

Goal: web sees what iOS sees.

| Gap | Owner | Effort |
|---|---|---|
| ADD-4 COC validation settings reader | Web | 3d |
| ADD-1 `inspection_subsections` hook + wiring | Web | 5d |
| ADD-2 Activity log read path (sidebar feed) | Web | 4d |
| Cross-device smoke check after each ship | Web | 1d |

**Sprint total:** 13d. **Exit:** three CRITICAL reads shipped; cross-device data consistency visible to a tester.

### 5.3 Sprint 2 — CRITICAL writes + notifications (Weeks 4-5)

| Gap | Owner | Effort |
|---|---|---|
| ADD-2 Activity log write hooks (wrap all mutation entry points) | Web | 3d |
| ADD-3 Notifications bell + Supabase Realtime | Web | 6d |
| Per-route `ErrorBoundary` in (admin), (client-portal), (contractor) layouts (AUDIT_BASELINE deferred #14) | Web | 2d |

**Sprint total:** 11d. **Exit:** activity logging on every web mutation; notifications live within 5 seconds of insert; render errors no longer blank the whole app.

### 5.4 Sprint 3 — HIGH parity adds + offlineDB consolidation start (Weeks 6-7)

| Gap | Owner | Effort |
|---|---|---|
| ADD-5 COC local validations reader | Web | 4d |
| ADD-6 COC compliance photos viewer + uploader | Web | 4d |
| RE-6 offlineDB consolidation (full: merged module + migration script + device-test on seeded queue) | Web | 7d |

**Sprint total:** 15d (at capacity, no slack). **Exit:** COC visibility parity reached; consolidated offlineDB module shipped behind a feature flag for staged rollout.

### 5.5 Sprint 4 — Reports + schematics + tests + RE-1 (Weeks 8-9)

| Gap | Owner | Effort |
|---|---|---|
| ADD-7 Reports persistence + deprecate the 3 dead `generate-pdf-*` Edge Functions (AUDIT Pass 3 finding) | Web + Edge | 5d |
| RE-7 Schematics editor build-out (begin — first half) | Web | 5d (RE-7 total ~10d, finishes in S5) |
| Vitest + Playwright scaffold + smoke tests for ADD-1/ADD-2/ADD-3 (AUDIT deferred #15) | Web | 2d (scaffold here; deeper coverage in S5) |
| RE-1 migration: drop `inspection_items` table once zero readers verified | Backend | 1d |

**Sprint total:** 13d. **Exit:** reports cross-device; test scaffold in place with smoke tests for the CRITICAL ADDs; orphan table dropped.

### 5.6 Sprint 5 — Medium + iOS verification + walkthroughs (Weeks 10-11)

| Gap | Owner | Effort |
|---|---|---|
| RE-7 schematics editor (finish — second half) | Web | 5d |
| RE-8 QR code write-path verification | Web + iOS | 2d |
| RE-9 Capacitor camera UX tuning | Web | 3d |
| Verify iOS RE-3, RE-4 landed; regenerate DATABASE_MAP. If iOS gaps remain, document as acknowledged debt (does NOT block exit). | iOS + PM | 2d |
| End-to-end cross-device parity walkthroughs (full inspection lifecycle); deeper Playwright coverage | QA + Web | 3d |

**Sprint total:** 15d. **Exit:** all 16 gaps closed on web-controllable items. iOS-side RE-3/RE-4 either landed or explicitly accepted as remaining debt with a target date. DATABASE_MAP D-series count reduced (D8/D9/D10/D11 remain as informational).

### 5.7 Sprint 6 — Tech debt (Weeks 12-13)

Goal: clear AUDIT_BASELINE deferred items in the same window. Treat as stretch — defer to a separate cycle if Sprint 5 slipped.

| Item | Effort |
|---|---|
| Deferred #5: restore `noUnusedLocals` + clean 326 unused imports (eslint `--fix` first) | 2d |
| Deferred #6: resolve 109 strict-mode type errors; remove `ignoreBuildErrors` | 5d |
| Deferred #10: console statement sweep (561 → ~50 dev-guarded) | 2d |
| Deferred #11: replace `xlsx` (Prototype Pollution + ReDoS, no fix available) | 2d |
| Deferred #13: code-split PDF stack out of route bundles (`/review/[token]`, deep `/sites/.../inspections/[id]`) | 2d |

**Sprint total:** 13d. **Exit:** strict-mode restored; no high-severity npm vulns; heavy routes under 600 kB First Load.

### 5.8 Parallel infrastructure track

Across all sprints, ~10-20% of one engineer:

- AUDIT_BASELINE deferred #1: rotate Supabase anon key (target a Sprint 3 low-traffic window).
- AUDIT_BASELINE deferred #3: verify rate limiting on `verify_jwt = false` Edge Functions, esp. `extract-coc` (Gemini-calling, cost-attack vector).
- AUDIT_BASELINE deferred #12: plan dependency modernization (Capacitor 7→8 first, React/Next later — separate cycle).
- Partial RLS audit via `get_rls_policies_for_role` RPC (covers some of deferred #2 without service_role).

---

## 6. Per-Gap Detail (User Stories + Acceptance Criteria)

Each block: who benefits, what success looks like in observable terms, what depends on it. Use these to scope individual PRs.

### 6.1 ADD-1: Inspection subsections hook + wiring

> As an inspector reviewing an existing inspection, I want to see the same per-subsection breakdown on web that I see on iOS so cross-device handoffs don't lose context.

- `useInspectionSubsections(inspectionId)` reads `inspection_subsections` with joined `subsections(*)`, `inspections(*)`.
- `InspectionDetail` view renders one row per subsection (status, score, last-update).
- `Inspections` list shows per-subsection rollup count.
- IndexedDB adds an `inspection_subsections` store + sync wiring via `useOfflineSync`.
- Smoke: an inspection created on iOS with three subsections shows three rows on web.

**Complexity:** L · **Depends on:** Sprint 0 lint fix · **Owner:** Web frontend.

### 6.2 ADD-2: Activity log

> As an admin or inspector, I want a chronological log of changes across sites and inspections so I can audit work and onboard team members.

**Split across two sprints. S1 (read path, 4d):**
- `useActivityLog(scope?)` hook reads from `activity_logs` table.
- Sidebar feed shows last 50 entries with scope filter (Site / Inspection / Subsection).
- Cross-device verification: an iOS-originated action that writes to `activity_logs` surfaces in the web feed within one refresh.

**S2 (write hooks, 3d):**
- `logActivity(type, payload)` helper.
- All create/update/delete on sites, subsections, inspections, snags emit `activity_logs` rows from web.

**Complexity:** M · **Depends on:** None for S1 read; iOS already writes (per DATABASE_MAP). S2 write hooks have no external dep · **Owner:** Web frontend.

### 6.3 ADD-3: Notifications

> As a user, I want in-app notifications for relevant events without polling.

- Notification bell in `(admin)/layout.tsx` header with unread badge.
- `useNotifications()` subscribes via `supabase.channel().on('postgres_changes')` filtered to current user.
- Popover shows recent items; click marks read and navigates if URL present.
- E2E: a row inserted via SQL appears in the bell within five seconds.

**Complexity:** L · **Depends on:** Existing `(admin)/layout.tsx` shell (already in place) · **Owner:** Web frontend · **Watch:** Realtime quota.

### 6.4 ADD-4: COC validation settings reader

> As an admin, I want to see (and if permitted, edit) the COC validation thresholds the iOS app already respects.

- `useCOCValidationSettings()` reads `coc_validation_settings`.
- `Settings` view shows a "COC Validation" tab displaying current rules.
- Read for all roles; write for Admin only (RLS gates this; verify in Sprint 4 audit).
- Cross-device verification: edits on iOS appear on web within a refresh.

**Complexity:** S · **Depends on:** None · **Owner:** Web frontend.

### 6.5 ADD-5: COC local validations reader

> As an inspector or admin, I want to review locally-recorded COC validation results from iOS on the desktop.

- `useCOCLocalValidations(subsectionId)` hook.
- COC tab on `SubsectionDetail` lists `coc_local_validations` rows when present.
- Add Zod schema for the validation result shape to `validation-schemas.ts`.
- Ships in *display-when-present* mode: render whatever fields the row actually contains. The five D5 phantom columns (`coc_form_type`, `mcb_rating_a`, `mcb_type`, `breaker_capacity_ka`, `earth_leakage_ma`) are NOT requested in the select until iOS-side RE-4 cleanup confirms canonical shape. Adding them later is a one-line `select()` change.

**Complexity:** M · **Depends on:** None for initial ship · **Soft dependency:** iOS RE-4 for the full field set · **Owner:** Web frontend.

### 6.6 ADD-6: COC compliance photos fuller integration

> As an inspector, I want to see all COC-linked photos in the web inspection view.

- `coc_compliance_photos` integrated into `SubsectionDetail` COC tab as a gallery.
- Photo URLs resolved via existing `imageUrlResolver`.
- Web → Supabase Storage → `coc_compliance_photos` row upload path works.
- Cross-device: iOS uploads show on web and vice versa.

**Complexity:** M · **Depends on:** ADD-5 (same view) · **Owner:** Web frontend.

### 6.7 ADD-7: Reports persistence

> As a web user generating a PDF report, I want it persisted to `reports` so I can find it later and iOS users see it too.

- After successful Edge Function PDF generation, insert into `reports` (uploaded_url, metadata, generated_by, generated_at).
- A new web `Reports` view reads from `reports` (currently zero readers).
- iOS already reads from `reports`; cross-device verification confirms a web-generated PDF appears in iOS list.
- Same PR deprecates the 3 dead `generate-pdf-{browserless,google,pdfmake}` Edge Functions identified in [AUDIT_BASELINE Pass 3](./AUDIT_BASELINE.md).

**Complexity:** M · **Depends on:** Confirm which `generate-pdf` Edge Function is canonical · **Owner:** Web frontend + Edge.

### 6.8 RE-1: InspectionItem canonical storage

**Decision (Sprint 0 to confirm):** canonical = `inspections.json_data`. Drop `inspection_items` table after Sprint 4 zero-reader verification.

- Web grep confirms zero `.from('inspection_items')` (already true today).
- iOS DATABASE_MAP regenerated confirms no SwiftData write to it (DATABASE_MAP §D3 already confirms).
- Migration drops the table with backup-snapshot convention per [DATABASE_MAP §D11](../../ECompliance%202/docs/DATABASE_MAP.md).
- DATABASE_MAP D3 entry removed.

**Complexity:** S (decision) + 1d (migration) · **Owner:** Architecture + Backend.

### 6.9 RE-2: iOS subsection installation push

- `SubsectionPushDTO` includes `installation_status` and `installation_score`.
- Source comment claiming "columns do not exist on Supabase" corrected.
- CLAUDE.md outdated claim about a 2026-04-11 fix removed.
- DATABASE_MAP D7 entry removed.

**Complexity:** XS · **Owner:** iOS.

### 6.10 RE-3: iOS photo sync via `offline_photos`

- iOS `Photo` model gains DTO + push/fetch paths against `offline_photos` (polymorphic `context_type`/`context_id`).
- Existing device-local photos migrated.
- DATABASE_MAP D4 entry removed.

**Complexity:** L · **Owner:** iOS · **Calendar:** ~2 weeks.

### 6.11 RE-4: iOS D5 phantom-column DTO cleanup

Per [DATABASE_MAP §D5](../../ECompliance%202/docs/DATABASE_MAP.md):

| DTO | Resolution |
|---|---|
| `SnagDTO` | Drop `rectification_photo_url`, `derived_from_rule`. Map to `rectification_photos` (jsonb) + `closeout_photo_url`. |
| `SiteMarkingChecklistItemDTO` | Drop `item_type`; add `item_id` (paired with RE-5). |
| `COCLocalValidationDTO` | Drop the 5 fields that have no backing column. |
| `SubsectionDocumentDTO` | Drop `created_at`, `updated_at`; map to `uploaded_at`. |
| `SiteAssetDTO` | Replace `type` with `asset_category` (enum). |
| `ProfileDTO` | **Decision needed**: keep `first_name`/`last_name` and migrate the schema, OR drop the fields and use `full_name` only. Recommended: migrate (user-facing separation matters). |

**Complexity:** M · **Owner:** iOS · **Calendar:** ~1 week (Profile decision pending).

### 6.12 RE-5: iOS `site_marking_checklist.item_id`

- DTO includes `item_id` field.
- Inserts succeed (`item_id` is NOT NULL with no default — currently violated).
- DATABASE_MAP D6 entry removed.

**Complexity:** XS · **Owner:** iOS · **Lands:** Sprint 0.

### 6.13 RE-6: Web offlineDB consolidation

- Single canonical IndexedDB module — recommend `offlineDB.ts` (8 importers vs `offlineInspectionDB.ts`'s 3).
- The 3 `offlineInspectionDB` consumers (`PlatformCapabilityTester`, `useOfflineInspectionDetail`, `OfflineSyncTest`) migrated.
- Stores unique to `offlineInspectionDB` (`inspection_cache`, `inspection_images`, `template_cache`) preserved in the merged module.
- Migration script reads both DBs on first boot of new code, merges into canonical — **in-flight queued mutations on existing devices must not be lost.**
- After migration, `offlineInspectionDB.ts` deleted.

**Complexity:** L · **Owner:** Web · **Watch:** Existing-user data loss risk if migration script is wrong. Staged rollout via feature flag; tested rollback path.

### 6.14 RE-7: Schematics editor build-out

- Schematic view supports create/edit/delete of `schematic_blocks` per `site_schematics` parent.
- DATABASE_MAP §D9 jsonb decode hazard audited: `site_schematics.detected_regions` handled cleanly.
- Cross-device parity: web edits visible on iOS and vice versa.

**Complexity:** XL · **Owner:** Web.

### 6.15 RE-8: QR code write path verification

- Audit the QR code create path (`qr-redirect` Edge Function is invoked; no `.from('qr_codes')` from web).
- Confirm or fix parity with iOS `QRCodeRecord` lifecycle.

**Complexity:** S · **Owner:** Web + iOS verification.

### 6.16 RE-9: Capacitor camera UX tuning

- Multi-shot capture, EXIF preserved, immediate-review modal — match iOS native as closely as Capacitor allows.

**Complexity:** S · **Owner:** Web.

---

## 7. New Code Conventions

Existing project structure (per [AUDIT_BASELINE §1](./AUDIT_BASELINE.md)) is unchanged. New parity work lands as follows.

| Thing | Path |
|---|---|
| New `useOffline*` / `use<Domain>` hooks (ADD-1, ADD-2, ADD-3, ADD-4, ADD-5) | `src/hooks/` — one file per hook |
| New Zod schemas | Extend `src/lib/validation-schemas.ts` (currently 7 schemas, target ~25 across the build) |
| Notifications bell | `src/components/NotificationsBell.tsx` (sibling of existing `NotificationListener`) |
| Activity log feed | `src/components/ActivityLogFeed.tsx` |
| Per-route ErrorBoundary | Inline in each `(group)/layout.tsx` using existing `ErrorBoundary` |
| Schema-vs-DTO CI gate | `scripts/check-schema-drift.ts` (new `scripts/` folder) |
| Tests | `tests/parity/*.spec.ts` (Playwright E2E) + `src/**/__tests__/*.test.ts` (Vitest unit) |

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| iOS team can't commit to RE-2/3/4/5 within plan window | MED | HIGH | Sprint 0 coordination handshake. If blocked: web work still ships ADD-1, ADD-2, ADD-3, ADD-4, ADD-6, ADD-7, RE-6, RE-7, RE-9 (web-only). ADD-5 ships in *display-when-present* mode (D5 phantom columns hidden) and is upgraded once iOS RE-4 lands. Sprint 5 exit is explicit that iOS-side gaps remaining = acknowledged debt, not a blocker. |
| RE-6 offlineDB migration loses queued mutations on existing devices | MED | HIGH | Migration script reads both DBs and merges; feature-flagged staged rollout; rollback path tested before rollout |
| Sprint efforts exceed 1.3 FTE capacity; sprints slip | MED | MED | Sprint 5 has 4-day slip-absorption buffer; Sprint 6 (tech debt) is the explicit "drop if needed" stretch goal |
| `xlsx` replacement (Sprint 6 / AUDIT-11) is non-trivial because call-site shape changes | MED | MED | Time-box at 2d; if it bleeds, accept the vuln short-term with explicit risk acceptance |
| RE-1: dropping `inspection_items` breaks an iOS or external reader nobody surfaced | LOW | HIGH | Sprint 4 gate: explicit grep + DATABASE_MAP regeneration + 1-week quarantine period before drop |
| Schema-vs-DTO CI gate produces noise / false positives | MED | LOW | Launch in warning-only mode; tighten to blocking after one full sprint of real signal |
| Supabase Realtime quota under load | LOW | MED | Subscribe filtered to user_id only; quota check during Sprint 2; fallback to polling if needed |
| End-to-end cross-device tests need real test users + data | MED | MED | Sprint 4 builds seed scripts; Sprint 5 uses dedicated test accounts |
| Brittle area — PDF generation stack (5 Edge Functions, 21 lib files; see AUDIT_BASELINE Known Brittle Areas) | HIGH | MED | This plan touches PDF only via ADD-7 (persist) and Sprint 6 code-split. No refactoring of generation logic. |
| Brittle area — Capacitor + dynamic-route mismatch | LOW | LOW | Plan doesn't change Capacitor config. If RE-9 surfaces issues, defer with explicit ticket. |

---

## 9. Open Items (Resolve by Sprint 0)

1. iOS team bandwidth confirmed for ~6-8 weeks of iOS effort spread across Sprints 0-5?
2. RE-1 decision confirmed: drop `inspection_items` table after Sprint 4 zero-reader verification? (Recommendation in plan; user can override.)
3. Profile schema decision (RE-4): migrate to add `first_name`/`last_name`, or drop those fields from iOS DTO and use `full_name` only?
4. Anon key rotation timing (AUDIT_BASELINE deferred #1): target a low-traffic Sprint 3 window?
5. Test infrastructure choice confirmed as Vitest + Playwright? (Standard for Next.js; baked in unless overridden.)
6. If Sprint 5 slips, which Sprint 6 items get dropped? Recommendation: keep deferred #6 (109 type errors) and deferred #11 (xlsx security) as non-negotiable; drop the rest if needed.

---

## 10. Decision Log

| # | Decision | Rationale | Date | Reversible? |
|---|---|---|---|---|
| 1 | Hybrid parity model | Core compliance workflows reach parity both ways; web-only differentiators (API/portals/templates/feedback) preserved | 2026-05-25 | Yes (but would invalidate this plan) |
| 2 | RE-1: `inspections.json_data` canonical; drop `inspection_items` table | Both apps have zero readers of the table today (web grep + DATABASE_MAP §D3); iOS already on json_data; lowest-churn path | 2026-05-25 | Yes — could re-introduce table later if analytics need emerges |
| 3 | 1.5× effort buffer baked into estimates | Real-world parity work surfaces scope; tight estimates cascade slip across sprints | 2026-05-25 | No (structural to plan) |
| 4 | Sprint 6 = Tech Debt (not infrastructure) | AUDIT_BASELINE deferred items grouped to amortize context-switching; explicit stretch goal | 2026-05-25 | Yes — could distribute across sprints |
| 5 | Schema-vs-DTO CI gate as Sprint 0 deliverable | Prevents D5/D6/D7 recurrence; pays for itself within one drift catch | 2026-05-25 | Yes — could defer, losing the prevention value |
| 6 | Test infra adopted in Sprint 4, not Sprint 0 | Tests for features that don't exist yet are wasted; smoke tests added once parity surfaces stabilize | 2026-05-25 | Yes — could front-load if team prefers TDD |
| 7 | Notifications uses Supabase Realtime, not polling | Cross-device parity story; matches iOS push experience as closely as web allows | 2026-05-25 | Yes — degrade to polling if Realtime quota concerns surface |
| 8 | Plan sized for ~1.3 FTE web (1 FE + 0.3 senior) | Sprint totals (~13 dev-days each) reflect the realistic capacity of this staffing; 1.0 FTE extends calendar to ~17 weeks | 2026-05-25 | Yes — scale up team or extend timeline |

---

## 11. Progress Tracking

| Signal | What to watch | Owner | Cadence |
|---|---|---|---|
| DATABASE_MAP D-series count | Should drop from current (D1-D11) to D8/D9/D10/D11 informational-only by end of Sprint 5 | PM | Monthly regeneration |
| Schema-vs-DTO CI gate output | Warnings → blocking transition mid-plan (around Sprint 3) | Web senior | Per-PR |
| Sprint burn-down vs ≤15 dev-days target | Slippage compounds; triage RE-7 first if Sprint 4 burns hot | Web team lead | Weekly stand-up |
| Cross-device smoke (manual: create inspection on iOS, view on web) | Should be clean by end of Sprint 1; full inspection lifecycle by Sprint 5 | QA + Web | Per-sprint end |
| AUDIT deferred #2 (RLS audit) — partial coverage via `get_rls_policies_for_role` RPC | Coverage report | Web (infra track) | Sprint 3 milestone |
| `npm audit` count | Should drop from current 16 (8 high, 8 moderate) to ≤4 moderate by end of Sprint 6 | Web senior | Weekly |

---

## Appendix: Related Documents

- [AUDIT_BASELINE.md](./AUDIT_BASELINE.md) — current state of the web codebase as of 2026-05-25
- [PARITY_GAP_ANALYSIS.md](./PARITY_GAP_ANALYSIS.md) — per-dimension gap measurement and prioritization that this plan executes against
- [DATABASE_MAP.md](../../ECompliance%202/docs/DATABASE_MAP.md) — shared backend (67 Postgres objects); referenced for D-series drift items
