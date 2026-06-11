# Effective Schema Reference — Tables (batch 04)

Ground-truth reference for: `public.inspections`, `public.offline_photos`, `public.snags`, `public.subsections`, `public.qr_codes`, `public.qr_scans`, `public.schematic_blocks`, `public.settings`, `public.site_assets`, `public.site_document_categories`, `public.site_documents`, `public.site_marking_checklist`.

Effective state = replay of all migration events (`docs/system-reference/_work/migration-events-01.json` … `-10.json`, file-number order) plus the dashboard-applied `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` (treated as applied AFTER all migrations). Column cross-check is against the live-DB-generated `src/integrations/supabase/types.ts`.

## Conventions
- "RLS policies documented elsewhere" — this doc lists policy **names** only (effective set as of the tier-2 lockdown).
- The 2026-06-11 tier-2 lockdown (`APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:18-41`) scans `pg_policies` and, for every `public` table (except `settings`) that has a `cmd='SELECT' AND qual='true'` policy granted to `public`/`anon`, **drops** that policy and **creates** `auth_read_<tablename>` = `FOR SELECT TO authenticated USING (true)`. Per-table impact is noted in each entry.
- `update_updated_at_column()` is the shared `BEFORE UPDATE` timestamp trigger function (created `20251014114352`, recreated SECURITY DEFINER + `SET search_path = public` in `20251014114445`).

---

## public.inspections

**Purpose.** Root inspection record (a completed/scheduled inspection of a subsection within a site); stores both structured fields and a freeform `json_data` blob keyed by template section/item ids. Representative read: `src/components/site/GenerateFinalReportButton.tsx:123` — `supabase.from('inspections').select('id, json_data').eq('site_id', site.id)`. Created `20251014114352`.

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| site_id | uuid | no | — | → sites(id) ON DELETE CASCADE |
| title | text | no | — | |
| description | text | yes | — | |
| status | text | no | 'Pending' | |
| inspection_date | date | yes | — | |
| inspector_id | uuid | yes | — | → auth.users(id) |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| priority | text | yes | 'Medium' | (20251014120619) |
| end_date | date | yes | — | (20251014120619) |
| assigned_to | text[] | yes | — | (20251014120619) |
| subsection_id | uuid | yes | — | → subsections(id) ON DELETE CASCADE (20251014123510) |
| json_data | jsonb | yes | '{}'::jsonb | (20251015023536) |
| template_id | uuid | yes | — | → inspection_templates(id) NO ACTION (20251015023536) |
| project_name | text | yes | — | (20251014132137) |
| shop_number | text | yes | — | (20251014132137) |
| shop_name | text | yes | — | (20251014132137) |
| inspector_name | text | yes | — | (20251014132137) |
| client_rep | text | yes | — | (20251014132137) |
| consultant | text | yes | — | (20251014132137) |
| contractor | text | yes | — | (20251014132137) |
| testing_party | text | yes | — | (20251014132137) |
| location | text | yes | — | (20251014132137) |
| qr_code_url | text | yes | — | (20251014132137) |
| firebase_id | text | yes | — | (20251014142244, NOT unique) |
| quality_rating | integer | yes | — | CHECK 1–5 (20251016084545) |
| deleted_at | timestamptz | yes | — | ⚠️ DISCREPANCY (types.ts vs migrations) — present in types.ts `inspections.Row` (`src/integrations/supabase/types.ts:1455`) but added by NO migration in the event log |

### Constraints / indexes / unique
- PK `inspections_pkey` (id).
- CHECK: `quality_rating >= 1 AND quality_rating <= 5`.
- Indexes: `idx_inspections_inspection_date`, `idx_inspections_end_date` (20251014120619); `idx_inspections_subsection_id` (20251014123510); `idx_inspections_template_id`, `idx_inspections_json_data` (GIN on json_data) (20251015023536); `idx_inspections_firebase_id` (20251014142244); `idx_inspections_site_subsection_null` (partial: `WHERE subsection_id IS NULL`, 20260519045946).
- No unique key beyond PK.

