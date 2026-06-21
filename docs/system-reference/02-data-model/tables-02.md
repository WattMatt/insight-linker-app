# Data Model — Tables (batch 02)

Effective-schema reference for: `coc_validation_settings`, `coc_validations`, `contractor_coc_uploads`, `document_categories`, `file_sync_logs`, `floor_plan_pin_comments`, `floor_plan_pins`, `inspection_items`, `inspection_relink_audit`, `inspection_signatures`, `inspection_subsections`, `inspection_templates`.

Effective state = replay of all migrations in chronological order (later events override earlier), then the dashboard-applied tier-2 lockdown SQL (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`) treated as applied last. RLS policy *bodies* are documented elsewhere; only policy NAMES are listed here.

**Tier-2 lockdown effect (applied 2026-06-11, prod, outside migrations dir):** the SQL in `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` scans `pg_policies` and, for every `public` table (except `settings`), drops every `SELECT` policy whose `qual='true'` and whose roles are `{public}` or include `anon`, then creates `auth_read_<table>` (`FOR SELECT TO authenticated USING (true)`). Among the tables in this batch this demotes the anon-readable `USING(true)` SELECT policies on `coc_validations`, `document_categories`, `floor_plan_pins`, and `inspection_templates` to authenticated-only and adds `auth_read_<table>` to each. Cited inline per table.

---

## coc_validation_settings

**Purpose.** Singleton configuration table for COC (Certificate of Compliance) validation: numeric thresholds, per-rule enable toggles, auto-fail switches, pass/fail counters, and AI model settings. Created in `supabase/migrations/20260116052034_3ec8c385-2428-402e-9763-a9871451eb55.sql:2`; the same migration seeds one default row (`:INSERT INTO public.coc_validation_settings (id) VALUES (gen_random_uuid())`). **No application or edge-function call site** — repo-wide grep for `coc_validation_settings` returns only the migration and `types.ts`. ⚠️ UNVERIFIED whether any live code reads/writes this table; it may be orphaned or read under an indirection not found by name.

**Effective columns** (all from `20260116052034`, table create):

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) |
| earth_continuity_max_ohms | numeric | no | 5.0 | |
| insulation_resistance_min_mohms | numeric | no | 0.25 | |
| rcd_trip_1x_max_ms | integer | no | 300 | |
| rcd_trip_5x_max_ms | integer | no | 150 | |
| rcd_trip_max_ms | integer | no | 40 | |
| coc_expiry_domestic_years | integer | no | 5 | |
| coc_expiry_commercial_years | integer | no | 2 | |
| ai_confidence_threshold_percent | integer | no | 30 | |
| hierarchy_check_enabled | boolean | no | true | |
| earth_continuity_check_enabled | boolean | no | true | |
| insulation_resistance_check_enabled | boolean | no | true | |
| protective_conductor_check_enabled | boolean | no | true | |
| certificate_date_validation_enabled | boolean | no | true | |
| rcd_function_check_enabled | boolean | no | true | |
| signature_check_enabled | boolean | no | true | |
| auto_fail_missing_initial_ref | boolean | no | true | |
| auto_fail_invalid_certificate | boolean | no | true | |
| auto_fail_future_dated | boolean | no | true | |
| auto_fail_earth_resistance_threshold | boolean | no | true | |
| auto_fail_missing_signature | boolean | no | true | |
| mandatory_failures_for_fail | integer | no | 2 | |
| safety_critical_failures_for_fail | integer | no | 1 | |
| ai_model | text | no | 'google/gemini-3-pro-preview' | |
| ai_temperature | numeric | no | 0.1 | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| updated_by | uuid | yes | — | auth.users(id) |

**Constraints / indexes / unique keys.** PK on `id`. No other constraints, no extra indexes, no unique keys.

**RLS enabled:** yes (`20260116052034`). Policies (names only):
- `Admins can manage COC validation settings`
- `Authenticated users can read COC validation settings`

**Triggers.** `update_coc_validation_settings_updated_at` — `BEFORE UPDATE … EXECUTE FUNCTION public.update_updated_at_column()` (`20260116052034`).

**types.ts cross-check** (`src/integrations/supabase/types.ts:767`). All 28 columns match; `Relationships: []` (no FK is surfaced for `updated_by`, consistent with the generator omitting `auth.users` refs). No discrepancy.

**Notable history.** Created and seeded in a single migration; no later alterations.

---

## coc_validations

**Purpose.** One validation result per COC document — status, violations JSON, and full report JSON. Read in the compliance dashboard (`src/components/ComplianceDashboard.tsx:175` `.from('coc_validations')`) and written by the `validate-coc` edge function (`supabase/functions/validate-coc/index.ts:1044`, `:1719`).

**Effective columns** (create in `supabase/migrations/20251016111626_9fa96ad4-bc65-4ec9-b54f-41023f815b12.sql`; `report_data` added in `20251016113024`):

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) |
| document_id | uuid | no | — | subsection_documents(id) ON DELETE CASCADE; UNIQUE |
| subsection_id | uuid | no | — | subsections(id) ON DELETE CASCADE |
| status | text | no | — | CHECK (see below) |
| violations | jsonb | yes | '[]'::jsonb | |
| validated_at | timestamptz | no | now() | |
| validated_by | uuid | yes | — | auth.users(id) |
| created_at | timestamptz | no | now() | |
| report_data | jsonb | yes | NULL | (added `20251016113024`) |

**Constraints / indexes / unique keys.**
- PK on `id`.
- `UNIQUE(document_id)` (table create).
- CHECK `coc_validations_status_check`: effective value set is `('Pass','Fail','Pending','Error','Incomplete')`. Originally `('Pass','Fail','Pending','Error')` (`20251016111626`); dropped and recreated to add `'Incomplete'` in `20251016113423`.
- Indexes: `idx_coc_validations_document_id` on `(document_id)`; `idx_coc_validations_subsection_id` on `(subsection_id)` (both `20251016111626`).

**RLS enabled:** yes (`20251016111626`). Effective policies (names only):
- `All authenticated users full access to coc_validations` (FOR ALL; `20251120080517`)
- `auth_read_coc_validations` (added by the 2026-06-11 tier-2 SQL, replacing the dropped anon-readable `Public can view coc_validations`)

⚠️ Tier-2 note: `Public can view coc_validations` (`FOR SELECT USING(true)`, anon-readable) was created in `20260123052442` and is dropped + replaced by `auth_read_coc_validations` by `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`.

**Triggers.** None.

**types.ts cross-check** (`src/integrations/supabase/types.ts:860`). Columns match. types.ts marks `coc_validations_document_id_fkey` `isOneToOne: true` (consistent with `UNIQUE(document_id)`). No discrepancy.

**Notable history.** `report_data` added `20251016113024`. Status CHECK widened to include `'Incomplete'` (`20251016113423`). Policy churn: initial `authenticated`-gated CRUD policies dropped in `20251119090820` (replaced by Admin + Contractor policies), then those dropped in `20251120080517` and replaced by the blanket `All authenticated users full access` policy; anon `Public can view` added `20260123052442` then removed by tier-2.

---

## contractor_coc_uploads

**Purpose.** Inbox for contractor-submitted COC files keyed by free-text `project_id` + `section_name` (not a UUID FK to sites/subsections in the migration). Created in `supabase/migrations/20260410013045_e3990969-d3ba-4378-94ca-bfa2e8d541b3.sql:12`. **No application or edge-function call site** — repo-wide grep returns only the migration and `types.ts`. ⚠️ UNVERIFIED that any live code uses it.

**Effective columns** (migration `20260410013045`):

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) |
| project_id | text | no | — | |
| section_name | text | no | — | |
| file_url | text | no | — | |
| file_name | text | yes | — | |
| contractor_email | text | yes | — | |
| notes | text | yes | — | |
| status | text | no | 'submitted' | |
| submitted_at | timestamptz | yes | now() | |

**Constraints / indexes / unique keys.** PK on `id` only. No CHECK constraints, no indexes, no unique keys, no FKs (per `20260410013045`).

**RLS enabled:** yes (`20260410013045`). Policies (names only):
- `allow read` (FOR SELECT, no `TO` role → PUBLIC incl. anon, `USING(true)`)
- `allow insert` (FOR INSERT, no `TO` role → PUBLIC incl. anon, `WITH CHECK(true)`)
- `allow update` (FOR UPDATE, no `TO` role → PUBLIC incl. anon, `USING(true)`, **no `WITH CHECK`**)

No DELETE policy exists. ⚠️ Tier-2 note: the `allow read` policy is `SELECT … USING(true)` defaulting to `{public}`, so the 2026-06-11 tier-2 SQL would drop it and create `auth_read_contractor_coc_uploads` (authenticated-only). ⚠️ UNVERIFIED against the actual prod `pg_policies` snapshot — recorded as the mechanical effect of the SQL's selection predicate.

**Triggers.** None.

**types.ts cross-check** (`src/integrations/supabase/types.ts:965`). **⚠️ DISCREPANCY (types.ts vs migrations):** types.ts lists three columns absent from the migration: `legend_card_id` (`string | null`), `site_id` (`string | null`), `subsection_id` (`string | null`). These do not appear in any migration in the event log; they were added to the live DB outside the migrations directory. `Relationships: []` in types.ts (no FK surfaced for the extra UUID-like columns).

**Notable history.** Single create migration; the migration also adds 6 columns to `snags` (out of scope here). No later alterations in-tree.

---

## document_categories

**Purpose.** Named, ordered document-category buckets under a subsection (drives the document-upload UI grouping). Read in report generation, e.g. `src/components/ComprehensiveInspectionReport.tsx:276` `.from('document_categories')` and `src/lib/pdfmakeInspectionReport.ts:1598`.

**Effective columns** (create `supabase/migrations/20251014140001_3adc740c-7446-410a-a427-957d649c4e3c.sql`):

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) |
| subsection_id | uuid | no | — | subsections(id) ON DELETE CASCADE |
| name | text | no | — | |
| order_index | integer | no | 0 | |
| created_at | timestamptz | no | now() | |
| is_system | boolean | no | false | locks app-managed report/COC categories from the Documents-tab UI (20260621120000) |

**Constraints / indexes / unique keys.** PK on `id`. FK on `subsection_id`. No CHECK, no extra indexes, no unique keys.

**RLS enabled:** yes (`20251014140001`). Effective policies (names only):
- `Admins can manage all document categories` (`20251120110544`)
- `Clients can view document categories for their sites` (`20251120110544`)
- `Contractors can view document categories for assigned sites` (`20251120110544`)
- `Users can manage all document categories` (`20251120111033`)
- `auth_read_document_categories` (added by 2026-06-11 tier-2 SQL, replacing the dropped anon-readable `Public can view document categories`)

⚠️ Tier-2 note: `Public can view document categories` (`FOR SELECT TO public USING(true)`) was re-created in `20260108071956` (an earlier identically-named anon policy existed/was dropped multiple times — see history) and is dropped + replaced by `auth_read_document_categories` by the 2026-06-11 SQL.

**Triggers.** None.

**types.ts cross-check** (`src/integrations/supabase/types.ts:1010`). Columns match. FK `document_categories_subsection_id_fkey → subsections`. No discrepancy.

**Notable history (extensive policy churn).**
- `20251015102828` added `Public users can view document categories` (`TO anon USING(true)`); `20251016035546` dropped it.
- `20251016021446` data DELETE: `DELETE … WHERE name = '05 Photos'` — removed all "05 Photos" category rows.
- `20251020065547` added `Public can view document categories` (`TO public USING(true)`).
- `20251119090820` dropped the `authenticated`-manage policy, added Admin + Contractor SELECT.
- `20251120080517` dropped Admin/Contractor/`Public can view`, added blanket `All authenticated users full access to document_categories`.
- `20251120110544` dropped the blanket policy; added Admin-manage + Client/Contractor SELECT (current set).
- `20251120111033` added `Users can manage all document categories`.
- `20260108071956` re-added anon `Public can view document categories` (removed again by 2026-06-11 tier-2).
- `20260621120000` added `is_system` (boolean, default false) — locks app-managed report/COC categories from rename/move-target on the site Documents tab; seeded for report category names + COC categories.

---

## file_sync_logs

**Purpose.** Audit log of cloud-storage file sync operations (Google Drive / Dropbox uploads, downloads, deletes) with status and error message. Created in `supabase/migrations/20251027075744_d0a3d62f-05ac-43a0-acd4-363ae5890a1a.sql:16`. **No application or edge-function call site** — repo-wide grep returns only the migration and `types.ts`. ⚠️ UNVERIFIED that any live code writes these logs.

**Effective columns** (migration `20251027075744`):

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) |
| file_path | text | no | — | |
| file_name | text | no | — | |
| sync_type | text | no | — | (comment: 'upload'/'download'/'delete') |
| service | text | no | — | (comment: 'google_drive'/'dropbox') |
| status | text | no | 'pending' | (comment: 'pending'/'completed'/'failed') |
| error_message | text | yes | — | |
| synced_at | timestamptz | yes | now() | |
| created_at | timestamptz | yes | now() | |

**Constraints / indexes / unique keys.** PK on `id`. **No CHECK constraints** — the value sets for `sync_type`/`service`/`status` exist only as SQL comments, not enforced. Indexes: `idx_file_sync_logs_created_at` on `(created_at DESC)`; `idx_file_sync_logs_service` on `(service)`. No unique keys.

**RLS enabled:** yes (`20251027075744`). Policies (names only):
- `Authenticated users can view sync logs` (FOR SELECT, `USING (auth.role() = 'authenticated')`)
- `Authenticated users can create sync logs` (FOR INSERT, `WITH CHECK (auth.role() = 'authenticated')`)

(No UPDATE/DELETE policy. The SELECT gate is `auth.role()`, not `USING(true)`, so it is NOT touched by the 2026-06-11 tier-2 SQL.)

**Triggers.** None.

**types.ts cross-check** (`src/integrations/supabase/types.ts:1042`). Columns and nullability match. No discrepancy.

**Notable history.** Single create migration; no alterations.

---

## floor_plan_pin_comments

**Purpose.** Threaded comments attached to a floor-plan pin. Read/written in `src/components/InteractiveFloorPlan.tsx:457` `.from('floor_plan_pin_comments')`.

**Effective columns** (create `supabase/migrations/20251120102352_9e71ab8f-203e-4876-9207-b010022c3232.sql`):

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) |
| pin_id | uuid | no | — | floor_plan_pins(id) ON DELETE CASCADE |
| user_id | uuid | yes | — | auth.users(id) |
| user_name | text | yes | — | |
| comment | text | no | — | |
| created_at | timestamptz | yes | now() | |
| updated_at | timestamptz | yes | now() | |

**Constraints / indexes / unique keys.** PK on `id`. FK on `pin_id`. Index `idx_floor_plan_pin_comments_pin_id` on `(pin_id)`. No CHECK, no unique keys.

**RLS enabled:** yes (`20251120102352`). Policies (names only):
- `Authenticated users can view comments` (`USING (auth.uid() IS NOT NULL)`)
- `Authenticated users can create comments` (`WITH CHECK (auth.uid() IS NOT NULL)`)
- `Users can update their own comments` (FOR UPDATE, `USING (auth.uid() = user_id)`, **no `WITH CHECK`**)
- `Users can delete their own comments` (FOR DELETE, `USING (auth.uid() = user_id)`)

All policies omit a `TO` role (default PUBLIC); the SELECT policy's qual is `auth.uid() IS NOT NULL` (not `true`), so it is NOT touched by the 2026-06-11 tier-2 SQL.

**Triggers.** None (created in same migration as `floor_plan_pins` triggers, but no trigger attached to this table).

**types.ts cross-check** (`src/integrations/supabase/types.ts:1078`). Columns and nullability match. FK `floor_plan_pin_comments_pin_id_fkey → floor_plan_pins`. No discrepancy.

**Notable history.** Single create migration.

---

## floor_plan_pins

**Purpose.** Snag/observation pins placed on a subsection floor plan, with position, priority, status, rectification fields, and a JSONB `edit_history` change log. Read in `src/components/ComplianceDashboard.tsx:564` and managed offline in `src/hooks/useOfflineFloorPlanAnnotations.ts:48`.

**Effective columns** (create `supabase/migrations/20251027115044_3a5a0a85-6c4a-4c4e-8d8d-e2e91cf6a078.sql`; later columns annotated):

| name | type | null | default | FK | added |
|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) | create |
| floor_plan_id | uuid | no | — | subsection_floor_plans(id) ON DELETE CASCADE | create |
| pin_number | integer | no | — | | create |
| x_position | decimal | no | — | | create |
| y_position | decimal | no | — | | create |
| pin_type | text | no | — | CHECK IN ('snag','observation') | create |
| priority | text | yes | — | CHECK IN ('low','medium','high','critical') | create |
| status | text | no | 'open' | CHECK (see below) | create |
| title | text | yes | — | | create |
| notes | text | yes | — | | create |
| photo_url | text | yes | — | | create |
| assigned_contractor | text | yes | — | | create |
| due_date | date | yes | — | | create |
| created_by | uuid | yes | — | auth.users(id) | create |
| created_at | timestamptz | yes | now() | | create |
| updated_at | timestamptz | yes | now() | | create |
| package | text | yes | — | | `20251120102352` |
| stakeholders | text | yes | — | | `20251120102352` |
| detailed_description | text | yes | — | | `20251120102352` |
| edit_history | jsonb | yes | '[]'::jsonb | | `20251120102352` |
| last_modified_by | uuid | yes | — | auth.users(id) | `20251120102352` |
| last_modified_at | timestamptz | yes | now() | | `20251120102352` |
| rectification_photo_url | text | yes | — | | `20260108043155` |
| rectification_notes | text | yes | — | | `20260108043155` |
| rectified_at | timestamptz | yes | — | | `20260108043155` |
| rectified_by | text | yes | — | | `20260108043155` |

**Constraints / indexes / unique keys.**
- PK on `id`. FK on `floor_plan_id`.
- CHECK `floor_plan_pins_pin_type_check`: `pin_type IN ('snag','observation')`.
- CHECK on `priority`: `IN ('low','medium','high','critical')`.
- CHECK `floor_plan_pins_status_check`: effective set `('open','in_progress','finished','closed','resolved')` — original was `('open','resolved')` (`20251027115044`), dropped and recreated wider in `20251120102352`.
- Index `idx_pins_floor_plan` on `(floor_plan_id)`.
- `REPLICA IDENTITY FULL` set in `20251120103640` (for realtime full-row change events). ⚠️ UNVERIFIED that the table was actually added to the `supabase_realtime` publication — the migration comment claims it but emits no `ALTER PUBLICATION`.
- No unique keys.

**RLS enabled:** yes (`20251027115044`). Effective policies (names only):
- `Admins can manage all floor plan pins` (`20251120110544`)
- `Clients can view floor plan pins for their sites` (`20251120110544`)
- `Contractors can view floor plan pins for assigned sites` (`20251120110544`)
- `Users can manage all floor plan pins` (`20251120111033`)
- `auth_read_floor_plan_pins` (added by 2026-06-11 tier-2 SQL, replacing the dropped anon-readable `Public can view floor_plan_pins`)

⚠️ Tier-2 note: `Public can view floor_plan_pins` (`FOR SELECT USING(true)`) was created in `20260123052442` and is dropped + replaced by `auth_read_floor_plan_pins` by the 2026-06-11 SQL.

**Triggers.**
- `update_pins_updated_at` — `BEFORE UPDATE … EXECUTE FUNCTION public.update_updated_at_column()` (`20251027115044`).
- `floor_plan_pin_changes_trigger` — `BEFORE UPDATE … EXECUTE FUNCTION track_floor_plan_pin_changes()` (`20251120102352`). The function appends a from/to diff (status, priority, assigned_contractor) to `edit_history` and sets `last_modified_at = NOW()`; redefined `SECURITY DEFINER SET search_path = public` in `20251120102409`.

**types.ts cross-check** (`src/integrations/supabase/types.ts:1116`). All 26 columns present and match (note `x_position`/`y_position` surface as `number`, consistent with `decimal`). FK `floor_plan_pins_floor_plan_id_fkey → subsection_floor_plans`. No discrepancy.

**Notable history.** Status CHECK widened (`20251120102352`); three column-batches added (`20251120102352`, `20260108043155`); REPLICA IDENTITY FULL (`20251120103640`); heavy policy churn — early per-action policies dropped in `20251120080517` (blanket `All authenticated users full access`), then replaced by role-scoped policies in `20251120110544`/`20251120111033`; anon `Public can view` added `20260123052442` then removed by tier-2.

---

## inspection_items

**Purpose.** Checklist line-items belonging to an `inspection_subsections` row (status/notes/image). Referenced via cascade-delete in `src/views/SiteDetail.tsx:364` (`supabase.from('inspection_items').delete().eq('subsection_id', …)`) and `src/views/subsection-detail/useSubsectionDetail.ts:1053`. ⚠️ Note: its parent `inspection_subsections` has no live call site (see that table); the relationship is legacy.

**Effective columns** (create `supabase/migrations/20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`):

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) |
| subsection_id | uuid | no | — | inspection_subsections(id) ON DELETE CASCADE |
| item_name | text | no | — | |
| status | text | yes | 'Pending' | |
| notes | text | yes | — | |
| image_url | text | yes | — | |
| created_at | timestamptz | no | now() | |

**Constraints / indexes / unique keys.** PK on `id`. FK on `subsection_id`. No CHECK, no extra indexes, no unique keys.

**RLS enabled:** yes (`20251014114352`). Effective policies (names only):
- `Admins can manage all inspection items` (`20251120110544`)
- `Contractors can view inspection items for assigned sites` (`20251120110544`) — note: no Client SELECT policy was created here, unlike sibling tables in the same migration.
- `Users can manage all inspection items` (`20251120111033`)

(No anon `Public can view` policy was ever created → not affected by the 2026-06-11 tier-2 SQL.)

**Triggers.** None.

**types.ts cross-check** (`src/integrations/supabase/types.ts:1211`). Columns and nullability match. FK `inspection_items_subsection_id_fkey → inspection_subsections`. No discrepancy.

**Notable history.** Initial per-action `authenticated`-gated policies dropped in `20251119090820` (replaced by Admin + Contractor); those dropped in `20251120080517` (blanket `All authenticated users full access`); blanket dropped in `20251120110544` and replaced by the current role-scoped set + `20251120111033` Users-manage.

---

## inspection_relink_audit

**Purpose.** Audit trail for the one-time orphan-inspection relink backfill — records each inspection's attempted shop-number/firebase-key, match count, and resolution. Created in `supabase/migrations/20260519045946_ff0d3334-68ec-431a-b213-6a5bc51b25f1.sql:8`; the same migration's `DO` block inserts rows (resolutions `'auto_relinked'`, `'multiple_matches'`, `'no_match'`). **No application or edge-function call site** — repo-wide grep returns only the migration and `types.ts`. Admin-only read.

**Effective columns** (migration `20260519045946`):

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) |
| inspection_id | uuid | no | — | none (no FK) |
| site_id | uuid | yes | — | none (no FK) |
| attempted_shop_number | text | yes | — | |
| attempted_firebase_key | text | yes | — | |
| match_count | integer | no | 0 | |
| resolution | text | no | — | |
| resolved_subsection_id | uuid | yes | — | none (no FK) |
| created_at | timestamptz | no | now() | |

**Constraints / indexes / unique keys.** PK on `id` only. **No FK constraints** (audit rows survive deletion of referenced inspections/subsections by design). No CHECK, no indexes, no unique keys.

**RLS enabled:** yes (`20260519045946`). Policies (names only; both created via `DROP POLICY IF EXISTS` then `CREATE`, no `TO` role → default PUBLIC):
- `Admins view relink audit` (FOR SELECT, `USING (public.has_role(auth.uid(),'Admin'::app_role))`)
- `Service inserts relink audit` (FOR INSERT, `WITH CHECK (true)` — permits service-role and trigger writes)

(No SELECT `USING(true)` policy → not affected by the 2026-06-11 tier-2 SQL.)

**Triggers.** None.

**types.ts cross-check** (`src/integrations/supabase/types.ts:1249`). Columns and nullability match. `Relationships: []` (consistent with no FKs). No discrepancy.

**Notable history.** Single create migration which also (in its `DO` block) mutates `inspections.subsection_id` and `subsections.firebase_id` as part of the backfill (those tables out of scope here).

---

## inspection_signatures

**Purpose.** Captured sign-off signatures per inspection per signer role (inspector/contractor/client/witness): base64 image, optional storage URL, signer identity, IP. Read in report generation, e.g. `src/components/ComprehensiveInspectionReport.tsx:106` `.from('inspection_signatures')` and `src/lib/inspectionReportGenerator.ts:83`.

**Effective columns** (create `supabase/migrations/20260108042823_c7515df1-fcdf-4adc-ae75-55420c305177.sql`):

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) |
| inspection_id | uuid | no | — | inspections(id) ON DELETE CASCADE |
| signer_type | text | no | — | CHECK IN ('inspector','contractor','client','witness') |
| signer_name | text | no | — | |
| signer_email | text | yes | — | |
| signature_data | text | no | — | (base64 signature image) |
| signature_url | text | yes | — | (storage URL after upload) |
| signed_at | timestamptz | no | now() | |
| ip_address | text | yes | — | |
| created_at | timestamptz | no | now() | |

**Constraints / indexes / unique keys.**
- PK on `id`. FK on `inspection_id`.
- CHECK `inspection_signatures_signer_type_check`: `signer_type IN ('inspector','contractor','client','witness')`.
- `UNIQUE(inspection_id, signer_type)` (table-level).
- Index `idx_inspection_signatures_inspection_id` on `(inspection_id)`.

**RLS enabled:** yes (`20260108042823`). Policies (names only; all omit `TO` role → default PUBLIC):
- `Users can view signatures for inspections they have access to` (transitive via `EXISTS` on inspections/sites; no direct `auth.uid()` check)
- `Authenticated users can create signatures` (`WITH CHECK (auth.uid() IS NOT NULL)`)
- `Users can update their own signatures` (`USING (auth.uid() IS NOT NULL)` — despite the name, any authenticated user can update any row; no ownership column)
- `Admins can delete signatures` (`USING (EXISTS … FROM user_roles WHERE user_id = auth.uid() AND role = 'Admin')` — queries `user_roles` directly, not via `has_role()`)

The SELECT policy's qual is an `EXISTS` subquery (not `true`), so it is NOT touched by the 2026-06-11 tier-2 SQL.

**Triggers.** None.

**types.ts cross-check** (`src/integrations/supabase/types.ts:1285`). Columns and nullability match. FK `inspection_signatures_inspection_id_fkey → inspections`. No discrepancy on this table.

**Related (out of assigned scope):** types.ts also defines a snapshot table `inspection_signatures_snap_20260421` (`src/integrations/supabase/types.ts:1332`) with the same columns all nullable and `Relationships: []`. It does not appear in any migration in the event log; ⚠️ UNVERIFIED origin (likely a dashboard-created backup snapshot taken 2026-04-21). Not part of this batch's assigned tables.

**Notable history.** Single create migration; no later alterations in-tree.

---

## inspection_subsections

**Purpose.** Subsection grouping under an inspection (legacy inspection model; parent of `inspection_items`). Created in `supabase/migrations/20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql:48`. **No application or edge-function call site** — repo-wide grep for `inspection_subsections` returns only migrations and `types.ts`; the live app uses the separate `subsections` table. ⚠️ UNVERIFIED that this table is still populated; appears legacy/orphaned (its child `inspection_items` is only referenced via cascade-delete cleanup).

**Effective columns** (migration `20251014114352`):

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) |
| inspection_id | uuid | no | — | inspections(id) ON DELETE CASCADE |
| name | text | no | — | |
| description | text | yes | — | |
| order_index | integer | no | 0 | |
| created_at | timestamptz | no | now() | |

**Constraints / indexes / unique keys.** PK on `id`. FK on `inspection_id`. No CHECK, no extra indexes, no unique keys.

**RLS enabled:** yes (`20251014114352`). Effective policies (names only):
- `All authenticated users full access to inspection_subsections` (FOR ALL, no `TO` role, `USING/ WITH CHECK (auth.uid() IS NOT NULL)`; `20251120080517`)

(No anon `Public can view` policy → not affected by the 2026-06-11 tier-2 SQL.)

**Triggers.** None.

**types.ts cross-check** (`src/integrations/supabase/types.ts:1371`). Columns and nullability match. FK `inspection_subsections_inspection_id_fkey → inspections`. No discrepancy.

**Notable history.** Initial per-action `authenticated`-gated policies dropped in `20251119090820` (replaced by Admin + Contractor); those dropped in `20251120080517` and replaced by the current blanket `All authenticated users full access` policy. Unlike sibling tables, it received no role-scoped Client/Contractor/User policies in `20251120110544`/`20251120111033`.

---

## inspection_templates

**Purpose.** Definitions of inspection report templates (name, category, JSONB `cover_page`/`sections`/`tenants` structure, computed page/section counts). Read in `src/components/ComprehensiveInspectionReport.tsx:83` `.from('inspection_templates')`, the `templates` edge function (`supabase/functions/templates/index.ts:398`), and validated via the `validate_inspection_templates` RPC (`src/views/TemplateValidator.tsx:32`).

**Effective columns** (create `supabase/migrations/20251014140001_3adc740c-7446-410a-a427-957d649c4e3c.sql`; JSONB columns added later):

| name | type | null | default | FK | added |
|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | — (PK) | create |
| name | text | no | — | | create |
| category | text | no | — | | create |
| description | text | yes | — | | create |
| sections_count | integer | yes | 0 | | create |
| pages_count | integer | yes | 0 | | create |
| created_at | timestamptz | no | now() | | create |
| updated_at | timestamptz | no | now() | | create |
| cover_page | jsonb | yes | — | | `20251014161057` |
| sections | jsonb | yes | — | | `20251014161057` |
| tenants | jsonb | yes | NULL | | `20251017071948` |

**Constraints / indexes / unique keys.** PK on `id` only. No CHECK, no extra indexes, no unique keys.

**RLS enabled:** yes (`20251014140001`). Effective policies (names only):
- `All authenticated users full access to inspection_templates` (FOR ALL; `20251120080517`)
- `auth_read_inspection_templates` (added by 2026-06-11 tier-2 SQL, replacing the dropped anon-readable `Public can view inspection_templates`)

⚠️ Tier-2 note: `Public can view inspection_templates` (`FOR SELECT USING(true)`, conditionally created in `20260123052442`) is dropped + replaced by `auth_read_inspection_templates` by the 2026-06-11 SQL.

**Triggers.** `update_inspection_templates_updated_at` — `BEFORE UPDATE … EXECUTE FUNCTION public.update_updated_at_column()` (`20251014140001`).

**Associated function.** `validate_inspection_templates()` — read-only diagnostic (RETURNS TABLE), `SECURITY DEFINER SET search_path = public`. Defined `20251120045029`, then dropped and re-created (duplicate-ID check fixed) in `20251120045114`. Surfaced in types.ts at `:3704`.

**types.ts cross-check** (`src/integrations/supabase/types.ts:1406`). All 11 columns present and match (`cover_page`/`sections`/`tenants` as `Json | null`, count columns `number | null`). No discrepancy.

**Notable history (heavy data churn).**
- `20251014161057`: added `cover_page`/`sections`; inserted 14 mock templates; recomputed `sections_count`/`pages_count`.
- `20251014161831`: `DELETE FROM inspection_templates` (no WHERE — wiped the 14 mocks); inserted 8 real Firebase-ported templates.
- `20251014162009`: inserted 3 more templates (total 11).
- `20251016023327`: recategorized miniature-substation/RMU templates to `'Medium Voltage'`.
- `20251016030509`: seeded `'Site Drawing Inspection'` template (no ON CONFLICT — re-run would duplicate).
- `20251017064450`: appended a Tenant Information section to the EMB template `sections`.
- `20251017071948`: added `tenants` column.
- `20251022100347`: renamed one item to `'48V Relay Status'` in a specific template row.
- `20251120045010`: `DO`-block normalization of `sections` JSONB (legacy object → array shape; backfill missing section names).
- Policy churn: initial per-action `authenticated`-gated policies dropped `20251119090820` (Admin + Contractor SELECT added); dropped `20251120080517` (blanket `All authenticated users full access`); anon `Public can view` conditionally added `20260123052442`, removed by 2026-06-11 tier-2.
