# Effective Schema Reference — Tables (Batch 05)

Tables: `site_schematics`, `sites`, `snags`, `subsection_documents`, `subsection_floor_plans`, `subsections`, `suggestions`, `temp_import`, `user_clients`, `user_policy_overrides`, `user_roles`, `user_sites`.

Method: effective state = replay of all DDL events in `docs/system-reference/_work/migration-events-01..10.json` (chronological), then apply `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` (applied to PROD 2026-06-11 via dashboard, AFTER all migrations). Policy bodies are documented elsewhere; only policy NAMES are listed here. Columns cross-checked against the live-DB-generated `src/integrations/supabase/types.ts`.

> **Global effect of `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`** (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:18-41`): a `DO` block scans `pg_policies` for every `public`-schema policy with `cmd='SELECT' AND qual='true'` whose `roles` is `{public}` or includes `anon` (excluding `settings`), `DROP`s each, and creates one replacement `CREATE POLICY auth_read_<table> ON public.<table> FOR SELECT TO authenticated USING (true)`. Tables in this batch hit by that sweep: `sites`, `snags`, `subsections`, `subsection_documents`, `subsection_floor_plans`, `site_schematics`. The dropped policy names and the new `auth_read_*` names are noted per table below.

---

## site_schematics

**Purpose.** One uploaded site schematic diagram per site, plus AI region-detection metadata and calibration. Created `20260120132425_dd27775f-2702-483d-846e-ba743b2d95f6.sql`. Representative call site: `src/components/site/SchematicDiagram.tsx:680` (`supabase.from("site_schematics")`).

**Effective columns**

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| site_id | uuid | no | — | → public.sites(id) ON DELETE CASCADE |
| file_name | text | no | — | |
| file_url | text | no | — | |
| uploaded_by | uuid | yes | — | none (no FK) |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| detected_regions | jsonb | yes | `'[]'::jsonb` | — (added `20260121080355`) |
| regions_detected_at | timestamptz | yes | — | — (added `20260121080355`) |
| detection_status | text | yes | `'pending'` | no CHECK; comment lists pending/processing/completed/failed (added `20260121080355`) |
| calibrated_width | numeric | yes | NULL | — (added `20260121094541`) |
| calibrated_height | numeric | yes | NULL | — (added `20260121094541`) |
| is_calibrated | boolean | yes | false | — (added `20260121094541`) |

**Constraints / indexes / unique.** PK(id). `UNIQUE(site_id)` — one schematic per site (`20260120132425…`). Indexes: `idx_site_schematics_site_id` on (site_id) (`20260120132425…`); `idx_site_schematics_detection_status` on (detection_status) (`20260121080355…`).

**RLS:** enabled (`20260120132425…`). Effective policy NAMES:
- `Authenticated users can insert site schematics`
- `Authenticated users can update site schematics`
- `Authenticated users can delete site schematics`
- `auth_read_site_schematics` (created by the 2026-06-11 prod SQL, replacing the dropped `Anyone can view site schematics` SELECT/USING(true) policy)

**Triggers.** `update_site_schematics_updated_at` BEFORE UPDATE → `public.update_updated_at_column()` (`20260120132425…`).

**types.ts cross-check.** Matches (`src/integrations/supabase/types.ts:2580-2635`); `site_schematics_site_id_fkey` `isOneToOne: true` confirms the `UNIQUE(site_id)`.

**Notable history.** Original SELECT policy `Anyone can view site schematics` (`USING (true)`, no TO ⇒ public) is dropped by the 2026-06-11 prod SQL. AI-detection columns (`20260121080355…`) and calibration columns (`20260121094541…`) added later.

---

## sites

**Purpose.** Physical inspection sites under a client. Created `20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`. Representative call site: `src/components/site/SiteEditDialog.tsx:62` (`supabase.from('sites').update(...)`).

**Effective columns**

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| client_id | uuid | no | — | → public.clients(id) ON DELETE CASCADE |
| name | text | no | — | |
| address | text | yes | — | |
| site_type | text | yes | — | |
| created_by | uuid | yes | — | → auth.users(id) |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| supply_authority | text | yes | — | — (added `20251014132137`) |
| nominated_max_demand | text | yes | — | — (added `20251014132137`) |
| consultant_name | text | yes | — | — (added `20251014132137`) |
| consultant_company | text | yes | — | — (added `20251014132137`) |
| consultant_contact | text | yes | — | — (added `20251014132137`) |
| site_image_url | text | yes | — | — (added `20251014132137`) |
| client_logo_url | text | yes | — | — (added `20251014132137`) |
| firebase_id | text | yes | — | — (added `20251014142244`, not unique) |

**Constraints / indexes / unique.** PK(id). `idx_sites_firebase_id` on (firebase_id) (`20251014142244…`).

**RLS:** enabled (`20251014114352…`). Effective policy NAMES (after the full policy-churn history and the 2026-06-11 prod SQL):
- `Admins can manage all sites` (`20251120110544…`)
- `Clients can view their sites` (`20251120110544…`)
- `Contractors can view assigned sites` (`20251120110544…`)
- `Users can manage all sites` (`20251120111033…`)
- `auth_read_sites` (2026-06-11 prod SQL, replacing the dropped `Public can view sites` SELECT/USING(true) policy from `20260108071956…`)

**Triggers.** `update_sites_updated_at` BEFORE UPDATE → `public.update_updated_at_column()` (dropped+recreated `20251014114445…`).

**types.ts cross-check.** Matches (`src/integrations/supabase/types.ts:2636-2700`). `sites_client_id_fkey` present; no FK relationship for `created_by` is emitted (FK to auth.users, expected).

**Notable history.** Heavy SELECT-policy churn for anon QR access: `Public users can view sites` (`20251015102828`) → `Public users can view basic site info for QR codes` (`20251016035546`) → `Public QR code access - minimal data only` (`20251016064350`, `TO public`). Role-scoped policies added (`20251017054255`, `20251017061634`, `20251119090707`), then all dropped and collapsed to `All authenticated users full access to sites` (`USING auth.uid() IS NOT NULL`) in `20251120080517…`, which itself was dropped/re-split in `20251120110544…`. The blanket anon read was re-introduced as `Public can view sites` (`20260108071956…`, for QR landing-page subsection context) and finally demoted to authenticated-only by the 2026-06-11 prod SQL.

---

## snags

**Purpose.** Defect/issue records ("snags") attached to a subsection (and optionally an inspection), with status, risk, cost, photos and rectification tracking. Created `20251016084545_dc21b520-ba68-4adc-b959-f28f7b58622c.sql`. Representative call site: `src/components/ComplianceDashboard.tsx:543` (`supabase.from('snags')`).

**Effective columns** (migration-derived unless flagged)

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| subsection_id | uuid | no | — | → public.subsections(id) ON DELETE CASCADE |
| inspection_id | uuid | yes | — | → public.inspections(id) ON DELETE SET NULL |
| title | text | no | — | |
| description | text | yes | — | |
| status | text | no | `'Open'` | CHECK status IN ('Open','Closed') |
| notes | text | yes | — | |
| photos | jsonb | yes | `'[]'::jsonb` | |
| created_by | uuid | yes | — | → auth.users(id) ON DELETE SET NULL (also re-added as `snags_created_by_fkey` `20251020093858…`) |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| risk_level | text | yes | — | no CHECK; comment lists Low/Medium/High/Critical (added `20251017043548`) |
| estimated_cost | numeric(10,2) | yes | — | ZAR (added `20251017043548`) |
| rectification_photos | jsonb | yes | `'[]'::jsonb` | — (added `20260108043155`) |
| rectification_notes | text | yes | — | — (added `20260108043155`) |
| rectified_at | timestamptz | yes | — | — (added `20260108043155`) |
| rectified_by | text | yes | — | — (added `20260108043155`) |
| project_id | text | yes | — | — (added `20260410013045`, outside event-log batch — verified in `supabase/migrations/20260410013045_e3990969-d3ba-4378-94ca-bfa2e8d541b3.sql:4`) |
| attachment_urls | text[] | yes | `'{}'` | — (added `20260410013045`, `:5`) |
| closeout_photo_url | text | yes | — | — (added `20260410013045`, `:6`) |
| sign_off_requested_at | timestamptz | yes | — | — (added `20260410013045`, `:7`) |
| signed_off_by | text | yes | — | — (added `20260410013045`, `:8`) |
| signed_off_at | timestamptz | yes | — | — (added `20260410013045`, `:9`) |

> Note: the snags columns above (`project_id` … `signed_off_at`) are NOT in this batch's assigned event log (`migration-events-*.json`), but ARE in the migrations directory at `supabase/migrations/20260410013045_e3990969-…sql:3-9`. Included here for effective-schema completeness; not a discrepancy.

**Constraints / indexes / unique.** PK(id). CHECK `status IN ('Open','Closed')`. Indexes: `idx_snags_subsection_id`, `idx_snags_inspection_id`, `idx_snags_status` (all `20251016084545…`).

**RLS:** enabled (`20251016084545…`). Effective policy NAMES:
- `Admins can manage all snags` (`20251120110544…`)
- `Clients can view snags for their sites` (`20251120110544…`)
- `Contractors can view snags for assigned sites` (`20251120110544…`)
- `Users can manage all snags` (`20251120111033…`)
- `auth_read_snags` (2026-06-11 prod SQL, replacing the dropped `Public can view snags via subsection ID` SELECT/USING(true) policy from `20260109084016…`)

**Triggers.** `update_snags_updated_at` BEFORE UPDATE → `public.update_updated_at_column()` (`20251016084545…`).

**types.ts cross-check (`src/integrations/supabase/types.ts:2701-2808`).**
- ⚠️ **DISCREPANCY (types.ts vs migrations):** `types.ts` carries these columns that exist in NO migration file anywhere in `supabase/migrations` (verified by word-boundary grep across all 140 files): `assignee` (string|null), `coc_validation_id` (string|null), `deleted_at` (string|null), `snag_type` (string, NOT NULL — Insert has `snag_type?` so a DB default exists), `trade` (string|null). These were introduced to PROD outside the migrations directory. (The `coc_validation_id` and `trade` migration grep hits are false positives — they belong to `coc_compliance_photos.coc_validation_id` and the `trade_as` column on another table, respectively.)
- Columns `project_id`, `attachment_urls`, `closeout_photo_url`, `sign_off_requested_at`, `signed_off_at`, `signed_off_by` are in `types.ts` AND in migration `20260410013045…` (just not in this batch's event log) — documented in the columns table above; NOT discrepancies.
- `types.ts` emits no FK relationship for `created_by` (auth.users) — expected; `coc_validation_id` and `project_id` carry no FK relationship in `types.ts` either.

**Notable history.** Conditional FK `snags_created_by_fkey` re-added in `20251020093858…`. Repeated SELECT-policy churn mirroring sites (`20251119090820`, `20251120080517`, `20251120110544`, `20251120111033`). Anon read `Public can view snags via subsection ID` (`20260109084016…`, despite the name `USING(true)` exposes all rows) demoted to authenticated-only by the 2026-06-11 prod SQL.

---

## subsection_documents

**Purpose.** Uploaded documents (incl. COC certificates) attached to a subsection, categorised, with denormalised COC metadata. Created `20251014140001_3adc740c-7446-410a-a427-957d649c4e3c.sql`. Representative call site: `src/components/ComplianceDashboard.tsx:205` (`supabase.from('subsection_documents')`).

**Effective columns**

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| subsection_id | uuid | no | — | → public.subsections(id) ON DELETE CASCADE |
| category_id | uuid | no | — | → public.document_categories(id) ON DELETE CASCADE |
| file_name | text | no | — | |
| file_url | text | no | — | |
| file_size | bigint | yes | — | |
| uploaded_at | timestamptz | no | now() | |
| uploaded_by | uuid | yes | — | → auth.users(id) (also re-added `subsection_documents_uploaded_by_fkey` ON DELETE SET NULL `20251020093858…`) |
| coc_number | text | yes | — | — (added `20251110081647`) |
| coc_issue_date | date | yes | — | — (added `20251110081647`) |
| coc_type | text | yes | — | CHECK (see below) (added `20251110081647`) |
| coc_status | text | yes | — | CHECK (see below) (added `20251110081647`) |

**Constraints / indexes / unique.** PK(id). No secondary indexes created in events.
Effective CHECK constraints (originals from `20251110081647` were dropped and replaced in `20260114082530…`):
- `subsection_documents_coc_type_check`: `CHECK (coc_type IS NULL OR coc_type = ANY (ARRAY['Initial','Supplementary','Temporary','Not Marked','initial','supplementary','temporary','not marked']))`
- `subsection_documents_coc_status_check`: `CHECK (coc_status IS NULL OR coc_status = ANY (ARRAY['pending','approved','rejected','Approved','Failed','Pending','Rejected']))`

**RLS:** enabled (`20251014140001…`). Effective policy NAMES:
- `Admins can manage subsection documents` (`20251119090820…`)
- `Contractors can view subsection documents for their sites` (`20251119090820…`)
- `Contractors can delete subsection documents for their sites` (`20251120045331…`)
- `Any authenticated user can upload documents` (INSERT, `20251120080137…`)
- `Authenticated users can delete documents` (DELETE, `20251120080137…`)
- `auth_read_subsection_documents` (2026-06-11 prod SQL). Note: TWO public/anon `USING(true)` SELECT policies existed at end-of-migrations — `Public can view subsection documents` (`20251016064723…`, `TO public`) and `Public can view subsection_documents` (`20260123052442…`, conditional DO-block, no TO ⇒ public). The prod SQL drops BOTH and creates the single `auth_read_subsection_documents`.

**Triggers.** None recorded in events.

**types.ts cross-check.** Matches (`src/integrations/supabase/types.ts:2809-2868`). Both FKs (`category_id` → document_categories, `subsection_id` → subsections) present.

**Notable history.** ALL-command policy `Authenticated users can manage subsection documents` (`20251014140001`) replaced by per-command policies (`20251016064723`). Multiple INSERT/DELETE policy rewrites (`20251120045331`, `20251120074459`, `20251120080137`) progressively stripped role/site scoping down to plain `auth.uid() IS NOT NULL` for INSERT and `Admin OR uploaded_by` for DELETE. **Data backfill** `20260112114907…` populated `coc_number/coc_issue_date/coc_type/coc_status` from `coc_validations.report_data`. CHECK constraints widened in `20260114082530…`.

---

## subsection_floor_plans

**Purpose.** Floor-plan image uploads per subsection (basis for interactive floor-plan pin overlays). Created `20251027115044_3a5a0a85-6c4a-4c4e-8d8d-e2e91cf6a078.sql`. Representative call site: `src/components/InteractiveFloorPlan.tsx:128` (`supabase.from("subsection_floor_plans")`).

**Effective columns**

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| subsection_id | uuid | no | — | → public.subsections(id) ON DELETE CASCADE |
| file_url | text | no | — | |
| file_name | text | no | — | |
| uploaded_by | uuid | yes | — | → auth.users(id) |
| created_at | timestamptz | yes | now() | |
| updated_at | timestamptz | yes | now() | |

**Constraints / indexes / unique.** PK(id). Index `idx_floor_plans_subsection` on (subsection_id) (`20251027115044…`).

**RLS:** enabled (`20251027115044…`). Effective policy NAMES:
- `Admins can manage all subsection floor plans` (`20251120110544…`)
- `Clients can view subsection floor plans for their sites` (`20251120110544…`)
- `Contractors can view subsection floor plans for assigned sites` (`20251120110544…`)
- `Users can manage all subsection floor plans` (`20251120111033…`)
- `auth_read_subsection_floor_plans` (2026-06-11 prod SQL, replacing the dropped `Public can view subsection_floor_plans` SELECT/USING(true) policy from `20260123052442…`)

**Triggers.** `update_floor_plans_updated_at` BEFORE UPDATE → `public.update_updated_at_column()` (`20251027115044…`).

**types.ts cross-check.** Matches (`src/integrations/supabase/types.ts:2869-2906`); `created_at`/`updated_at` nullable, consistent with the migration `DEFAULT NOW()` columns declared without NOT NULL.

**Notable history.** Original per-subsection SELECT/INSERT/UPDATE/DELETE policies dropped and collapsed to `All authenticated users full access to subsection_floor_plans` in `20251120080517…`, then re-split in `20251120110544…`. Anon read added `20260123052442…` then demoted by the 2026-06-11 prod SQL.

---

## subsections

**Purpose.** Mid-hierarchy entity (Client → Site → **Subsection** → Inspection); represents an electrical board/panel within a site, carrying COC and compliance status. Created `20251014123510_4c69dadd-d092-4989-a989-92a7498dd462.sql`. Representative call site: `src/components/site/MeterRegister.tsx:58` (`supabase.from('subsections')`).

**Effective columns** (migration-derived unless flagged)

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| site_id | uuid | no | — | → public.sites(id) ON DELETE CASCADE |
| name | text | no | — | |
| description | text | yes | — | |
| category | text | yes | — | e.g. 'EE' |
| coc_status | text | yes | `'Missing'` | |
| metering_status | text | yes | `'Missing'` | |
| is_coc_required | boolean | yes | true | |
| is_compliant | boolean | yes | true | maintained by `trg_sync_coc_compliance` |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| tenant_name | text | yes | — | — (added `20251014132137`) |
| coc_number | text | yes | — | — (added `20251014140001`) |
| coc_issue_date | date | yes | — | — (added `20251014140001`) |
| coc_type | text | yes | — | — (added `20251014140001`) |
| meter_serial_number | text | yes | — | — (added `20251014140001`) |
| ct_ratio | text | yes | — | — (added `20251014140001`) |
| firebase_id | text | yes | — | — (added `20251014142244`, not unique) |
| inspection_template_id | uuid | yes | — | → public.inspection_templates(id) (NO ACTION) (added `20251015020520`) |
| qr_code_url | text | yes | — | — (added `20251020123629`) |

**Constraints / indexes / unique.** PK(id). Indexes: `idx_subsections_site_id` (`20251014123510`), `idx_subsections_firebase_id` (`20251014142244`), `idx_subsections_template_id` (`20251015020520`), `idx_subsections_qr_code_url` (`20251020123629`).

**RLS:** enabled (`20251014123510…`). Effective policy NAMES:
- `Admins can manage all subsections` (`20251120110544…`)
- `Clients can view subsections for their sites` (`20251120110544…`)
- `Contractors can view subsections for assigned sites` (`20251120110544…`)
- `Users can manage all subsections` (`20251120111033…`)
- `auth_read_subsections` (2026-06-11 prod SQL, replacing the dropped `Public can view subsections` SELECT/USING(true) policy from `20260108071956…`)

**Triggers.**
- `update_subsections_updated_at` BEFORE UPDATE → `public.update_updated_at_column()` (`20251014123510…`).
- `trg_sync_coc_compliance` BEFORE INSERT OR UPDATE OF (coc_status, is_coc_required) → `public.sync_coc_compliance_status()` (SECURITY DEFINER; reads `coc_validations`; auto-maintains `is_compliant`) (`20260201151127…`).

**types.ts cross-check (`src/integrations/supabase/types.ts:2907-2999`).**
- ⚠️ **DISCREPANCY (types.ts vs migrations):** `types.ts` carries `deleted_at` (string|null), `installation_score` (number|null), `installation_status` (string|null) — none appear in ANY file under `supabase/migrations` (verified by word-boundary grep across all 140 migration files; `deleted_at` appears in no migration at all). Introduced to PROD outside the migrations directory.
- A separate generated type `subsections_snap_20260421` (`types.ts:3000-3068`, all-nullable, no relationships) is a point-in-time snapshot table, NOT part of `subsections` — out of scope for this entry.

**Notable history.** Anon QR SELECT churn (`20251015102828` → `20251016035546` → `20251016064350`), role-scoped policies (`20251017054255`, `20251017061634`), blanket-access collapse (`20251120080517`) then re-split (`20251120110544`, `20251120111033`), anon read re-added (`20260108071956`) and finally demoted by the 2026-06-11 prod SQL. **Multiple data backfills** correcting `is_compliant`/`coc_status`: `20260113123609` (two UPDATEs), `20260130084823` (coc_status/is_compliant priority fix from latest coc_validations), `20260201150950` (hardcoded Yarona-site subsection UUIDs + global Missing-COC fix). Compliance trigger introduced `20260201151127`.

---

## suggestions

**Purpose.** In-app feedback / feature-request / bug-report submissions with admin triage, AI-assisted fix verification, and user re-verification workflow. Created `20251028165823_3011bd73-ec7a-4eb0-a346-ede292d41f2e.sql`. Representative call site: `src/views/Suggestions.tsx:176` (`supabase.from('suggestions')`).

**Effective columns**

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| reported_by | uuid | yes | — | → auth.users(id) |
| user_name | text | yes | — | |
| user_email | text | no | — | |
| title | text | no | — | |
| description | text | no | — | |
| category | text | no | `'feature'` | |
| priority | text | no | `'medium'` | |
| status | text | no | `'new'` | |
| page_url | text | no | — | |
| screenshot_url | text | yes | — | |
| browser_info | jsonb | yes | `'{}'::jsonb` | |
| admin_notes | text | yes | — | |
| resolved_by | uuid | yes | — | → auth.users(id) |
| resolved_at | timestamptz | yes | — | |
| needs_user_verification | boolean | yes | false | — (added `20251107084904`) |
| verification_status | text | yes | `'pending'` | no CHECK (added `20251107084904`) |
| verified_at | timestamptz | yes | — | — (added `20251107084904`) |
| verified_by | uuid | yes | — | → auth.users(id) (added `20251107084904`) |
| rejection_reason | text | yes | — | — (added `20251107084904`) |
| rejection_screenshot_url | text | yes | — | — (added `20251107084904`) |
| fix_description | text | yes | — | — (added `20260107120703`) |
| fix_test_result | jsonb | yes | — | — (added `20260107120703`) |
| fix_test_run_at | timestamptz | yes | — | — (added `20260107120703`) |
| fix_confidence_score | integer | yes | — | — (added `20260107120703`) |

**Constraints / indexes / unique.** PK(id). No secondary indexes or unique keys in events.

**RLS:** enabled (`20251028165823…`). Effective policy NAMES (all from `20251028165823…`):
- `Users can create their own suggestions`
- `Users can view their own suggestions`
- `Admins can view all suggestions`
- `Admins can update suggestions`
- `Admins can delete suggestions`

(No public/anon `USING(true)` SELECT policy ⇒ untouched by the 2026-06-11 prod SQL.)

**Triggers.** None recorded in events.

**types.ts cross-check.** Matches (`src/integrations/supabase/types.ts:3069-3158`); no `Relationships` emitted (all FKs are to auth.users).

**Notable history.** Verification-workflow columns added `20251107084904`; AI-fix-verification columns added `20260107120703`. No drops.

---

## temp_import

**Purpose.** Staging table for importing raw JSON from external sources (admin/utility only). Created `20251014120224_e944a635-b5b0-4808-b7c8-87c5c2a774e9.sql`. ⚠️ UNVERIFIED runtime call site: no `supabase.from('temp_import')` usage exists in `src` (only the generated type in `src/integrations/supabase/types.ts`); table is admin-only per its RLS, consistent with table COMMENT 'Temporary table for importing JSON data from external sources'.

**Effective columns**

| name | type | null | default | FK |
|---|---|---|---|---|
| id | integer (serial) | no | sequence | PK |
| data | jsonb | yes | — | |
| imported_at | timestamp (no tz) | yes | now() | |
| imported_by | uuid | yes | — | → auth.users(id) (added `20251016064350`) |

**Constraints / indexes / unique.** PK(id). Index `idx_temp_import_user` on (imported_by) (`20251016064350…`).

**RLS:** enabled (`20251014120224…`). Effective policy NAMES:
- `Only admins can manage import data` (FOR ALL TO authenticated, Admin-only) (`20251016064350…`)

(The original `Authenticated users can insert import data` and `Authenticated users can view import data` policies from `20251014120224…` were dropped in `20251016064350…`.)

**Triggers.** None.

**types.ts cross-check.** Matches (`src/integrations/supabase/types.ts:3159-3178`); `id` typed `number` confirms `serial`/`integer`.

**Notable history.** Locked down from authenticated-CRUD to Admin-only in `20251016064350…` (it lacked per-user tracking); `imported_by` column + index added in the same migration for future per-user policies. That migration footer also notes leaked-password protection must be enabled manually in the Supabase dashboard (not a SQL change).

---

## user_clients

**Purpose.** 1:1 mapping of an auth user to a client, gating Client-portal access; consumed by `get_user_client_id()` inside Client-role RLS policies. Created `20251017054255_cd78a557-c3ab-4a9b-b95c-d8da8696f61c.sql`. Representative call site: `src/hooks/useUserRole.tsx:80` (`supabase.from("user_clients")`).

**Effective columns**

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| user_id | uuid | no | — | → auth.users(id) ON DELETE CASCADE (also re-added `user_clients_user_id_fkey` `20251020093858…`) |
| client_id | uuid | no | — | → public.clients(id) ON DELETE CASCADE |
| created_at | timestamptz | yes | now() | |

**Constraints / indexes / unique.** PK(id). `UNIQUE(user_id)` and `UNIQUE(client_id)` ⇒ strict 1:1 user↔client (`20251017054255…`).

**RLS:** enabled (`20251017054255…`). Effective policy NAMES:
- `Admins can manage user-client mappings` (`20251017054255…`)
- `Users can view their own client mapping` (`20251017054255…`)
- `All authenticated users full access to user_clients` (FOR ALL, applies to PUBLIC, `USING/WITH CHECK auth.uid() IS NOT NULL`) (additive in `20251120080517…`)

**Triggers.** None.

**Related function.** `get_user_client_id()` (SQL, STABLE, SECURITY DEFINER, `SET search_path = public`) created in the same migration: `SELECT client_id FROM public.user_clients WHERE user_id = auth.uid() LIMIT 1` (`20251017054255…`).

**types.ts cross-check.** Matches (`src/integrations/supabase/types.ts:3180-3208`); `user_clients_client_id_fkey` `isOneToOne: true` confirms `UNIQUE(client_id)`.

**Notable history.** No drops. Blanket `All authenticated users full access to user_clients` added `20251120080517…` alongside the existing Admin/self policies (note: this widens write/read access to any authenticated user despite the restrictive named policies).

---

## user_policy_overrides

**Purpose.** Admin-defined per-user RLS GRANT/DENY override rules (table_name + operation + permission_type + optional condition). Created `20251120061340_29a4cccb-992b-47a3-b12c-108886eed9da.sql`. Representative call site: `src/components/UserRLSPolicies.tsx:90` (`supabase.from('user_policy_overrides')`).

**Effective columns**

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| user_id | uuid | no | — | → auth.users(id) ON DELETE CASCADE |
| table_name | text | no | — | |
| operation | text | no | — | CHECK operation IN ('SELECT','INSERT','UPDATE','DELETE','ALL') |
| permission_type | text | no | — | CHECK permission_type IN ('GRANT','DENY') |
| condition | text | yes | — | |
| reason | text | yes | — | |
| created_by | uuid | yes | — | → auth.users(id) |
| created_at | timestamptz | yes | now() | |
| updated_at | timestamptz | yes | now() | |

**Constraints / indexes / unique.** PK(id). CHECKs on `operation` and `permission_type` (above). Indexes: `idx_user_policy_overrides_user_id` on (user_id), `idx_user_policy_overrides_table_name` on (table_name) (`20251120061340…`).

**RLS:** enabled (`20251120061340…`). Effective policy NAMES:
- `Admins can manage policy overrides` (FOR ALL TO authenticated, Admin-only) (`20251120061340…`)

**Triggers.** `update_user_policy_overrides_updated_at` BEFORE UPDATE → `public.update_updated_at_column()` (`20251120061340…`).

**types.ts cross-check.** Matches (`src/integrations/supabase/types.ts:3209-3247`); no `Relationships` emitted (FKs are to auth.users).

**Notable history.** None (single-migration table).

---

## user_roles

**Purpose.** Authoritative role assignments per user (the `app_role` enum), deliberately separate from `profiles`; underpins `has_role()` used across all RLS. Created `20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql`. Representative call site: `src/components/UserRLSPolicies.tsx:113` (`supabase.from('user_roles')`).

**Effective columns**

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| user_id | uuid | no | — | → auth.users(id) ON DELETE CASCADE (also re-added `user_roles_user_id_fkey` `20251020093858…`) |
| role | app_role | no | — | enum (defined in an earlier migration — ⚠️ UNVERIFIED: no CREATE TYPE in the event log) |
| created_at | timestamptz | yes | now() | |

**Constraints / indexes / unique.** PK(id). `UNIQUE(user_id, role)` ⇒ one row per (user, role) (`20251014120311…`).

**RLS:** enabled (`20251014120311…`). Effective policy NAMES (all from `20251014120311…`):
- `Users can view their own roles`
- `Admins can view all roles`
- `Admins can insert roles`
- `Admins can update roles`
- `Admins can delete roles`

**Triggers.** None.

**Seed data.** `20251014172735…` inserts `('02847fd1-0cd1-42a7-b5d0-10122b74828e','Admin')` ON CONFLICT DO NOTHING — bootstraps the first Admin.

**types.ts cross-check.** Matches (`src/integrations/supabase/types.ts:3248-3267`); `role` typed `Database["public"]["Enums"]["app_role"]`, consistent with the `app_role` enum column.

**Notable history.** Conditional FK `user_roles_user_id_fkey` re-added `20251020093858…`. No policy churn.

---

## user_sites

**Purpose.** Many-to-many assignment of Contractor users to sites; drives Contractor-role RLS scoping (`site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())`). Created `20251017061634_0f314109-0186-45b7-9d30-23aacfd775d3.sql`. Representative call site: `src/views/Users.tsx:346` (`supabase.from('user_sites')`).

**Effective columns**

| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| user_id | uuid | no | — | → auth.users(id) ON DELETE CASCADE (no FK at create; FK `user_sites_user_id_fkey` added `20251020093858…`) |
| site_id | uuid | no | — | → public.sites(id) ON DELETE CASCADE |
| created_at | timestamptz | yes | now() | |

**Constraints / indexes / unique.** PK(id). `UNIQUE(user_id, site_id)` ⇒ one assignment per (user, site) (`20251017061634…`).

**RLS:** enabled (`20251017061634…`). Effective policy NAMES:
- `Admins can manage user-site mappings` (`20251017061634…`)
- `Users can view their own site assignments` (`20251017061634…`)
- `All authenticated users full access to user_sites` (FOR ALL, applies to PUBLIC, `USING/WITH CHECK auth.uid() IS NOT NULL`) (additive in `20251120080517…`)

**Triggers.**
- `log_user_site_insert` AFTER INSERT → `public.log_user_site_assignment()` (`20251119091647…`).
- `log_user_site_delete` AFTER DELETE → `public.log_user_site_assignment()` (`20251119091647…`).

(`log_user_site_assignment()` is SECURITY DEFINER, `SET search_path = public`; writes an 'assigned'/'removed' row into `public.user_sites_history` on each INSERT/DELETE.)

**types.ts cross-check.** Matches (`src/integrations/supabase/types.ts:3269-3297`); `user_sites_site_id_fkey` present (FK to auth.users for `user_id` not emitted as a relationship — expected).

**Notable history.** Originally created with `user_id` lacking a FK (added later via conditional DO-block `20251020093858…`). Audit-logging triggers + the `log_user_site_assignment()` function added `20251119091647…`. Blanket `All authenticated users full access to user_sites` added `20251120080517…` (widens access to any authenticated user despite the named Admin/self policies).

---

## Dropped tables

None of the twelve tables in this batch were dropped. All persist in the effective schema. (`subsections_snap_20260421`, visible in `types.ts:3000-3068`, is a separate snapshot table outside this batch's assignment and is not documented here.)