### RLS
Enabled (`20251014114352`). Effective policy names (after the full lockdown→restore→public-read→tier-2 history):
- `Admins can manage all inspections` (20251120110544)
- `Clients can view inspections for their sites` (20251120110544)
- `Contractors can view inspections for assigned sites` (20251120110544)
- `Users can manage all inspections` (20251120111033)
- `Contractors can update inspections for assigned sites` (20260219090420)
- `Contractors can insert inspections for assigned sites` (20260219090420)
- `auth_read_inspections` — created by tier-2, replacing the dropped `Public can view inspections` (`USING(true)`, 20260123052442). **Tier-2 affected this table.**

### Triggers
- `update_inspections_updated_at` — BEFORE UPDATE → `update_updated_at_column()` (20251014114352, recreated 20251014114445).
- `trg_inspections_auto_link_subsection` — BEFORE INSERT OR UPDATE OF json_data, subsection_id → `inspections_auto_link_subsection()` (20260519045946).

### Notable history
- `json_data` rewritten in place from numeric (array-index) keys to template-defined string keys by the one-off `normalize_inspection_json_data()` (20251112021952, function dropped same migration).
- Per-row `json_data` photo cleanups on inspection `d4b630cf-…` (20260108121126, 20260108121329).
- One-time orphan relink backfill mutated `inspections.subsection_id` (and `subsections.firebase_id`) and inserted `inspection_relink_audit` rows (20260519045946).
- RLS churn: blanket `auth.uid() IS NOT NULL` full-access (20251120080517) → role-scoped (20251120110544) → `User`-role restore (20251120111033) → public read added (20260123052442) → tier-2 demotion (2026-06-11).

---

## public.offline_photos

**Purpose.** Generic photo table for non-COC contexts (subsection/site/inspection), used by the offline-capture/sync hook. Representative use: `src/hooks/useOfflinePhotos.ts:257` — `supabase.from('offline_photos')…`. Created `20260310085611`. `context_type`/`context_id` are untyped pointers (no FK).

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| context_type | text | no | — | |
| context_id | uuid | no | — | (no FK) |
| secondary_context_id | uuid | yes | — | (no FK) |
| photo_type | text | no | — | |
| storage_path | text | no | — | |
| file_name | text | no | — | |
| file_size | bigint | no | — | |
| mime_type | text | no | — | |
| captured_at | timestamptz | no | now() | |
| captured_by | uuid | no | — | (no FK) |
| latitude | numeric | yes | — | |
| longitude | numeric | yes | — | |
| notes | text | yes | — | |
| created_at | timestamptz | no | now() | |

types.ts (`src/integrations/supabase/types.ts:1868-1920`) matches exactly; no discrepancies. (`offline_photos_snap_20260421` is a separate snapshot table, out of scope.)

### Constraints / indexes / unique
- PK `offline_photos_pkey` (id). No CHECK, no indexes, no unique key created in any migration. No FK constraints (context columns intentionally unconstrained).

### RLS
Enabled (`20260310085611`). Effective policy names:
- `All authenticated users full access (offline_photos)` — `FOR ALL TO authenticated USING(true) WITH CHECK(true)` (20260406131029).

(The four original role-scoped policies — `Admins can manage all offline photos`, `Users can manage all offline photos`, `Users can manage their own offline photos`, `Contractors can view offline photos for assigned sites`, all 20260310085611 — were dropped and collapsed into the blanket policy by 20260406131029.) **No anon SELECT policy ever existed → tier-2 did NOT affect this table.**

### Triggers
None attached (no `updated_at` column; no trigger created).

### Notable history
- 20260406131029 collapsed the four role-scoped policies into a single blanket authenticated-full-access policy.

---

## public.snags

