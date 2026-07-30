# D03 — db-era-2026-current

- Unit id: D03
- Slug: db-era-2026-current
- Spec mode: aggregate (one composite spec for the migration era 2026-06 → 2026-07)
- Date: 2026-07-29
- File count: 46 (authoritative set = `review/unit-files.json` key "D03"; printed count 46; includes the era's two `.down.sql` files)

## 1. Unit purpose

The 46 migrations from 20260610113000 through 20260727102000 (2,607 LOC total, `wc -l`) define the application's **present security and compliance model**. Six overlapping arcs run through the era: (a) the airtight public-share RPC rebuild — token/ID-scoped SECURITY DEFINER functions replacing direct anon table reads; (b) an RLS lockdown campaign (write-side, anon, admin-config, storage, per-table leak fixes); (c) the COC model's four-step evolution from auto-validation to manual verdict to per-document rollup to register-truth; (d) a feature razor dropping 12 tables across four removed features; (e) the Fortress building/facilities layer (12 new tables, hardened twice, the only reversible migrations in the repo); and (f) the July QR-platform batch (scan hardening, public verdict RPCs, kill-switch, public snag channel). Every migration from 20260525120000 onward is human-named (D02 note); all 46 here are human-named.

A defining property of this era: **prod is ahead of `schema_migrations`**. Eleven of the 46 files carry explicit prod-drift language — either "applied via the Supabase Management API, NOT `supabase db push`" or guards written "for prod schema being ahead of migration history" (§6, §5.3). Several files exist purely to *record* SQL already applied out-of-band (20260615130000:5-6, 20260616100000:12), and one exists purely to delete a stale policy from history that prod had already lost (20260614110000:1-16).

uses -> objects created in earlier eras: `public.has_role(uuid, app_role)` and `public.user_sites` (D01 — e.g. 20260610120000:41, 20260612220000:54), `public.get_user_client_id()` (D01 20251017054255; used at 20260612220000:58, 20260623120000:30, 20260708090000:36), `public.client_access_links` (D02 20260122090622; typed at 20260610113000:10), `public.update_updated_at_column()` (D01; 20260612200000:340), `qr_scans` table (D01 20251014140001; altered at 20260727100000:11), `calendar_events` (D01 20251014132137; altered at 20260612250000:7-10).

## 2. Per-file index (chronological, all 46)

LOC per `wc -l`. "Theme" is what the file's DDL/DML actually does (verified by full read of every file).

| file (supabase/migrations/) | LOC | what it does |
|---|---|---|
| 20260610113000_public_rpcs_phase1.sql | 77 | Creates `_share_link(text)` (SECURITY DEFINER, revoked from PUBLIC, *not* granted to anon — :9-19), `get_public_subsection(uuid)` (no-token QR page payload — :22-50), `get_public_portfolio(text)` (token-scoped — :53-77). "ADDITIVE ONLY" (:4) |
| 20260610120000_phase1_write_lockdown.sql | 104 | Replaces blanket authenticated FOR ALL write policies on `clients`, `coc_validations`, `coc_extractions` with the "staff" predicate `NOT Contractor AND NOT Client` (:35-97); write side only, anon SELECT deliberately left (:22-25) |
| 20260610130000_public_drilldown_rpcs.sql | 164 | Creates `get_public_site_review(text,uuid)` (:12-83) and `get_public_subsection_review(text,uuid)` (:86-164), each validating the token via `_share_link` then scope-checking client/site/subsection ids (closes "Vuln 6/7" IDORs — :4-6) |
| 20260611100000_anon_lockdown_oob_tables.sql | 27 | `REVOKE ALL ... FROM anon` on `contractor_coc_uploads` and `inspection_relink_audit` (:24-25) — two tables created out-of-band via the dashboard, missed by both lockdowns (:3-8); cites live anon REST evidence (:10-13) |
| 20260611110000_emergency_triage_lockdown.sql | 59 | Drops the three "Anyone can …" blanket anon storage write policies (:21-23), replaces with authenticated-only `WITH CHECK (true)` writes (:25-30); settings writes → Admin-only (:33-42); drops blanket write policies on `inspection_templates` and `validation_feedback` (:45-51) |
| 20260611140000_admin_config_write_lockdown.sql | 161 | Staff-predicate write policies for `inspection_templates` (:48-61), `settings` (:71-94), `validation_feedback` UPDATE (:105-118); documents that anon branding read on settings MUST remain (:34-36); manual rollback SQL in comments (:140-161) |
| 20260611150000_snag_status_lifecycle.sql | 28 | snags status vocabulary → `Open`/`Rectified`/`Closed`: normalises casing (:12-18), promotes rectified_at rows (:21-23), re-adds CHECK (:25-26) |
| 20260611160000_coc_manual_workflow.sql | 49 | Adds `subsections.coc_expiry_date/coc_failure_reasons/coc_reviewed_by/coc_reviewed_at` (:4-8); normalises `coc_status` to Missing/Pending/Pass/Fail/N-A + strict CHECK (:10-21); rewrites `sync_coc_compliance_status()` to stop reading coc_validations (:24-35); recreates `trg_sync_coc_compliance` (:38-41); backfills is_compliant (:44-47) |
| 20260611161000_coc_status_check_permissive.sql | 21 | Relaxes the day-old strict CHECK to the union with legacy vocabulary ('Approved','Valid','Failed','Rejected','none') because the old validation flow was still deployed (:12-19); says "tighten this back ... in the same migration that deletes the validation engine" (:10-11) |
| 20260612120000_coc_compliance_gate.sql | 71 | Drops `trg_sync_coc_compliance`/`sync_coc_compliance_status` (:5-6); redefines `apply_subsection_recompute(uuid)` with a COC gate — required-COC Fail/Rejected or expired Pass forces `is_compliant=false`, Pass does not auto-promote (:10-59); full backfill loop (:62-69) |
| 20260612130000_drop_coc_validation_tables.sql | 11 | Drops `coc_validations`, `coc_extractions`, `coc_validation_settings`, `coc_local_validations`, `coc_compliance_photos` (+ its _snap_20260421) CASCADE (:4-9); keeps contractor_coc_uploads (:11) |
| 20260612131000_drop_validation_feedback_tables.sql | 7 | Drops `validation_feedback`, `validation_conversations`, `validation_messages` CASCADE (:4-6) |
| 20260612140000_coc_per_document_rollup.sql | 119 | Adds `subsection_documents.coc_expiry_date` (:6); permissive per-document coc_status CHECK (:11-16); normalises coc_type/coc_status values (:18-30); creates `rollup_subsection_coc_status(uuid)` (Fail>Pass>Pending over COC-category docs, expiry folded in — :33-70); simplifies `apply_subsection_recompute` (drops its expired-Pass branch — :75-96); creates `trg_rollup_coc_from_documents` AFTER I/D/U OF coc_status,coc_type,coc_expiry_date,category_id (:98-110); full backfill (:113-117) |
| 20260612200000_fortress_building_layer.sql | 375 | 13 building-profile columns on `sites` (:25-38); creates 12 Fortress tables: building_assets (:53-79), ppm_tasks (:84-100), ohs_compliance_items (:105-121), building_condition_items (:127-142), utilities_readings (:147-174), tenants (:179-199), tenant_shop_specs (:204-226), tenant_trading (:231-249), tenant_movements (:254-268), security_incidents (:273-286), masterfile_index (:291-303), expense_recoveries (:308-324); loops updated_at triggers (:329-342) and RLS = blanket authenticated read + Admin/User manage (:347-373); header says "Reviewed-not-applied ... NOT been run against the live DB" (:18-19) |
| 20260612210000_fortress_layer_hardening.sql | 82 | SV-fix follow-up: pre-audit guard raising if base missing (:18-24); `building_assets.next_service_date` + index (:29-33); FK/trend indexes (:36-39); `deleted_at` soft-delete on building_assets/tenants + partial live indexes (:42-45); `created_by` on 9 captured tables (:48-58); in-file verification block (:61-68); BEGIN/COMMIT wrapped (:26,70) |
| 20260612210000_fortress_layer_hardening.down.sql | 36 | Exact reversal of the up file (columns, indexes) — one of only two .down.sql files in the whole repo (:1-36) |
| 20260612220000_fortress_rls_scope.sql | 65 | Replaces the 12 blanket `auth_read_*` policies with `scoped_read_*`: Admin/User full, Contractor via user_sites, Client via get_user_client_id() (:46-61); pre-audit guards for the two dependencies (:23-32); uses `(select auth.uid())` for per-query evaluation (:17) |
| 20260612220000_fortress_rls_scope.down.sql | 20 | Restores blanket auth_read_* — warns "reverting RE-OPENS cross-tenant read. Only roll back in non-prod" (:3) |
| 20260612230000_drop_feedback_feature_tables.sql | 10 | Drops `notifications`, `issue_reports`, `suggestions` CASCADE — whole in-app feedback feature removed with its UI + verify-fix edge fn (:1-8) |
| 20260612240000_calendar_events_date_order_check.sql | 8 | CHECK `end_date >= start_date` on calendar_events (inverted interval crashed the year grid via date-fns RangeError — :1-6) |
| 20260612250000_calendar_events_tenancy_rls.sql | 45 | Adds `site_id`/`created_by`/`updated_by` (:7-10); backfills site_id by exact name match, "~9/41 stay NULL" (:12-17); status/priority CHECKs (:20-25); replaces the permissive policy with Staff-manage-all + Client read-own-sites (:28-43) |
| 20260614090000_drop_schematic_ai_detection.sql | 14 | Drops `site_schematics.detected_regions/detection_status/regions_detected_at` + index; "IF EXISTS guards tolerate the prod schema being ahead of migration history" (:7) |
| 20260614090500_schematic_blocks_page_number.sql | 13 | `schematic_blocks.page_number int NOT NULL DEFAULT 1` + (schematic_id,page_number) index — blocks previously bled onto every PDF page (:3-5) |
| 20260614100000_public_site_review_schematic_assets.sql | 94 | CREATE OR REPLACE `get_public_site_review` — same token scope, payload extended with `schematic`, `schematic_blocks`, `site_assets` keys and inspections `title` (:77-90) so public review renders without direct anon table reads |
| 20260614110000_drop_stale_anon_site_assets_policy.sql | 16 | Drops "Public can view site assets" (anon USING true, from 20260217085025) from history — prod already lost it via SQL-editor tier-2 lockdown; prevents a fresh apply reintroducing it (:2-16) |
| 20260615120000_recompute_on_inspection_change.sql | 41 | Creates `trg_recompute_from_inspections()` + trigger AFTER I/D/U OF status,subsection_id ON inspections → apply_subsection_recompute (:20-32); full backfill (:35-39); warns apply_subsection_recompute "lives in prod (applied via the Management API, not repo migrations)" (:11-14) |
| 20260615130000_drop_inspection_signatures.sql | 93 | CREATE OR REPLACE `get_public_subsection_review` minus the `signatures` aggregation (:14-90); drops `inspection_signatures` (+ empty snapshot) (:92-93); "Applied to PROD via the Supabase Management API on 2026-06-15 ... this file is for repo parity" (:5-6) |
| 20260615140000_inspection_status_existence_based.sql | 109 | CREATE OR REPLACE `recompute_subsection_installation_status(uuid)`: most-recent inspection per template by date regardless of status marker; thresholds from `get_compliance_setting_numeric/bool`, items via `classify_field_status`, photo-presence upgrade, snag demotion (:14-109); "Applied to PROD via the Management API on 2026-06-15" (:9-10) |
| 20260616100000_fix_recompute_from_template_trigger.sql | 36 | CREATE OR REPLACE `trg_recompute_from_template()` comparing `sections` (not the nonexistent `sections_json` the prod-created version used, which errored on EVERY template update — :3-10); records SQL applied to prod 2026-06-16 (:12); the CREATE TRIGGER itself appears nowhere in repo history (grep-verified, §6.2) |
| 20260616110000_site_health_snapshots.sql | 28 | Creates `site_health_snapshots` (UNIQUE(site_id, captured_at) — :3-16), index, RLS = authenticated read USING(true) (:24-28); "Written by the scheduled capture job (service role bypasses RLS)" (:2); no write policies |
| 20260616120000_subsection_thermal_required.sql | 19 | `subsections.is_thermal_required boolean NOT NULL DEFAULT false` (:7-8); backfill marks rows already holding a thermal/infrared-category document (:10-17) |
| 20260616130000_subsection_inspection_required.sql | 8 | `subsections.is_inspection_required boolean NOT NULL DEFAULT true` — false waives the subsection from inspection checklist/grading/KPIs (:1-6) |
| 20260619120000_coc_evaluation_reports.sql | 11 | `subsection_documents.parent_document_id` self-FK ON DELETE CASCADE + index — links an evaluation report to its COC certificate; report categories are excluded from the roll-up (:1-9) |
| 20260619130000_site_coc_system.sql | 90 | Creates the register import model: `coc_import_batches` (:5-16), `coc_db_schedule` (:18-36), `coc_certificates` (rules jsonb SANS grid — :38-61), indexes (:63-66), RLS = four blanket authenticated CRUD policies per table (:73-88) |
| 20260619140000_coc_cert_document_links.sql | 7 | `coc_certificates.coc_document_id` / `.eval_document_id` FKs → subsection_documents ON DELETE SET NULL (:3-5) |
| 20260619150000_coc_file_pool.sql | 25 | Creates `coc_file_pool` ("every dropped file uploads here first (never rejected)" — :1-2): detected_cert_no/detected_kind/status/assigned_* columns (:3-16); RLS = blanket authenticated CRUD (:20-23) |
| 20260621120000_site_documents_management.sql | 35 | `site_documents` + file_size/mime_type/uploaded_by/updated_by (:7-10); `is_system` flag on BOTH category tables (:13-14); seeds is_system for named report categories and `%coc%`/`%evaluation report%` subsection categories (:17-33); "apply via the Supabase Management API ... NOT db push" (:3-4) |
| 20260623120000_coc_client_read_and_leak_fix.sql | 74 | Replaces the blanket `using(true)` policies on the three COC register tables: staff read = `NOT has_role('Client')` (:13-15,22-24,38-40), clients read own-site rows on schedule + certificates (:26-31,42-47), writes staff-only via loop (:52-72); note this file's "staff" = Admin / Contractor / User (:3-4) |
| 20260624120000_coc_pool_reasons.sql | 6 | `coc_file_pool.reason text` + `candidate_ids jsonb DEFAULT '[]'` — persists why a pooled file is unassigned (:1-4) |
| 20260708090000_site_health_snapshots_scoping.sql | 38 | Replaces USING(true) snapshot read with affirmative allowlist: Staff (Admin/User/Moderator) all rows (:18-26), Clients own sites (:28-38), Contractors nothing (:9); "NOT-based policies silently include users with no role row at all" (:10-11) |
| 20260708150000_null_health_scores_for_empty_sites.sql | 11 | Backfill: `health_score = NULL` where total_subsections = 0 — kills "fabricated 100" scores (920 rows, 40 of 76 sites read 100% — :3-7) |
| 20260708170000_empty_sites_score_zero.sql | 9 | Same-day product-decision reversal: empty sites score **0**, "Supersedes the interim backfill (20260708150000)" (:1-5) |
| 20260725100000_coc_register_truth.sql | 114 | Register-truth model: CREATE OR REPLACE `rollup_subsection_coc_status` WITHOUT the expired-Pass branch (:10-41); one-time backfill stamping docs from `coc_certificates.verdict` (linked docs :52-65, cert-no-matched docs :68-84, unbacked COC docs reset to Pending :88-101, RAISE NOTICE counts :103-104); full re-rollup loop (:108-112) |
| 20260727100000_qr_scans_hardening.sql | 40 | `qr_scans.source` ('redirect'/'landing' CHECK — :11-17); analytics indexes (:20-23); drops the blanket "Anyone can insert scans" anon policy (:27); INSERT now authenticated own-row landing only (:30-32); Admin DELETE policy (previously cleanup calls were "silent no-ops" — :34-40); "PROD APPLY: Supabase Management API ... NOT supabase db push (prod schema is ahead of schema_migrations)" (:5-6) |
| 20260727101000_public_verdict_rpcs.sql | 121 | Part A: `get_public_subsection` re-created with a `verdict` key (coc_required/status/cert_number/issue_date/expiry_date from the governing COC document — :51-73); Part B: new `get_public_site_register(uuid)` — bare-ID anon site-level COC counts + last_import (:93-116); exclusion list of deliberately-unexposed fields (:8-13); anon-hot-path indexes (:119-121); "Go-live must happen AFTER 20260725100000" (:15-17) |
| 20260727102000_qr_killswitch_snag_channel.sql | 16 | `subsections.qr_disabled boolean NOT NULL DEFAULT false` (checked by qr-redirect — :7-8); `snags.reported_channel` 'internal'/'public_qr' + CHECK (:10-16) |

## 3. The era's arcs (what changed, in order)

### 3.1 Public-share RPC rebuild (0610 → 0614 → 0727)

Three phases plus two later body revisions. Phase 1 (20260610113000) introduces the pattern: SECURITY DEFINER + `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC` then `GRANT EXECUTE ... TO anon, authenticated`, returning a single curated jsonb payload. Phase 2 (20260610130000) adds the two token+id drill-downs with in-DB scope checks (client-scoped, site-scoped, and — for subsection review only — subsection-scoped links; 20260610130000:106-114). The bodies are then revised in place twice: 20260614100000 widens the site-review payload (schematic/blocks/site_assets), and 20260615130000 strips `signatures` from subsection review when the feature is dropped. 20260727101000 adds the verdict key and the sixth RPC. Two RPCs are **bare-ID, no token**: `get_public_subsection` (QR page; id comes from the printed QR URL) and `get_public_site_register` (deliberate: "the aggregate exposes nothing not already reachable" — 20260727101000:90-92).

### 3.2 Lockdown campaign (0610 → 0611 → 0623 → 0708 → 0727)

Sequence: write-side staff boundary on 3 tables (20260610120000) → out-of-band-table anon revoke (20260611100000, notable for using role-level `REVOKE` instead of policies: "anon hits permission-denied before RLS is evaluated" :18-19) → storage/settings/templates triage (20260611110000) → 3 admin-config tables (20260611140000) → Fortress read scoping (20260612220000) → calendar tenancy (20260612250000) → COC-table cross-tenant leak fix + client read grants (20260623120000) → snapshot read scoping (20260708090000) → qr_scans anon-INSERT removal (20260727100000). A referenced companion, the "tier-2 anon-read lockdown", was applied **directly via the SQL editor** and lives only under docs/security/ (20260611100000:4, 20260614110000:5-7) — unit X05, not in migration history.

Three different "staff" definitions are used across the era: (1) `NOT Contractor AND NOT Client` (20260610120000:14-19, 20260611140000); (2) `NOT Client` only — explicitly including Contractor (20260623120000:3-4); (3) affirmative allowlist Admin/User/Moderator (20260708090000:7-11, which criticises NOT-based predicates). 20260611110000:6-11 documents that while public signup is open, any self-registered account counts as staff under definition (1).

### 3.3 COC model: four regimes in 45 days

1. **Manual verdict** (20260611160000): verdict lives on `subsections.coc_status`; `sync_coc_compliance_status` BEFORE-trigger derives is_compliant from verdict + expiry.
2. **Compliance gate** (20260612120000): trigger dropped; `apply_subsection_recompute` becomes the single owner of is_compliant, with COC as a demote-only gate.
3. **Per-document rollup** (20260612140000): verdicts move to `subsection_documents.coc_status`; `rollup_subsection_coc_status` classifies COC-category docs (Fail > Pass > Pending, none = Missing) and writes subsections.coc_status; expiry folded into the rollup; a document trigger drives it.
4. **Register truth** (20260725100000): the imported workbook verdict (`coc_certificates.verdict`) is the only source of Pass/Fail; the expired-Pass branch is deleted from the rollup ("Expiry no longer silently fails a Pass" :4-5); a three-part backfill stamps linked/cert-no-matched docs and regresses unbacked manual Passes to Pending (:86-101).
The supporting register tables arrive 20260619130000-150000 (import batches, schedule, certificates, file pool) and get columns 20260619140000/20260624120000.

### 3.4 Feature razor

Four features deleted from the schema in this era, 12 tables total: COC auto-validation engine (5 tables + snapshot, 20260612130000), validation feedback loop (3 tables, 20260612131000), in-app issue-reporting/suggestions/notifications (3 tables, 20260612230000), inspection signatures (1 table + snapshot, 20260615130000), plus the schematic AI-detection columns (20260614090000). Each file records the corresponding UI/edge-function removal in comments.

### 3.5 Fortress layer

20260612200000 (375 LOC, the era's largest file) adds the property-management data model — 12 tables hanging off `sites`, plus 13 building-profile columns on sites. Two hardening rounds follow same-day: column/index/soft-delete fixes (…210000) and read-scoping RLS (…220000). These are the only two migrations in the entire repo with `.down.sql` counterparts and the only ones with in-file pre-audit guards + verification blocks. The header states it was "Reviewed-not-applied" at authoring time (:18-19). Its seed data lives in D04 (`supabase/seeds/fortress_abaqulusi_seed.sql`, also marked not-applied). App-side consumption is types-only (§5, L20).

### 3.6 Health snapshots and scoring semantics

20260616110000 creates `site_health_snapshots` (written by the A02 capture route with service role — no write policies exist on the table). 20260708090000 scopes reads. The two 2026-07-08 backfills flip the empty-site semantics twice in one day: fabricated-100 → NULL ("no data") → 0 ("zero progress"), the second explicitly superseding the first (20260708170000:3-5).

### 3.7 QR platform (July batch, current branch)

20260727100000/101000/102000 land together with the feat/qr-platform work: scan provenance + indexes + policy rebuild; public verdict exposure with an explicit exclusion contract (failure reasons, issuer, SANS rules, reviewed_at all withheld — 20260727101000:8-13); per-subsection kill-switch consumed by the qr-redirect edge function; snag provenance channel written by the report-issue edge function.

## 4. CURRENT END-STATE SURFACE (as this era leaves it)

### 4.1 Anon-callable RPC list (final signatures + defining file)

All are `SECURITY DEFINER SET search_path = public`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO anon, authenticated` unless noted:

| function | args → returns | token? | final body defined in | payload keys |
|---|---|---|---|---|
| `_share_link` | (p_token text) → client_access_links | validates | 20260610113000:9-19 | **not anon-callable** — revoked from PUBLIC, no grant; internal helper resolving active, unexpired link rows |
| `get_public_subsection` | (p_subsection_id uuid) → jsonb | **none** (bare QR id) | 20260727101000:24-78 | settings, subsection, site, categories(+subsection_documents), snags, **verdict** (null unless is_coc_required; cert fields from the governing COC doc via LATERAL — :60-72) |
| `get_public_portfolio` | (p_token text) → jsonb | client-scoped link | 20260610113000:53-77 | settings, client, sites(+total_subsections, open_snags) |
| `get_public_site_review` | (p_token text, p_site_id uuid) → jsonb | client- or site-scoped | 20260614100000:9-94 | settings, site, client, subsections, snags, site_documents, site_document_categories, inspections(json_data incl.), subsection_documents, schematic, schematic_blocks (full `to_jsonb`), site_assets (full `to_jsonb`) |
| `get_public_subsection_review` | (p_token text, p_subsection_id uuid) → jsonb | client-, site- or subsection-scoped | 20260615130000:14-90 | settings, subsection, site, client, documents, snags, inspections(+template_name/sections, json_data), floor_plans(+pins_count); signatures key removed |
| `get_public_site_register` | (p_site_id uuid) → jsonb | **none** (bare site id) | 20260727101000:93-116 | settings, site(id+name), counts{required,pass,fail,pending,missing}, last_import |

### 4.2 Trigger / recompute pipeline (final wiring)

Ownership rule stated in-history: `is_compliant` is "single-owned by apply_subsection_recompute" (20260615120000:3-4).

- `subsection_documents` I/D/U(coc_status, coc_type, coc_expiry_date, category_id) → `trg_rollup_coc_from_documents` (20260612140000:106-110) → `rollup_subsection_coc_status(uuid)` [final body 20260725100000:10-41: classify COC-category docs Fail>Pass>Pending/Missing, write subsections.coc_status, then call the recompute directly] → `apply_subsection_recompute(uuid)`.
- `inspections` I/D/U(status, subsection_id) → `trg_recompute_from_inspections` (20260615120000:28-32) → `apply_subsection_recompute`.
- `inspection_templates` UPDATE → `trg_recompute_from_template()` [function body fixed in repo at 20260616100000:14-36; the CREATE TRIGGER statement exists only in prod — created out-of-band, grep of all migrations finds no `CREATE TRIGGER` for it] → recompute for every subsection using the template.
- `apply_subsection_recompute(uuid)` [final body 20260612140000:75-96]: calls `recompute_subsection_installation_status`, maps status→is_compliant (compliant→true, non_compliant/requires_attention→false, incomplete→NULL), applies the COC gate (required + coc_status ∈ Fail/Failed/Rejected forces false), conditional UPDATE of installation_status/score/is_compliant.
- `recompute_subsection_installation_status(uuid)` [final body 20260615140000:14-109]: existence-based — most recent non-deleted inspection per template regardless of status marker; item pass/fail via `classify_field_status`; thresholds and toggles from `get_compliance_setting_*`; open-physical-snag demotion.
- A defender trigger on `subsections` (`trg_recompute_subsection_defender`, self-guarding at `pg_trigger_depth()>1`) is *referenced* as live (20260612140000:64-67, 20260615120000:16-18) but defined in no repo migration (§6.2).
- Dropped this era: `trg_sync_coc_compliance` + `sync_coc_compliance_status()` (created 20260611160000:24-41, dropped 20260612120000:5-6).

### 4.3 Prod-vs-schema_migrations divergence (the era's operating condition)

Files stating prod was applied out-of-band or guarding for drift, with their own words:

- 20260615120000:11-14 — "apply_subsection_recompute lives in prod (applied via the Management API, not repo migrations — see the known schema drift). Do NOT blind `supabase db push`".
- 20260615130000:5-6 — "Applied to PROD via the Supabase Management API on 2026-06-15 (prod schema is ahead of schema_migrations …); this file is for repo parity."
- 20260615140000:9-10 — "Applied to PROD via the Management API on 2026-06-15 … (prod-drift: not via db push)."
- 20260616100000:3-12 — fixes a trigger function "created directly in prod (drift — never recorded in the repo)"; the bug had "silently blocked ALL template editing app-wide".
- 20260621120000:3-4 — "apply via the Supabase Management API database/query endpoint (NOT db push) due to prod/migration drift."
- 20260727100000:5-6, 20260727101000:14-15, 20260727102000:4-5 — "PROD APPLY: Supabase Management API database/query (project oltzgidkjxwsukvkomof), NOT supabase db push (prod schema is ahead of schema_migrations)."
- Drift-tolerant guards: 20260614090000:7 and 20260614090500:7 ("Safe/idempotent for prod schema drift"); 20260614110000 exists solely to reconcile history with a prod-side policy removal; 20260611100000:5-8 attributes the hole it closes to out-of-band table creation (G-OPS-01 "schema-drift root cause").

Consequence recorded in-history, not assumed: repo migration files are not a complete description of prod (objects exist in prod with no repo CREATE — §6.2), and three 2026-07 files instruct that prod application happens via Management API with this file serving as the record.

## 5. Used-by mapping (grep-verified; unit ids per review/manifest.md)

Grep basis: `grep -rn` over `src` and `supabase/functions` for each function/table/column name, excluding the untracked `" 2."` working-tree duplicates and the generated `src/integrations/supabase/types.ts`.

**RPCs**
- `get_public_subsection` — used by <- V04 (src/views/PublicSubsection.tsx:143; verdict key consumed at :177,373) and typed in L19 (src/integrations/supabase/types.ts:3108).
- `get_public_portfolio` — used by <- V04 (src/views/PublicClientPortfolio.tsx:108).
- `get_public_site_review` — used by <- V04 (src/views/PublicSiteReview.tsx:184), C07 (src/components/site/AssetVerification.tsx:82), C09 (src/components/site/SchematicDiagram.tsx:782).
- `get_public_subsection_review` — used by <- V04 (src/views/PublicSubsectionReview.tsx:168).
- `get_public_site_register` — used by <- V04 (src/views/PublicSiteRegister.tsx:46).
- `_share_link` — used by <- none found in src/supabase-functions besides generated types (grep-verified); called only by the other RPCs in-database (20260610130000:18,93).

**COC register + pool tables**
- `coc_import_batches` — used by <- V06 (src/views/site-coc/useSiteCocImport.ts:52,136; useSiteCoc.ts).
- `coc_db_schedule` — used by <- V06 (useSiteCoc.ts, useSiteCocImport.ts), C03 (src/components/client-portal/ClientCocView.tsx:44).
- `coc_certificates` — used by <- V06 (useSiteCoc.ts, useSiteCocImport.ts), C03 (ClientCocView.tsx), L03 (src/lib/siteCoc/verdictMap.ts:2 — maps `coc_certificates.verdict` to doc status), L04 (src/lib/coc/assignPoolFile.ts:17,21; reassignPool.ts).
- `coc_file_pool` (+ reason/candidate_ids/detected_cert_no) — used by <- L04 (src/lib/coc/poolUpload.ts:26; assignPoolFile.ts; reassignPool.ts), V06 (useSiteCocPool.ts, AssignSubTab.tsx), L01/L02 (src/lib/siteCoc/assignmentEngine.ts + tests reference detected_cert_no).
- `coc_certificates.coc_document_id/eval_document_id` and `subsection_documents.parent_document_id` — used by <- L04 (src/lib/coc/uploadCocFiles.ts:67), C17 (src/components/coc/CocCertificateList.tsx), V07 (src/views/subsection-detail/useSubsectionDetail.ts, types.ts).

**Snapshots + scoring**
- `site_health_snapshots` — used by <- A02 (src/app/api/snapshots/capture/route.ts:93 — the service-role writer; CRON_SECRET gate :37), H03 (src/hooks/useSiteScores.ts:26), L17 (src/lib/snapshotMetrics.ts:1, src/lib/siteScores.ts), C14 (src/components/ComplianceDashboard.tsx).
- `subsections.is_thermal_required` — used by <- L17 (src/lib/siteDeliverables.ts:26), A02 (capture route), V01 (src/views/Dashboard.tsx), V07 (OverviewTab.tsx, useSubsectionDetail.ts).
- `subsections.is_inspection_required` — used by <- L17 (src/lib/siteHealth.ts:14,73 + siteScores), H03 (useSiteScores.ts), A02, C14 (SiteSummaryReport.tsx is C14-adjacent reports).
- Snag lifecycle vocabulary ('Rectified'/'Closed') — used by <- L17 (src/lib/siteHealth.ts:35 `RESOLVED_SNAG_STATUSES = ['Rectified','Closed']`) and the L17/L09 test files.

**QR platform**
- `qr_scans` (+ source) — used by <- F02 (supabase/functions/qr-redirect/index.ts:53-57 service-role insert with source:'redirect'), V04 (src/views/PublicSubsection.tsx:131 authenticated landing insert source:'landing'), V01 (Dashboard.tsx, SiteDetail.tsx), V02 (QRActivity.tsx), V07 (useSubsectionDetail.ts), C09 (src/components/site/QRScanActivity.tsx).
- `subsections.qr_disabled` — used by <- F02 (qr-redirect/index.ts:115,146,159; report-issue/index.ts:73-77 returns 404 when disabled), V02 (src/views/QRCodes.tsx:21,78).
- `snags.reported_channel` — used by <- F02 (report-issue/index.ts:103 writes 'public_qr'); no other src reference (grep-verified).
- Public verdict payload shape — used by <- L17 (src/lib/publicVerdict.ts:24 `presentVerdict`), V04 (PublicSubsection.tsx:373-375).

**Other**
- `calendar_events` (site_id column + policies) — used by <- V01 (src/views/Calendar.tsx:104,306), V03 (ClientPortalCalendar.tsx), V01 (Dashboard.tsx).
- `site_documents` metadata + `is_system` — used by <- C08 (src/components/site/SiteDocuments.tsx:42, MoveDocumentsDialog.tsx), L14 (src/lib/pdfDocumentSaver.ts:79,149 writes is_system:true), L04 (uploadCocFiles.ts), V01 (SiteDetail.tsx).
- `schematic_blocks.page_number` — used by <- C09 (src/components/site/SchematicDiagram.tsx).
- Fortress tables — used by <- L20 types/comments only: src/lib/fortress/types.ts:8,38 (hand-written mirrors of building_assets / ohs_compliance_items), src/lib/fortress/ppm.ts:3 (comment naming building_assets.next_service_date). Runtime table access: **none found** — `from('tenants')`, ppm_tasks, utilities_readings, security_incidents, masterfile_index, expense_recoveries, tenant_trading, tenant_movements, tenant_shop_specs, building_condition_items each have zero non-generated src/supabase-functions hits (grep-verified). Seed inserts live in D04.
- `contractor_coc_uploads`, `inspection_relink_audit` — used by <- none found (grep-verified; matches 20260611100000:14-16 "ZERO read/write call sites").
- `subsections.coc_reviewed_by/coc_reviewed_at` (added 20260611160000:7-8) — used by <- none found (grep-verified; 20260727101000:12-13 states the same: "zero writers in the codebase today").
- `subsections.coc_failure_reasons` — used by <- V07 (src/views/subsection-detail/useSubsectionDetail.ts) only.

## 6. Observed issues (factual, verified)

1. **Recompute's snag filter uses a vocabulary the same era's CHECK forbids.** `recompute_subsection_installation_status` counts open physical snags with `sn.status in ('open', 'in_progress')` (20260615140000:44), while 20260611150000:26 constrains `snags.status` to exactly ('Open','Rectified','Closed') — case-sensitive IN, so neither lowercase value can match a constraint-conforming row; 'in_progress' is not in the lifecycle at all.
2. **The pipeline depends on objects no repo migration creates.** Grep across all tracked migrations finds no definition of `get_compliance_setting_numeric`, `get_compliance_setting_bool`, or `classify_field_status` (all called at 20260615140000:20-23,73), no `CREATE TRIGGER` for `trg_recompute_subsection_defender` (referenced as live at 20260612140000:64-67, 20260615120000:16-18) or for `trg_recompute_from_template`'s trigger (only the function body, 20260616100000), and no original CREATE of `recompute_subsection_installation_status` before the CREATE OR REPLACE at 20260615140000:14. Also `snags.snag_type` and `snags.deleted_at` (read at 20260615140000:43-45) are added by no migration. These exist only in prod (consistent with §4.3).
3. **The transitional coc_status CHECK was never re-tightened.** 20260611161000:10-11 instructs "tighten this back to the strict set in the same migration that deletes the validation engine"; 20260612130000 (the deletion) does not touch the constraint, and grep shows `subsections_coc_status_check` is last modified by 20260611161000 — the permissive union incl. 'Approved','Valid','Failed','Rejected','none' remains the recorded constraint. 20260727101000:84-87 describes the column as constrained to the strict five-value set, citing 20260611160000 — the version the very next migration replaced.
4. **Fortress layer has no runtime consumers.** 12 tables + 13 sites columns + 2 hardening migrations; app-side usage is limited to hand-written type mirrors and comments in L20 (src/lib/fortress/types.ts:8,38; ppm.ts:3). Zero `.from(...)` access to any of the 12 tables in src or supabase/functions (grep-verified, §5). The base migration itself says it was never run against the live DB (20260612200000:18-19), and its seed (D04) says the same.
5. **Same-day contradictory backfills.** 20260708150000 sets empty-site health_score to NULL; 20260708170000 (same date) sets the identical row-set to 0 and labels the first "interim". Both remain in history and will both run on a fresh apply (net effect 0).
6. **is_compliant NULL/false conflation in change detection.** The conditional UPDATE in `apply_subsection_recompute` compares `coalesce(s.is_compliant,false) <> coalesce(v_is_compliant,false)` (20260612120000:56, carried into 20260612140000:94), so a transition between false and NULL ('incomplete') alone does not qualify as a change (the row still updates if status/score changed in the same recompute).
7. **Blanket authenticated storage writes remain the recorded posture.** The triage replacement policies are `WITH CHECK (true)` for any authenticated principal on ALL buckets (20260611110000:25-30); the file itself frames object-level narrowing and the private-documents follow-up as pending (:19-20).
8. **Three inconsistent "staff" boundaries** across the era's RLS: NOT-Contractor-AND-NOT-Client (20260610120000:39-48), NOT-Client (Contractor included — 20260623120000:3-4,13-15), and affirmative Admin/User/Moderator (20260708090000:18-26, which documents why the NOT-pattern is unsafe with role-less users). Which boundary a table got depends on when it was locked down.
9. **COC register/pool RLS shipped blanket-open, fixed 4 days later.** 20260619130000:73-88 and 20260619150000:20-23 create authenticated `using(true)` CRUD on all four tables; 20260623120000 closes the cross-tenant leak on three of them — but `coc_file_pool` is not in that migration's table loop (:55) and grep shows no later migration re-scoping it: its four blanket authenticated CRUD policies remain the recorded posture.
10. **`get_public_site_review` returns whole rows via `to_jsonb`** for schematic_blocks and site_assets (20260614100000:83-90) — unlike every other key in the public RPC family, which whitelists columns; whatever columns those tables carry (including any added later) are exposed to valid-token holders.
11. **Dead columns added this era**: `subsections.coc_reviewed_by/coc_reviewed_at` (20260611160000:7-8) have zero readers/writers in src or functions (grep-verified; acknowledged at 20260727101000:12-13); `subsections.coc_expiry_date` stays "display-only" after 20260725100000:5-6 removed it from all gating.
12. **Verification is manual-only.** Post-apply checks exist solely as comment blocks (20260610120000:100-104, 20260611140000:122-137, 20260612210000:74-82, 20260611110000:55-59); nothing in the repo executes them.

## 7. ASSUMED (inferred, not verified)

- Live prod state was NOT queried. All statements about prod (what is applied, what drifted) restate the migration files' own comments; the actual prod schema may differ further.
- The application order assumed is filename-timestamp order. Whether the two `.down.sql` files are ever executed by tooling was not verified (Supabase CLI convention treats them as companions; no runner config in this unit).
- "Zero consumers" claims are literal-string greps over `src` and `supabase/functions` (`*.ts`/`*.tsx`, tracked names, excluding `" 2."` duplicates and generated types.ts); dynamic table-name construction would be missed — none was observed in the greps run.
- Unit attribution in §5 follows manifest path scoping; for top-level src/components and src/views files split across file-level units (C07/C09/C14, V01/V02/V04), attribution follows the file names cited in manifest unit notes.
- The tier-2 anon-read lockdown SQL (docs/security/APPLIED-…) was not read in this pass; its effects are described only as the era's files reference them (X05 territory).
- The claim in issue 1 assumes no out-of-band prod change re-relaxed the snags status CHECK after 20260611150000; migration history contains no later touch of it (grep-verified in-repo only).