**Purpose.** Defects/observations raised against a subsection (optionally tied to an inspection); tracks status, risk, cost, rectification, and sign-off. Representative read: `src/components/site/GenerateFinalReportButton.tsx:114` — `supabase.from('snags').select('id, subsection_id, title, status, risk_level, description').in('subsection_id', subsectionIds)`. Created `20251016084545`.

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| subsection_id | uuid | no | — | → subsections(id) ON DELETE CASCADE |
| inspection_id | uuid | yes | — | → inspections(id) ON DELETE SET NULL |
| title | text | no | — | |
| description | text | yes | — | |
| status | text | no | 'Open' | CHECK (see below) |
| notes | text | yes | — | |
| photos | jsonb | yes | '[]'::jsonb | |
| created_by | uuid | yes | — | → auth.users(id) ON DELETE SET NULL (FK formalized 20251020093858) |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| risk_level | text | yes | — | (20251017043548; values only in comment, no CHECK) |
| estimated_cost | numeric(10,2) | yes | — | (20251017043548; "in ZAR" per comment) |
| rectification_photos | jsonb | yes | '[]'::jsonb | (20260108043155) |
| rectification_notes | text | yes | — | (20260108043155) |
| rectified_at | timestamptz | yes | — | (20260108043155) |
| rectified_by | text | yes | — | (20260108043155) |
| project_id | text | yes | — | (20260410013045) |
| attachment_urls | text[] | yes | '{}' | (20260410013045) |
| closeout_photo_url | text | yes | — | (20260410013045) |
| sign_off_requested_at | timestamptz | yes | — | (20260410013045) |
| signed_off_by | text | yes | — | (20260410013045) |
| signed_off_at | timestamptz | yes | — | (20260410013045) |
| assignee | text | yes | — | ⚠️ DISCREPANCY (types.ts vs migrations) — `src/integrations/supabase/types.ts:2703`, no migration |
| coc_validation_id | uuid | yes | — | ⚠️ DISCREPANCY (types.ts vs migrations) — `types.ts:2706`, no migration |
| deleted_at | timestamptz | yes | — | ⚠️ DISCREPANCY (types.ts vs migrations) — `types.ts:2709`, no migration |
| snag_type | text | no | — | ⚠️ DISCREPANCY (types.ts vs migrations) — `types.ts:2725` (NOT NULL w/ Insert-optional default), no migration |
| trade | text | yes | — | ⚠️ DISCREPANCY (types.ts vs migrations) — `types.ts:2729`, no migration |

The 5 discrepancy columns exist in the live DB (types.ts is generated from it) but were added out-of-band (dashboard), not via any migration in the event log.

### Constraints / indexes / unique
- PK `snags_pkey` (id).
- CHECK: `status IN ('Open','Closed')` (20251016084545). ⚠️ UNVERIFIED whether this CHECK was widened out-of-band; types.ts types `status` as plain `string`.
- FK: `snags_created_by_fkey` (created_by → auth.users ON DELETE SET NULL), formalized 20251020093858.
- Indexes: `idx_snags_subsection_id`, `idx_snags_inspection_id`, `idx_snags_status` (all 20251016084545).
- No unique key beyond PK.

### RLS
Enabled (`20251016084545`). Effective policy names:
- `Admins can manage all snags` (20251120110544)
- `Clients can view snags for their sites` (20251120110544)
- `Contractors can view snags for assigned sites` (20251120110544)
- `Users can manage all snags` (20251120111033)
- `auth_read_snags` — created by tier-2, replacing the dropped `Public can view snags via subsection ID` (`USING(true)`, 20260109084016). **Tier-2 affected this table.**

### Triggers
- `update_snags_updated_at` — BEFORE UPDATE → `update_updated_at_column()` (20251016084545).

### Notable history
- RLS churn parallel to inspections: blanket full-access (20251120080517) → role-scoped (20251120110544) → `User`-role restore (20251120111033) → public read (20260109084016) → tier-2 demotion (2026-06-11).
- Multiple additive column waves: rectification fields (20260108043155), sign-off/attachment fields (20260410013045).

---

## public.subsections

**Purpose.** Electrical board/panel within a site (hierarchy Client → Site → Subsection → Inspection); carries COC/metering status and the per-subsection compliance flag. Representative write: `src/components/ComplianceDashboard.tsx:355` — `supabase.from('subsections').update(subsectionUpdateData).eq('id', …)`. Created `20251014123510`.

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| site_id | uuid | no | — | → sites(id) ON DELETE CASCADE |
| name | text | no | — | |
| description | text | yes | — | |
| category | text | yes | — | (e.g. 'EE') |
| coc_status | text | yes | 'Missing' | |
| metering_status | text | yes | 'Missing' | |
| is_coc_required | boolean | yes | true | |
| is_compliant | boolean | yes | true | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| inspection_template_id | uuid | yes | — | → inspection_templates(id) NO ACTION (20251015020520) |
| tenant_name | text | yes | — | (20251014132137) |
| coc_number | text | yes | — | (20251014140001) |
| coc_issue_date | date | yes | — | (20251014140001) |
| coc_type | text | yes | — | (20251014140001) |
| meter_serial_number | text | yes | — | (20251014140001) |
| ct_ratio | text | yes | — | (20251014140001) |
| firebase_id | text | yes | — | (20251014142244; re-`ADD … IF NOT EXISTS` 20260519045946, NOT unique) |
| qr_code_url | text | yes | — | (20251020123629) |
| installation_score | numeric | yes | — | ⚠️ DISCREPANCY (types.ts vs migrations) — `src/integrations/supabase/types.ts:2921`, no migration |
| installation_status | text | yes | — | ⚠️ DISCREPANCY (types.ts vs migrations) — `types.ts:2922`, no migration |
| deleted_at | timestamptz | yes | — | ⚠️ DISCREPANCY (types.ts vs migrations) — `types.ts:2916`, no migration |

### Constraints / indexes / unique
- PK on id.
- Indexes: `idx_subsections_site_id` (20251014123510); `idx_subsections_template_id` (20251015020520); `idx_subsections_firebase_id` (20251014142244; re-created as a **partial** index `WHERE firebase_id IS NOT NULL` in 20260519045946); `idx_subsections_qr_code_url` (20251020123629).
- No unique key beyond PK.

### RLS
Enabled (`20251014123510`). Effective policy names:
- `Admins can manage all subsections` (20251120110544)
- `Clients can view subsections for their sites` (20251120110544)
- `Contractors can view subsections for assigned sites` (20251120110544)
- `Users can manage all subsections` (20251120111033)
- `auth_read_subsections` — created by tier-2, replacing the dropped `Public can view subsections` (`USING(true)`, 20260108071956). **Tier-2 affected this table.**

### Triggers
- `update_subsections_updated_at` — BEFORE UPDATE → `update_updated_at_column()` (20251014123510).
- `trg_sync_coc_compliance` — BEFORE INSERT OR UPDATE OF coc_status, is_coc_required → `sync_coc_compliance_status()` (20260201151127); auto-maintains `is_compliant` from `coc_status`/`is_coc_required` and the latest `coc_validations` row.

### Notable history
- Multiple data-fix backfills of `is_compliant`/`coc_status` (20260113123609, 20260130084823, 20260201150950 — incl. hardcoded Yarona-site UUIDs).
- 20260519045946 one-time orphan-relink backfill mutated `subsections.firebase_id`.
- Earlier anon-read history: `Public users can view subsections` (20251015102828, dropped 20251016035546); the QR `Public QR code access` policies (20251016064350, dropped 20251120080517) before the surviving `Public can view subsections` (20260108071956) that tier-2 finally removed.

---

## public.qr_codes

**Purpose.** Pre-generated QR-code records linking a code-image URL to a client/site/subsection. No runtime `from('qr_codes')` call site found in `src` (only the generated `src/integrations/supabase/types.ts:2105` definition); ⚠️ UNVERIFIED that the app reads/writes this table at runtime. Created `20251020070753`.

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| qr_code_url | text | no | — | |
| label | text | yes | — | |
| client_id | uuid | yes | — | → clients(id) ON DELETE CASCADE |
| site_id | uuid | yes | — | → sites(id) ON DELETE CASCADE |
| subsection_id | uuid | yes | — | → subsections(id) ON DELETE CASCADE |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| created_by | uuid | yes | — | → auth.users(id) |

types.ts (`src/integrations/supabase/types.ts:2105-2161`) matches; no discrepancies.

### Constraints / indexes / unique
- PK on id.
- Indexes: `idx_qr_codes_client`, `idx_qr_codes_site`, `idx_qr_codes_subsection` (all 20251020070753).
- No unique key beyond PK.

### RLS
Enabled (`20251020070753`). Effective policy names:
- `All authenticated users full access to qr_codes` — `FOR ALL … USING(auth.uid() IS NOT NULL) WITH CHECK(auth.uid() IS NOT NULL)` (20251120080517).

The original policies (`Admins can manage all QR codes`, `Clients can view their QR codes`, `Contractors can view QR codes for their sites`, `Public can view QR codes`, all 20251020070753) were all dropped by 20251120080517. **The anon `Public can view QR codes` was dropped in 20251120080517, so no anon SELECT survived to the tier-2 run → tier-2 did NOT affect this table.**

### Triggers
- `update_qr_codes_updated_at` — BEFORE UPDATE → `update_updated_at_column()` (20251020070753).

### Notable history
- Anon read (`Public can view QR codes`) existed only between 20251020070753 and 20251120080517.

---

## public.qr_scans

**Purpose.** QR-scan event log (one row per subsection scan); anonymous inserts permitted. Representative use (delete on subsection teardown): `src/views/SiteDetail.tsx:367` — `supabase.from('qr_scans').delete().eq('subsection_id', subsectionId)`. Created `20251014140001`.

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| subsection_id | uuid | no | — | → subsections(id) ON DELETE CASCADE |
| scanned_at | timestamptz | no | now() | |
| scanned_by | uuid | yes | — | → auth.users(id) |
| ip_address | text | yes | — | |
| user_agent | text | yes | — | |
| created_at | timestamptz | no | now() | |

types.ts (`src/integrations/supabase/types.ts:2163-2199`) matches; no discrepancies.

### Constraints / indexes / unique
- PK on id. No additional indexes, CHECK, or unique key created in any migration.

### RLS
Enabled (`20251014140001`). Effective policy names:
- `Authenticated users can view scans` — `FOR SELECT USING(auth.role() = 'authenticated')` (20251014140001).
- `Anyone can insert scans` — `FOR INSERT … WITH CHECK(true)`, no TO clause → public incl. anon (20251014140001); enables anonymous scan logging.

**No anon `USING(true)` SELECT policy → tier-2 did NOT affect this table.** (The `Anyone can insert scans` policy is INSERT, not matched by the SELECT-only lockdown.)

### Triggers
None (no `updated_at` column; no trigger created).

### Notable history
None beyond creation.

---

## public.schematic_blocks

**Purpose.** Block-to-subsection mapping overlaid on a site schematic diagram (a positioned rectangle, e.g. 'DB-001' → subsection). Representative use: `src/components/site/SchematicDiagram.tsx:646` — `supabase.from("schematic_blocks")…`. Created `20260120132425`.

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| schematic_id | uuid | no | — | → site_schematics(id) ON DELETE CASCADE |
| subsection_id | uuid | yes | — | → subsections(id) ON DELETE SET NULL |
| block_identifier | text | no | — | (e.g. 'DB-001') |
| block_name | text | yes | — | (e.g. 'SHOPRITE') |
| x_position | numeric | no | — | |
| y_position | numeric | no | — | |
| width | numeric | yes | 120 | |
| height | numeric | yes | 80 | |
| is_auto_matched | boolean | yes | false | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

types.ts (`src/integrations/supabase/types.ts:2271-2329`) matches; no discrepancies.

### Constraints / indexes / unique
- PK on id.
- Indexes: `idx_schematic_blocks_schematic_id`, `idx_schematic_blocks_subsection_id` (both 20260120132425).
- No unique key beyond PK.

### RLS
Enabled (`20260120132425`). Effective policy names:
- `Authenticated users can insert schematic blocks` — `FOR INSERT TO authenticated WITH CHECK(true)` (re-targeted 20260313070142; idempotently re-applied 20260313095510).
- `Authenticated users can update schematic blocks` — `FOR UPDATE TO authenticated USING(true) WITH CHECK(true)` (re-targeted 20260313070142).
- `Authenticated users can delete schematic blocks` — `FOR DELETE TO authenticated USING(true)` (re-targeted 20260313070142).
- `auth_read_schematic_blocks` — created by tier-2, replacing the dropped `Anyone can view schematic blocks` (`USING(true)`, 20260120132425). **Tier-2 affected this table.**

Note: 20260313095510 re-applied only the INSERT policy (not UPDATE/DELETE).

### Triggers
- `update_schematic_blocks_updated_at` — BEFORE UPDATE → `update_updated_at_column()` (20260120132425).

### Notable history
- Write policies (insert/update/delete) re-targeted from default (public) to the `authenticated` role in 20260313070142; INSERT re-applied 20260313095510.

---

## public.settings

**Purpose.** Single-row app branding/configuration record (company name/logo, primary color, QR base URL, auto-logout). Representative read: `src/components/SessionWatcher.tsx:28` — `supabase.from('settings')…`. Created `20251014132137`; seeded with one row `company_name = 'Watson Mattheus'` (20251014132137).

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| company_logo_url | text | yes | — | |
| login_hero_image_url | text | yes | — | |
| company_name | text | yes | 'Watson Mattheus' | |
| primary_color | text | yes | '#3B82F6' | |
| created_at | timestamptz | yes | now() | |
| updated_at | timestamptz | yes | now() | |
| qr_base_url | text | yes | — | (20251020130110) |
| auto_logout_enabled | boolean | yes | false | (20260206105621) |
| auto_logout_time | time | yes | '02:00:00' | (20260206105621) |

types.ts (`src/integrations/supabase/types.ts:2331-2368`) matches the effective set. **Note:** the `google_drive_connected` column present in the original `CREATE TABLE` (20251014132137) was removed by the 12-column `DROP COLUMN IF EXISTS` in 20251027081639, and the cloud-storage/backup columns added in 20251027075744 (`dropbox_connected`, `google_drive_refresh_token`, etc.) were dropped in the same 20251027081639 — none appear in the effective schema. No discrepancies.

### Constraints / indexes / unique
- PK on id. No additional indexes, CHECK, or unique key created in any migration. (Single-row table maintained by app convention; no DB-level singleton constraint.)

### RLS
Enabled (`20251014132137`). Effective policy names:
- `Public can view branding only` — `FOR SELECT TO public USING(true)` (20251016064350). **Explicitly EXCLUDED from the tier-2 lockdown** (`APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:26` excludes `settings`), so anon/public SELECT remains live.
- `Authenticated users can view all settings` — `FOR SELECT TO authenticated USING(auth.role() = 'authenticated')` (20251016064350).
- `Authenticated users can update settings` — `FOR UPDATE USING(auth.role() = 'authenticated')` (20251014132137).
- `Authenticated users can insert settings` — `FOR INSERT WITH CHECK(auth.role() = 'authenticated')` (20251014132137).

### Triggers
- `update_settings_updated_at` — BEFORE UPDATE → `update_updated_at_column()` (20251014132137).

### Notable history
- 20251027075744 added 12 cloud-storage/backup columns; 20251027081639 dropped them all (storage moved to per-user `user_storage_connections`).
- Data: `qr_base_url` repointed to `https://wm-compliance.lovable.app` (20260217075058).
- Original anon SELECT `Anyone can view settings` (20251014132137) → replaced by `Public can view branding only` (20251016064350).

---

## public.site_assets

**Purpose.** Per-site asset/meter register (electrical/water meters, equipment) with import-batch tracking. Representative read: `src/components/site/GenerateFinalReportButton.tsx:117` — `supabase.from('site_assets').select(...).eq('site_id', site.id).eq('asset_category', 'electrical_meter')`. Created `20260109105319`.

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| site_id | uuid | no | — | → sites(id) ON DELETE CASCADE |
| premises_id | text | no | — | |
| trade_as | text | yes | — | |
| asset_category | asset_category (enum) | no | 'other' | enum ('electrical_meter','water_meter','equipment','other'), created 20260109105319 |
| meter_serial_number | text | yes | — | |
| comments | text | yes | — | |
| meter_type | text | yes | — | |
| ct_ratio | text | yes | — | |
| breaker_size | text | yes | — | |
| reading_at_commissioning | text | yes | — | |
| old_meter_serial_number | text | yes | — | |
| last_meter_read_old | text | yes | — | |
| tag | text | yes | — | |
| mbus_gateway_index | text | yes | — | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| created_by | uuid | yes | — | → auth.users(id) |
| import_batch_id | uuid | yes | — | (no FK) |

types.ts (`src/integrations/supabase/types.ts:2370-2442`) matches; `asset_category` typed as `Database["public"]["Enums"]["asset_category"]`. No discrepancies.

### Constraints / indexes / unique
- PK on id.
- Indexes: `idx_site_assets_site_id`, `idx_site_assets_category` (on asset_category), `idx_site_assets_premises_id` (all 20260109105319).
- No unique key beyond PK.

### RLS
Enabled (`20260109105319`). Effective policy names:
- `Admins can manage all assets` (20260109105319; bare-text `'Admin'`, no `::app_role` cast)
- `Users can view assets` (20260109105319; `has_role('User') OR has_role('Moderator')`)
- `Contractors can view assets for assigned sites` (20260109105319)
- `Clients can view assets for their sites` (20260109105319; uses `user_clients` mapping)
- `Authenticated users can insert assets` (20260216054714)
- `Authenticated users can update assets` (20260216054714)
- `Authenticated users can delete assets` (20260216054714)
- `Authenticated users can view assets` (20260216054714; `FOR SELECT TO authenticated USING(true)`)
- `auth_read_site_assets` — created by tier-2, replacing the dropped `Public can view site assets` (`TO anon USING(true)`, 20260217085025). **Tier-2 affected this table.**

### Triggers
- `update_site_assets_updated_at` — BEFORE UPDATE → `update_updated_at_column()` (20260109105319).

### Notable history
- Anon read (`Public can view site assets`, 20260217085025) opened all rows to anon "for public review portals" (comment cited meter-metadata-only, no PII) and was removed by tier-2.

---

## public.site_document_categories

**Purpose.** Per-site document-category folders (e.g. '01 COC', '02 Manuals') used to organize `site_documents`. Representative read: `src/views/SiteDetail.tsx:188` — `supabase.from('site_document_categories')…`. Created `20251016021558`.

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| site_id | uuid | no | — | → sites(id) ON DELETE CASCADE |
| name | text | no | — | |
| order_index | integer | no | 0 | |
| created_at | timestamptz | no | now() | |

types.ts (`src/integrations/supabase/types.ts:2444-2474`) matches; no discrepancies.

### Constraints / indexes / unique
- PK on id. No additional indexes, CHECK, or unique key created in any migration.

### RLS
Enabled (`20251016021558`). Effective policy names:
- `All authenticated users full access to site_document_categories` — `FOR ALL … USING(auth.uid() IS NOT NULL) WITH CHECK(auth.uid() IS NOT NULL)` (20251120080517).

(The Admin/Contractor role-scoped policies from 20251119090820 were dropped by 20251120080517; the original `Authenticated users can manage site document categories` and anon `Public users can view site document categories` were earlier removed — the latter dropped 20251016035546.) **No anon `USING(true)` SELECT policy survived to the tier-2 run → tier-2 did NOT affect this table.**

### Triggers
None (no `updated_at` column; no trigger created).

### Notable history
- Backfilled from legacy free-text `site_documents.category` at creation (20251016021558).
- RLS churn: anon read existed only 20251016021558→20251016035546.

---

## public.site_documents

**Purpose.** Site-level document records (file URL + free-text `category`, with an FK `category_id` to `site_document_categories`). Representative read: `src/components/site/GenerateFinalReportButton.tsx:119` — `supabase.from('site_documents').select('id, file_name, category, site_document_categories(name)').eq('site_id', site.id)`. Created `20251014140001`.

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| site_id | uuid | no | — | → sites(id) ON DELETE CASCADE |
| category | text | no | — | (legacy free-text) |
| file_name | text | no | — | |
| file_url | text | no | — | |
| file_count | integer | yes | 1 | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| category_id | uuid | yes | — | → site_document_categories(id) ON DELETE CASCADE (20251016021558) |

types.ts (`src/integrations/supabase/types.ts:2476-2525`) matches; no discrepancies.

### Constraints / indexes / unique
- PK on id. No additional indexes, CHECK, or unique key created in any migration.

### RLS
Enabled (`20251014140001`). Effective policy names:
- `Admins can manage all site documents` (20251120110544)
- `Clients can view site documents for their sites` (20251120110544)
- `Contractors can view site documents for assigned sites` (20251120110544)
- `Users can manage all site documents` (20251120111033)
- `auth_read_site_documents` — created by tier-2, replacing the dropped `Public can view site_documents` (`USING(true)`, conditionally created 20260123052442). **Tier-2 affected this table.**

### Triggers
- `update_site_documents_updated_at` — BEFORE UPDATE → `update_updated_at_column()` (20251014140001).

### Notable history
- `category_id` FK column added + backfilled from the (site_id, category) text pair (20251016021558).
- Heavy anon-read churn: `Public users can view site documents` (20251015103303, dropped 20251016035546); `Public can view site documents` (20251016064723) and per-command policies → blanket auth (20251120080517) → role-scoped (20251120110544) → public read re-added (20260123052442, conditional) → tier-2 demotion (2026-06-11).

---

## public.site_marking_checklist

**Purpose.** Per-site "Fortress" marking checklist items with check/N-A status. Representative read: `src/components/FortressMarkingChecklist.tsx:49` — `supabase.from('site_marking_checklist')…`. Created `20251027105104`.

### Effective columns
| name | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| site_id | uuid | no | — | → sites(id) ON DELETE CASCADE |
| item_id | text | no | — | |
| item_name | text | no | — | |
| section_name | text | no | — | |
| is_checked | boolean | yes | false | |
| checked_by | uuid | yes | — | → auth.users(id) |
| checked_at | timestamptz | yes | — | |
| notes | text | yes | — | |
| created_at | timestamptz | yes | now() | |
| updated_at | timestamptz | yes | now() | |
| status | text | yes | 'pending' | CHECK `status IN ('pending','completed','not_applicable')` (20251027110429) |

types.ts (`src/integrations/supabase/types.ts:2527-2578`) matches; no discrepancies.

### Constraints / indexes / unique
- PK on id.
- **UNIQUE(site_id, item_id)** — table-level unique key (20251027105104).
- CHECK: `status IN ('pending','completed','not_applicable')` (20251027110429).
- Index: `idx_site_marking_checklist_site_id` (20251027105104).

### RLS
Enabled (`20251027105104`). Effective policy names:
- `All authenticated users full access to site_marking_checklist` — `FOR ALL … USING(auth.uid() IS NOT NULL) WITH CHECK(auth.uid() IS NOT NULL)` (20251120080517).

(The original four `Authenticated users can {view,create,update,delete} marking checklists` policies from 20251027105104, and the Admin/Contractor policies from 20251119090820, were dropped by 20251120080517.) **No anon SELECT policy ever existed → tier-2 did NOT affect this table.**

### Triggers
- `update_site_marking_checklist_updated_at` — BEFORE UPDATE → `update_updated_at_column()` (20251027105104).

### Notable history
- `status` column (with CHECK) added one migration after creation (20251027110429).
- RLS churn: role-scoped (20251119090820) → blanket auth (20251120080517).

---

## Dropped tables
None of the 12 tables in this batch was dropped. All exist in the effective schema and in `src/integrations/supabase/types.ts`.
