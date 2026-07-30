# D01 — db-era-2025-bootstrap

- **Unit id:** D01
- **Slug:** db-era-2025-bootstrap
- **Spec mode:** aggregate (one composite spec for the whole era)
- **Date:** 2026-07-29
- **File count:** 89 SQL migrations, `supabase/migrations/20251014114352_*` → `20251014…20251120111033_*` (verified against `review/unit-files.json` key "D01"; printed count = 89)
- **Era window:** 2025-10-14 → 2025-11-20 (all filenames `<timestamp>_<uuid>.sql`, Lovable-generated)
- **Era LOC:** 6,030 lines total (node line count; per-file `wc -l` in the index table below)
- **Statement census (regex over the 89 files):** 38 CREATE TABLE · 340 CREATE POLICY · 180 DROP POLICY · 38 CREATE INDEX · 39 ENABLE ROW LEVEL SECURITY statements · 29 CREATE TRIGGER · 18 CREATE (OR REPLACE) FUNCTION (13 distinct names) · 5 GRANT

---

## 1. Era narrative (ordered themes)

The era is the application's entire 2025 bootstrap: from empty database to the full entity model, role system, QR surface, and template catalogue — ending in a single-day RLS collapse-and-partial-rebuild on 2025-11-20.

1. **Core entity model (10-14).** One migration creates profiles/clients/sites/inspections plus a *parallel* inspection-scoped hierarchy `inspection_subsections`/`inspection_items` (20251014114352:2-66), with blanket `auth.role() = 'authenticated'` CRUD policies on everything (e.g. :90-104) and a public "Users can view all profiles" `USING (true)` (:77-79). `handle_new_user` + `on_auth_user_created` trigger and `update_updated_at_column` + per-table triggers are defined here (:175-228) and immediately re-created with `SECURITY DEFINER SET search_path` (20251014114445:11-21). The site-scoped `subsections` table (the app's real hierarchy: Client → Site → Subsection → Inspection) arrives separately with `coc_status`/`metering_status`/`is_coc_required`/`is_compliant` columns (20251014123510:4-16).
2. **Roles (10-14 → 10-17).** `app_role` enum ('Admin','User','Contractor') + `user_roles` + SECURITY DEFINER `has_role()` (20251014120311:2-30); 'Moderator' added (20251014172237:2), 'Client' added (20251017054230:2). A hard-coded user UUID is granted Admin in-migration (20251014172735:2-4). `handle_new_user` is redefined to also insert a role — with **every** signup defaulting to Admin (both CASE branches yield `'Admin'::app_role`, 20251020093607:22-25). Client tenancy lands as `user_clients` (UNIQUE(user_id), UNIQUE(client_id) — strict 1:1, 20251017054255:4-11) + `get_user_client_id()` (:30-41) + seven Client-scoped SELECT policies (:46-131); contractor tenancy as `user_sites` + four Contractor policies (20251017061634:2-78).
3. **Storage, settings, ops tables (10-14 → 10-15).** Five buckets — company-logos, client-logos, site-images, inspection-photos public; documents private — with 20 per-bucket authenticated policies (20251014132137:2-94), plus settings (default row 'Watson Mattheus', :215-217), activity_logs, calendar_events (:97-171). profile-images bucket + owner-folder policies (20251015010856:2-30). Firebase-migration plumbing: `firebase_id` columns (20251014142244:2-12), `temp_import` staging table (20251014120224:2-6), `pending_user_invites` (20251014164357:2-10).
4. **QR + documents surface (10-14 → 10-20).** `qr_scans` (with "Anyone can insert scans" `WITH CHECK (true)`, 20251014140001:18-20), `document_categories`, `subsection_documents`, `site_documents`, `inspection_templates` (all in 20251014140001), `site_document_categories` + category backfill DML (20251016021558:37-58), `qr_codes` registry table with Admin/Client/Contractor/Public policies (20251020070753:2-49), `subsections.qr_code_url` (20251020123629:2-3), `settings.qr_base_url` (20251020130110:2-3).
5. **Template catalogue as data (10-14 → 11-20).** Mock templates seeded (20251014161057:7-234), then deleted and replaced by the real Firebase-derived catalogue — 8 templates, 561 LOC of jsonb (20251014161831:2 `DELETE FROM inspection_templates`, :7-561), plus 3 more (20251014162009) and 'Site Drawing Inspection' (20251016030509:2-11). Follow-up content DML: category recategorisation (20251016023327:2-6), EMB tenant section merged via `jsonb_build_object` (20251017064450:3-55), item rename keyed to a hard-coded template UUID (20251022100347:2-8), `inspection_templates.tenants` column (20251017071948:2-3). Two data-repair passes: a one-shot plpgsql normaliser of `inspections.json_data` from numeric to string keys, executed then dropped in the same file (20251112021952:2,159,162), and a template-section normaliser DO block (20251120045010:4-79) with a `validate_inspection_templates()` diagnostic function created then re-created corrected (20251120045029:2, 20251120045114:2-4).
6. **First security-fix wave (10-16 → 10-17).** Two overlapping "CRITICAL SECURITY FIX" migrations (20251016035546, 20251016064350) drop the broad anon policies from 20251015102828/20251015103303 but re-create `TO public USING (true)` SELECT policies on sites/subsections/settings with comments deferring enforcement to the app ("applications should only SELECT id, name…", 20251016064350:70-76,88-94,106-113). Storage counter-move: documents bucket gets public download for QR pages while writes stay authenticated (20251016064723:17-51), and subsection_documents/site_documents get `TO public USING (true)` SELECT (:61-65,:93-97). Then profiles/clients public read is removed again and profile-images/site-images buckets are flipped private with owner/authenticated policies (20251017094000:5-10,23-78). `cleanup_old_pending_invites()` (30-day retention, 20251017095131:5-30) and trigger-based `cleanup_activity_logs()` (keep last 20, 20251020070622:2-27) add in-DB housekeeping.
7. **Feedback/collab features (10-16 → 11-07).** snags (status CHECK 'Open'/'Closed', 20251016084545:2-14), COC validation v1: coc_validations (20251016111626:2-12, status CHECK widened 20251016113423:5-7, `report_data` 20251016113024:2-3), validation_conversations/messages/feedback (20251016114052:2-41), issue_reports + issue-screenshots bucket (20251018005315:2-24), suggestions + suggestion-screenshots bucket (20251028165823:2-20, 20251028170100:2-4), notifications (20251030071546:2-10), verification columns + `get_pending_verifications()` (20251107084904:2-57, search_path re-do 20251107084924:2-4). Per-user cloud-storage: file_sync_logs + settings OAuth columns (20251027075744:2-26) immediately superseded by user_storage_connections with the settings columns dropped (20251027081639:2-17,50-62). Fortress `site_marking_checklist` (20251027105104:2-15) and the floor-plan pair `subsection_floor_plans`/`floor_plan_pins` (20251027115044:2-30).
8. **Contractor restriction sweep (11-19).** Two migrations replace blanket authenticated policies with Admin-manage + Contractor-scoped-view across clients/sites/calendar_events (20251119090707) and nine more tables (20251119090820: inspection_items :6-29, inspection_subsections :34-56, subsection_documents :61-82, site_documents :87-105, snags :110-128, document_categories :133-152, site_document_categories :157-173, site_marking_checklist :178-213, coc_validations :218-239, inspection_templates :244-258, plus contractor-self policies on profiles :263-269 and activity_logs :274-280). `user_sites_history` audit table + `log_user_site_assignment()` trigger pair (20251119091647:2-58).
9. **The 11-20 collapse (15 migrations, one day).** A document-upload RLS failure ("users need Client role + user_clients mapping, but neither exists", 20251120074459:2) escalates through: add Contractor/Client INSERT+DELETE policies (20251120045331) → complex compat policy with an always-true fallback arm (`OR EXISTS (SELECT 1 FROM subsections …)`, 20251120074459:38-41) → "any authenticated user can upload" (20251120080137:9-12) → **"Remove ALL RLS restrictions for authenticated users"** — 40 role-scoped policies dropped, 22 `FOR ALL USING (auth.uid() IS NOT NULL)` blanket policies created across 22 tables (20251120080517). Storage follows the same arc: granular per-role site-folder policies (293 LOC, 20251120051502) → drop-everything loop over `pg_policies` + documents bucket public (20251120081347:14-30) → drop-everything again + **`UPDATE storage.buckets SET public = true`** for ALL buckets (20251120083541:5-20) → **fully anonymous storage CRUD** — four `USING (true)`/`WITH CHECK (true)` policies for SELECT/INSERT/UPDATE/DELETE with no role restriction (20251120083932:18-32). The same day partially reverses course: `contractor_has_site_access()` helper + role-scoped rebuild for 9 of the 22 tables (20251120110544:2-264) and an "Emergency Fix" adding blanket `FOR ALL` policies for the 'User' role on those same 9 tables (20251120111033:5-56). Introspection/debug artifacts from the episode remain: `get_rls_policies_for_role()` reading pg_policies by policy-name pattern (20251120051830:2-30) and the `user_policy_overrides` table (20251120061340:2-13).
10. **Floor-plan defect tracking + realtime (11-20, after the collapse).** floor_plan_pins gains a 5-state status CHECK, package/stakeholders/edit_history columns, `floor_plan_pin_comments` table, and `track_floor_plan_pin_changes()` history trigger (20251120102352:3-84; SECURITY DEFINER re-do 20251120102409:2-28); `REPLICA IDENTITY FULL` for realtime (20251120103640:2).

---

## 2. Schema contribution

### 2.1 Tables CREATED (38)

| table | migration:line |
|---|---|
| profiles | 20251014114352_f0238ce6-….sql:2 |
| clients | 20251014114352_f0238ce6-….sql:11 |
| sites | 20251014114352_f0238ce6-….sql:23 |
| inspections | 20251014114352_f0238ce6-….sql:35 |
| inspection_subsections | 20251014114352_f0238ce6-….sql:48 |
| inspection_items | 20251014114352_f0238ce6-….sql:58 |
| temp_import | 20251014120224_e944a635-….sql:2 |
| user_roles | 20251014120311_94cc9de8-….sql:5 |
| subsections | 20251014123510_4c69dadd-….sql:4 |
| settings | 20251014132137_627a24bc-….sql:97 |
| activity_logs | 20251014132137_627a24bc-….sql:123 |
| calendar_events | 20251014132137_627a24bc-….sql:142 |
| qr_scans | 20251014140001_3adc740c-….sql:2 |
| document_categories | 20251014140001_3adc740c-….sql:23 |
| subsection_documents | 20251014140001_3adc740c-….sql:38 |
| site_documents | 20251014140001_3adc740c-….sql:64 |
| inspection_templates | 20251014140001_3adc740c-….sql:82 |
| pending_user_invites | 20251014164357_37295947-….sql:2 |
| site_document_categories | 20251016021558_9338f335-….sql:2 |
| snags | 20251016084545_dc21b520-….sql:2 |
| coc_validations | 20251016111626_9fa96ad4-….sql:2 |
| validation_conversations | 20251016114052_48071cee-….sql:2 |
| validation_messages | 20251016114052_48071cee-….sql:15 |
| validation_feedback | 20251016114052_48071cee-….sql:26 |
| user_clients | 20251017054255_cd78a557-….sql:4 |
| user_sites | 20251017061634_0f314109-….sql:2 |
| issue_reports | 20251018005315_1d30c9c7-….sql:2 |
| qr_codes | 20251020070753_59422a85-….sql:2 |
| file_sync_logs | 20251027075744_d0a3d62f-….sql:16 |
| user_storage_connections | 20251027081639_22cefe19-….sql:2 |
| site_marking_checklist | 20251027105104_aadc2c43-….sql:2 |
| subsection_floor_plans | 20251027115044_3a5a0a85-….sql:2 |
| floor_plan_pins | 20251027115044_3a5a0a85-….sql:13 |
| suggestions | 20251028165823_3011bd73-….sql:2 |
| notifications | 20251030071546_f84d79c3-….sql:2 |
| user_sites_history | 20251119091647_56f5417f-….sql:2 |
| user_policy_overrides | 20251120061340_29a4cccb-….sql:2 |
| floor_plan_pin_comments | 20251120102352_9e71ab8f-….sql:18 |

No tables are DROPPED in this era. No views, no materialized views, no extensions, no pg_cron.

### 2.2 Enum

- `public.app_role AS ENUM ('Admin','User','Contractor')` — 20251014120311_94cc9de8-….sql:2; `ADD VALUE 'Moderator'` — 20251014172237_cf2b6c0e-….sql:2; `ADD VALUE 'Client'` — 20251017054230_bf53246a-….sql:2. (Final era value set: Admin, User, Contractor, Moderator, Client.)

### 2.3 Functions CREATED (13 distinct names, 18 statements)

| function | created | redefined in-era | notes |
|---|---|---|---|
| handle_new_user() | 20251014114352:175 | 20251020093607:2 | v2 also inserts user_roles; both CASE branches assign 'Admin' (20251020093607:22-25) |
| update_updated_at_column() | 20251014114352:199 | dropped 20251014114445:8, recreated :11 | v2 adds SECURITY DEFINER + search_path |
| has_role(_user_id, _role) | 20251014120311:17 | — | SECURITY DEFINER role check; basis of nearly every later policy |
| get_user_client_id() | 20251017054255:30 | — | SECURITY DEFINER; returns client for auth.uid() |
| cleanup_old_pending_invites() | 20251017095131:5 | — | 30-day delete + activity_logs entry; GRANT EXECUTE TO authenticated :33 |
| cleanup_activity_logs() | 20251020070622:2 | — | trigger fn, keeps last 20 rows |
| get_pending_verifications(uuid) | 20251107084904:20 | dropped 20251107084924:2, recreated :4 | v2 adds search_path; reads issue_reports + suggestions |
| normalize_inspection_json_data() | 20251112021952:2 | executed :159, **dropped :162** | one-shot data repair, self-cleaning |
| log_user_site_assignment() | 20251119091647:29 | — | trigger fn writing user_sites_history |
| validate_inspection_templates() | 20251120045029:2 | dropped 20251120045114:2, recreated :4 | template structure linter; GRANT TO authenticated (20251120045114:72) |
| get_rls_policies_for_role(text) | 20251120051830:2 | — | SECURITY DEFINER read of pg_policies filtered by policy-name ILIKE |
| track_floor_plan_pin_changes() | 20251120102352:53 | redefined 20251120102409:2 | v2 adds SECURITY DEFINER + search_path; appends jsonb edit_history |
| contractor_has_site_access(uuid,uuid) | 20251120110544:2 | — | SECURITY DEFINER user_sites membership check |

### 2.4 Triggers CREATED (29 statements)

- `on_auth_user_created` AFTER INSERT ON auth.users (20251014114352:193; dropped+recreated 20251020093607:33,36).
- `update_<table>_updated_at` BEFORE UPDATE for: profiles/clients/sites/inspections (20251014114352:210-228; dropped 20251014114445:2-5, recreated :24-42), subsections (20251014123510:55), settings/calendar_events (20251014132137:203-212), site_documents/inspection_templates (20251014140001:112-120), pending_user_invites (20251014164357:41), snags (20251016084545:46), validation_conversations (20251016114052:100), issue_reports (20251018005315:89), qr_codes (20251020070753:52), user_storage_connections (20251027081639:44), site_marking_checklist (20251027105104:45), subsection_floor_plans/floor_plan_pins (20251027115044:85-93), user_policy_overrides (20251120061340:27).
- `trigger_cleanup_activity_logs` AFTER INSERT ON activity_logs FOR EACH STATEMENT (20251020070622:24).
- `log_user_site_insert` / `log_user_site_delete` on user_sites (20251119091647:50-58).
- `floor_plan_pin_changes_trigger` BEFORE UPDATE ON floor_plan_pins (20251120102352:81).

### 2.5 Storage buckets

- Created: company-logos, client-logos, site-images, inspection-photos (public=true) and documents (public=false) — 20251014132137:2-9; profile-images (public=true) — 20251015010856:2-4; issue-screenshots (public=false) — 20251018005315:22-24; suggestion-screenshots (public=false) — 20251028170100:2-4. **8 buckets total in this era.**
- Public-flag churn: profile-images + site-images set private (20251017094000:8-10) → documents set public (20251027082859:2-4) → documents public again (20251120081347:30) → **ALL buckets set public** (20251120083541:20).

### 2.6 Policies

340 CREATE POLICY / 180 DROP POLICY across the era (regex count). Landmark statements, each verified:

- Blanket authenticated CRUD on all six bootstrap tables (20251014114352:77-172).
- Anon `USING (true)` SELECT for QR pages on subsections/sites/clients/document_categories/subsection_documents (20251015102828:2-34) and site_documents (20251015103303:2-6).
- `TO public USING (true)` SELECT re-created by the "security fix" pair on sites (20251016064350:70-74), subsections (:88-92), settings "Public can view branding only" (:106-110); clients "Public can view client basic info" (20251016104322:3-6, dropped 20251017094000:5).
- Storage: "Public can download documents" (20251016064723:17-21); "Public can view inspection photos" (20251117082400:2-6) with the conflicting authenticated policy dropped (20251117082653:2).
- qr_scans "Anyone can insert scans" `WITH CHECK (true)` (20251014140001:18-20).
- Contractor/Client scoping waves: 20251017054255:46-131 (Client), 20251017061634:12-78 (Contractor), 20251119090707 + 20251119090820 (sweep).
- The 11-20 blanket set: 22 × "All authenticated users full access to <table>" `FOR ALL USING (auth.uid() IS NOT NULL)` (20251120080517:8-238); anonymous storage CRUD ×4 (20251120083932:18-32); dynamic drop-all loops over pg_policies (20251120081347:14-27, 20251120083541:5-17, 20251120083932:3-15).
- Same-day partial rebuild: role-scoped policies for sites/subsections/inspections/site_documents/floor_plan_pins/subsection_floor_plans/document_categories/snags/inspection_items (20251120110544:18-264) + 'User'-role blanket `FOR ALL` on the same 9 tables (20251120111033:5-56).

### 2.7 Data (DML) shipped inside migrations

- Template catalogue: mock seed (20251014161057:7), `DELETE FROM inspection_templates` + real 8-template seed (20251014161831:2,7), 3 more templates (20251014162009:4,51,140), Site Drawing template (20251016030509:2), stats recompute (20251014161057:237-240), recategorisation (20251016023327:2-6), tenant-section merge (20251017064450:3-55), hard-coded-UUID item rename (20251022100347:2-8).
- Hard-coded Admin grant to user `02847fd1-0cd1-42a7-b5d0-10122b74828e` (20251014172735:2-4).
- Default settings row 'Watson Mattheus' (20251014132137:215-217).
- '05 Photos' category purge (20251016021446:2-3); site-document category backfill + relink (20251016021558:37-58); activity_logs.user_id backfill from email (20251016035250:6-9).
- One-shot normalisers executed in-migration: inspections.json_data (20251112021952:159), template sections DO block (20251120045010:4-79).

---

## 3. Security posture changes (the era's RLS arc)

Four distinct postures, in order:

1. **Authenticated-blanket + profile-public (10-14):** every table `auth.role()='authenticated'` for all four verbs; profiles readable by anyone (20251014114352:77-79).
2. **Anon-open for QR (10-15):** unrestricted anon SELECT on the six core tables (20251015102828, 20251015103303).
3. **Nominal tightening, then role scoping (10-16 → 11-19):** the two "security fix" migrations drop anon policies but re-create `TO public USING (true)` equivalents, relying on the client to limit columns (explicit in comments, 20251016064350:76,94,112-113). Real scoping then accretes: Client tenancy (20251017054255), Contractor tenancy (20251017061634), storage per-role site-folder policies (20251120051502), and the two-file contractor sweep (20251119090707, 20251119090820).
4. **The 11-20 removal (the "blanket RLS-removal migrations"):**
   - `20251120080517` — "Remove ALL RLS restrictions for authenticated users": drops ~40 role policies and grants every authenticated user `FOR ALL` on 22 tables (RLS stays *enabled*; the policies just stop discriminating).
   - `20251120081347` — documents bucket: dynamic drop of every documents-related storage policy (:14-27), bucket public (:30), authenticated CRUD + public SELECT (:33-52).
   - `20251120083541` — "Remove ALL storage restrictions for ALL buckets": drops **every** policy on storage.objects (:5-17), all buckets public (:20), authenticated CRUD any bucket + `USING (true)` public SELECT (:23-42).
   - `20251120083932` — "allow anonymous access for everything": drops every storage policy again and creates anon-capable SELECT/INSERT/UPDATE/DELETE with `true` conditions (:18-32).
   - Partial same-day walk-back: `20251120110544` restores Admin/Client/Contractor scoping on 9 tables; `20251120111033` then hands the 'User' role blanket `FOR ALL` on those same 9 tables.

**Anon grants standing at era end (2025-11-20):** anonymous full CRUD on all storage objects (20251120083932:18-32) with all buckets public (20251120083541:20); anon INSERT into qr_scans (20251014140001:18-20); `TO public USING (true)` SELECT on subsection_documents (20251016064723:61-65), settings branding (20251016064350:106-110), and site_document_categories (20251016021558:19-22 — its later drop at 20251120080517:5-6 targets other policy names; the "Public users can view site document categories" name was dropped earlier at 20251016035546:63). No GRANT/REVOKE statements to the anon role appear in this era (the 5 GRANTs are EXECUTE-to-authenticated on functions).

Note: `ENABLE ROW LEVEL SECURITY` is never reversed — no `DISABLE ROW LEVEL SECURITY` or `FORCE`/`NO FORCE` statements exist in the era. The "RLS removal" is entirely policy-level.

---

## 4. What SURVIVES vs was later REVERSED (grep-verified against 20260107… → 20260727… migrations)

### Reversed / superseded later

| Era artifact | Reversal | Evidence |
|---|---|---|
| Anonymous storage INSERT/UPDATE/DELETE (20251120083932:22-32) | Dropped, replaced with authenticated-only writes | 20260611110000_emergency_triage_lockdown.sql:21-31 |
| coc_validations (+ v1 validation engine) | `DROP TABLE … CASCADE` | 20260612130000_drop_coc_validation_tables.sql:4 |
| validation_conversations / validation_messages / validation_feedback | `DROP TABLE … CASCADE` | 20260612131000_drop_validation_feedback_tables.sql:4-6 |
| issue_reports / suggestions / notifications | `DROP TABLE … CASCADE` (feature removed wholesale) | 20260612230000_drop_feedback_feature_tables.sql:6-8 |
| "All authenticated users full access to clients / coc_validations" | Dropped by write lockdown | 20260610120000_phase1_write_lockdown.sql:32,53 |
| "All authenticated users full access to inspection_templates / validation_feedback" | Dropped | 20260611110000:45,51 and 20260611140000_admin_config_write_lockdown.sql:45,101 |
| "All authenticated users full access to calendar_events" | Dropped, replaced with tenancy RLS | 20260612250000_calendar_events_tenancy_rls.sql:28 |
| "Users can manage all floor plan pins / document categories / inspection items" (20251120111033) | Dropped | 20260406131029_84479c75-….sql:36,53,68 |
| snags status CHECK ('Open','Closed') (20251016084545:8) | Replaced by ('Open','Rectified','Closed') lifecycle | 20260611150000_snag_status_lifecycle.sql:9,26-27 |
| qr_scans "Anyone can insert scans" (20251014140001:18-20) | Dropped; scan writes moved to service-role edge fn + authenticated 'landing' rows | 20260727100000_qr_scans_hardening.sql:33-40 |
| handle_new_user everyone-gets-Admin default (20251020093607:24) | Redefined: first user Admin, others 'User' | 20260214023114_a056bc18-….sql:6-7,25-26 |
| Settings write policies "Authenticated users can insert/update settings" (20251014132137:114-120) | Dropped, Admin-only | 20260611110000:34-44 |
| Era anon direct-read model for QR pages | Superseded architecturally by SECURITY DEFINER public RPCs (`_share_link`, `get_public_subsection`, …) | 20260610113000_public_rpcs_phase1.sql:1-9 (comment: "prerequisite for dropping the blanket anon SELECT policies", 20260614100000:3-4) |

### Survives in migration history (no later DROP/ALTER found; grep-verified)

- **31 of the 38 tables** (all except the 7 dropped above), including the debug-era leftovers `temp_import`, `user_policy_overrides`, `qr_codes`, `file_sync_logs`, `user_storage_connections`, `pending_user_invites`.
- **`UPDATE storage.buckets SET public = true` for all buckets** (20251120083541:20) — no `SET public = false` appears in any 2026 migration (grep "SET public" over 2026 files: no hits); 20260611110000:19-21 explicitly defers making `documents` private ("the G-SEC-14 follow-up").
- **Anon storage SELECT** "Anyone can view all storage" (20251120083932:18-20) — never dropped in-history (only the three write policies are, 20260611110000:21-23).
- **"All authenticated users full access to …"** for site_document_categories, inspection_subsections, qr_codes, user_sites, user_clients, site_marking_checklist (20251120080517:8,153,187,206,213,123) — no 2026 migration drops these six (per-name grep: no hits; the validation_conversations/messages ones became moot when their tables were dropped).
- **"Users can manage all sites / subsections / inspections / site documents / subsection floor plans / snags"** ('User'-role blanket `FOR ALL`, 20251120111033:5-50) — only the pins/categories/items three were dropped (20260406131029); the other six have no in-history drop.
- **`Public can view subsection documents`** `TO public USING (true)` (20251016064723:61-65) — created in-era, absent from the 20251120080517 drop list (that file has no subsection_documents section) and never dropped by any 2026 migration (single grep hit = its creation).
- **"Public can view branding only"** on settings — explicitly left in place (20260611140000:34 comment).
- Core plumbing: `has_role`, `get_user_client_id`, `contractor_has_site_access`, `update_updated_at_column`, `cleanup_activity_logs` + trigger, `log_user_site_assignment` + triggers, `handle_new_user` (redefined but same hook), all `update_*_updated_at` triggers, `app_role` enum, all 8 buckets, floor-plan defect tracking (5-state pins, comments table, edit-history trigger, REPLICA IDENTITY FULL).
- `get_pending_verifications()` — no later `DROP FUNCTION` (grep over 2026 migrations: zero hits), although both tables it reads were dropped 20260612230000; the function body would now fail at runtime.
- `validate_inspection_templates()` and `get_rls_policies_for_role()` — no later drops; both still have app callers (§5).

**Caveat (recorded, not verified):** 2026-06/07 migrations state prod was changed out-of-band — "prod schema is ahead of schema_migrations" (20260727100000_qr_scans_hardening.sql:5-6) and tables exist that were "created out-of-band (via the dashboard, not in supabase/migrations)" (20260611100000_anon_lockdown_oob_tables.sql:5-7); a tier-2 anon-read lockdown lives in docs SQL, not migrations (20260611100000:3-4). So "survives in migration history" ≠ guaranteed live-prod state.

---

## 5. uses -> / used by <- (grep-verified)

**uses ->** nothing in-repo: migrations reference only `auth.users`, `storage.buckets/objects`, `pg_policies`, `pg_constraint`, `information_schema.columns` (all platform catalogs).

**used by <-** (consumers of era-created objects; representative, each grep-verified with `grep -rn` over `src` and `supabase/functions`):

- user_roles / has_role model — `src/hooks/useUserRole.tsx:46` (H03 query-data-hooks), `supabase/functions/invite-user/index.ts:197` (F01 edge-auth-user-lifecycle).
- qr_scans — `supabase/functions/qr-redirect/index.ts:53` (F02 edge-public-qr), `src/views/QRActivity.tsx`, `src/views/Dashboard.tsx`, `src/views/PublicSubsection.tsx` (V02/V01/V04), `src/views/subsection-detail/useSubsectionDetail.ts` (V07).
- user_sites / user_clients — `src/hooks/useContractorSites.tsx` (H03), `src/views/SiteAssignments.tsx`, `src/views/Users.tsx`, `src/views/ContractorAccessSimulator.tsx`, `src/views/ClientAccessSimulator.tsx` (V02/V03).
- user_sites_history — `src/views/SiteAssignments.tsx:225`, `src/components/RecentAssignmentsWidget.tsx`.
- pending_user_invites — `src/views/Users.tsx:126` (V02).
- validate_inspection_templates RPC — `src/views/TemplateValidator.tsx:32` (V02; mounted by A05 admin-template-routes validate page).
- get_rls_policies_for_role RPC + user_policy_overrides — `src/components/UserRLSPolicies.tsx:194,90` (both artifacts of the 11-20 debugging episode, still consumed).
- site_marking_checklist — `src/components/FortressMarkingChecklist.tsx:50`, `src/components/SiteSummaryReport.tsx` (C06/C14).
- floor_plan_pins / subsection_floor_plans / floor_plan_pin_comments — `src/components/InteractiveFloorPlan.tsx:455` (C12 floor-plan-annotation), `src/hooks/useOfflineFloorPlanAnnotations.ts`, `src/hooks/useOfflineSync.ts` (H01/H02).
- site_document_categories — `src/components/SiteSummaryReport.tsx`, `src/lib/pdfDocumentSaver.ts` (L14).
- snags / calendar_events / activity_logs — `src/components/ComplianceDashboard.tsx` (C14), `src/views/Calendar.tsx` (V01), `src/views/Dashboard.tsx` + `src/lib/documents/documentMutations.ts` (L05).
- **used by <- none found (grep-verified)** for: qr_codes table (zero `from('qr_codes')` hits; only generated `src/integrations/supabase/types.ts`), temp_import, file_sync_logs, user_storage_connections, cleanup_old_pending_invites, get_pending_verifications, contractor_has_site_access, get_user_client_id (the latter two are used only inside SQL policies, not called from app code).

---

## 6. Per-file index (89 files; theme = what the file does, verified by reading; LOC = `wc -l`)

| # | file (supabase/migrations/) | theme | LOC |
|---|---|---|---|
| 1 | 20251014114352_f0238ce6-… | Bootstrap: profiles/clients/sites/inspections + inspection_subsections/items, blanket RLS, handle_new_user, updated_at machinery | 227 |
| 2 | 20251014114445_1195edac-… | Recreate update_updated_at_column + 4 triggers with SECURITY DEFINER/search_path | 41 |
| 3 | 20251014120224_e944a635-… | temp_import JSON staging table + authenticated policies | 24 |
| 4 | 20251014120311_94cc9de8-… | app_role enum, user_roles, has_role(), role policies, profiles.status | 63 |
| 5 | 20251014120619_17bfa39c-… | inspections: priority/end_date/assigned_to + date indexes | 8 |
| 6 | 20251014123510_4c69dadd-… | subsections table (site hierarchy, coc/metering/is_compliant), link inspections.subsection_id | 57 |
| 7 | 20251014132137_627a24bc-… | 5 storage buckets + 20 policies; settings/activity_logs/calendar_events; column add-ons; default settings row | 216 |
| 8 | 20251014140001_3adc740c-… | qr_scans (anon INSERT), document_categories, subsection_documents, site_documents, inspection_templates; subsection COC columns | 119 |
| 9 | 20251014142244_6a0c83d2-… | firebase_id columns + indexes on clients/sites/subsections/inspections | 18 |
| 10 | 20251014161057_1b2dda59-… | templates cover_page/sections columns + 13 mock template seeds | 239 |
| 11 | 20251014161831_946f7a2f-… | DELETE all templates; seed 8 real Firebase templates (Meter, EMB, FAT, Generator, Line Shop, Mini Sub, Pre-FAT, RMU) | 561 |
| 12 | 20251014162009_3bf47f66-… | Seed 3 more templates (Site Summary, Solar PV, Progress Report) | 216 |
| 13 | 20251014164357_37295947-… | pending_user_invites table + Admin policies | 43 |
| 14 | 20251014172237_cf2b6c0e-… | app_role + 'Moderator' | 1 |
| 15 | 20251014172735_c6e9844f-… | Hard-coded UUID granted Admin | 3 |
| 16 | 20251015010134_9e552eb7-… | profiles: 10 personal-info columns | 11 |
| 17 | 20251015010856_b93b0802-… | profile-images bucket + owner-folder policies | 29 |
| 18 | 20251015020520_32a5b0f5-… | subsections.inspection_template_id + index | 8 |
| 19 | 20251015023536_dd3e4507-… | inspections.json_data + template_id + gin index | 10 |
| 20 | 20251015102828_8f5f0c1e-… | Anon SELECT (true) on subsections/sites/clients/document_categories/subsection_documents | 33 |
| 21 | 20251015103303_079ba222-… | Anon SELECT (true) on site_documents | 5 |
| 22 | 20251016021446_aee864aa-… | DELETE '05 Photos' document categories | 2 |
| 23 | 20251016021558_9338f335-… | site_document_categories table + public SELECT + backfill/relink DML | 57 |
| 24 | 20251016023327_e0b8f5b5-… | Recategorise Mini-Sub/RMU templates to 'Medium Voltage' | 5 |
| 25 | 20251016030509_dbabc2e4-… | Seed 'Site Drawing Inspection' template | 10 |
| 26 | 20251016035250_e064da77-… | activity_logs.user_id + backfill; own-rows/Admin SELECT split | 38 |
| 27 | 20251016035546_4ea02c08-… | "CRITICAL SECURITY FIX" #1: drop anon policies, re-add public site/subsection access with app-side caveats | 74 |
| 28 | 20251016064350_7ace660c-… | Security fix #2: profiles own/Admin; clients authenticated; sites/subsections/settings TO public USING(true); temp_import Admin-only | 162 |
| 29 | 20251016064723_bcd61aa1-… | Storage: public download for documents bucket; public SELECT on subsection_documents/site_documents tables | 124 |
| 30 | 20251016084545_dc21b520-… | snags table (Open/Closed), policies, indexes; inspections.quality_rating | 52 |
| 31 | 20251016104322_cc0e1efe-… | Public SELECT on clients (again) | 5 |
| 32 | 20251016111626_9fa96ad4-… | coc_validations table (v1 engine) | 36 |
| 33 | 20251016113024_31b52d48-… | coc_validations.report_data | 4 |
| 34 | 20251016113423_5df235f6-… | Widen coc_validations status CHECK (+'Incomplete') | 6 |
| 35 | 20251016114052_48071cee-… | validation_conversations/messages/feedback tables + policies | 106 |
| 36 | 20251017043548_7ab8054f-… | snags: risk_level + estimated_cost (ZAR) | 7 |
| 37 | 20251017054230_bf53246a-… | app_role + 'Client' | 1 |
| 38 | 20251017054255_cd78a557-… | user_clients (1:1) + get_user_client_id() + 7 Client-scoped SELECT policies | 133 |
| 39 | 20251017061634_0f314109-… | user_sites + 4 Contractor-scoped policies | 77 |
| 40 | 20251017064450_8cae7d6c-… | Merge Tenant Information section into EMB template jsonb | 54 |
| 41 | 20251017071948_89f6119a-… | inspection_templates.tenants column | 5 |
| 42 | 20251017094000_3768dc89-… | Drop clients public read; profile/site-images buckets private + owner/auth policies | 77 |
| 43 | 20251017095131_9a8ba3df-… | cleanup_old_pending_invites() (30d) + GRANT + index | 40 |
| 44 | 20251018005315_1d30c9c7-… | issue_reports table + issue-screenshots bucket + policies | 91 |
| 45 | 20251020065437_b54abd96-… | Public SELECT on clients for QR (again) | 5 |
| 46 | 20251020065547_c5f5b509-… | Public SELECT on document_categories (again) | 5 |
| 47 | 20251020070622_59d3cf0b-… | cleanup_activity_logs() keep-last-20 + statement trigger | 26 |
| 48 | 20251020070753_59422a85-… | qr_codes registry table + Admin/Client/Contractor/Public policies | 59 |
| 49 | 20251020093607_800422ff-… | handle_new_user v2: profile + role insert (everyone 'Admin'); trigger recreate | 38 |
| 50 | 20251020093858_2be55e8a-… | Idempotent FK-with-CASCADE additions for user-related tables | 91 |
| 51 | 20251020123629_e30aa31c-… | subsections.qr_code_url + index | 8 |
| 52 | 20251020130110_6c8cad99-… | settings.qr_base_url | 5 |
| 53 | 20251022100347_e6759bc9-… | jsonb_set item rename in hard-coded template | 7 |
| 54 | 20251027075744_d0a3d62f-… | settings OAuth/backup columns + file_sync_logs table | 43 |
| 55 | 20251027081639_22cefe19-… | user_storage_connections (per-user tokens); drop settings OAuth columns | 61 |
| 56 | 20251027082859_7734c90d-… | documents bucket public=true | 3 |
| 57 | 20251027105104_aadc2c43-… | site_marking_checklist (Fortress) + authenticated policies | 47 |
| 58 | 20251027110429_f5b9c306-… | site_marking_checklist.status (pending/completed/not_applicable) | 2 |
| 59 | 20251027115044_3a5a0a85-… | subsection_floor_plans + floor_plan_pins tables + policies + triggers | 92 |
| 60 | 20251028165823_3011bd73-… | suggestions table + policies | 52 |
| 61 | 20251028170100_ca817971-… | suggestion-screenshots bucket + owner/Admin policies | 30 |
| 62 | 20251030071546_f84d79c3-… | notifications table + policies | 36 |
| 63 | 20251107084904_f848b2f4-… | Verification columns on issue_reports/suggestions + get_pending_verifications() | 56 |
| 64 | 20251107084924_7b603496-… | get_pending_verifications() re-created with search_path | 43 |
| 65 | 20251110081647_69f2e3a5-… | subsection_documents: coc_number/issue_date/type/status columns | 5 |
| 66 | 20251112021952_4c1c7d0c-… | One-shot json_data numeric→string-key normaliser (run + self-drop) | 161 |
| 67 | 20251117082400_09890016-… | Public SELECT on inspection-photos storage | 5 |
| 68 | 20251117082653_0af759f2-… | Drop conflicting authenticated-only inspection-photos policy | 4 |
| 69 | 20251119090707_b34c56a3-… | Contractor lockdown #1: clients/sites/calendar_events Admin-manage + Contractor-view | 82 |
| 70 | 20251119090820_296d33c0-… | Contractor lockdown #2: 10-table sweep + profiles/activity_logs self-view | 279 |
| 71 | 20251119091647_56f5417f-… | user_sites_history + log_user_site_assignment() + 2 triggers | 57 |
| 72 | 20251120045010_89850619-… | DO-block template section normaliser (array/object formats) | 78 |
| 73 | 20251120045029_ad225a07-… | validate_inspection_templates() v1 | 75 |
| 74 | 20251120045114_44ed9877-… | validate_inspection_templates() v2 (corrected SQL) | 71 |
| 75 | 20251120045331_2c30ed20-… | Contractor/Client DELETE + INSERT policies on subsection_documents | 66 |
| 76 | 20251120051502_3843cc67-… | Granular per-role site-folder storage policies for 4 buckets | 293 |
| 77 | 20251120051830_0f728c09-… | get_rls_policies_for_role() pg_policies introspection | 29 |
| 78 | 20251120061340_29a4cccb-… | user_policy_overrides table (Admin-only) | 33 |
| 79 | 20251120074459_d72be4fe-… | subsection_documents upload fix w/ always-true fallback arm | 78 |
| 80 | 20251120080137_6ff47814-… | Simplify: any authenticated user can upload/delete docs | 26 |
| 81 | 20251120080517_643a23ca-… | **Remove ALL RLS restrictions for authenticated users** (22 tables) | 237 |
| 82 | 20251120081347_dfe72b01-… | Documents bucket: drop-all loop, public bucket, auth CRUD + public read | 51 |
| 83 | 20251120083541_6381caa6-… | **Remove ALL storage restrictions**: drop every storage policy, ALL buckets public | 41 |
| 84 | 20251120083932_7add3605-… | **Anonymous storage CRUD** (SELECT/INSERT/UPDATE/DELETE `true`) | 31 |
| 85 | 20251120102352_9e71ab8f-… | floor_plan_pins: 5-state status, tracking columns, comments table, history trigger | 83 |
| 86 | 20251120102409_a7bc6b71-… | track_floor_plan_pin_changes() re-created with SECURITY DEFINER/search_path | 27 |
| 87 | 20251120103640_b5942e14-… | floor_plan_pins REPLICA IDENTITY FULL (realtime) | 4 |
| 88 | 20251120110544_4e89ad10-… | Partial rebuild: contractor_has_site_access() + role policies on 9 tables | 263 |
| 89 | 20251120111033_1e66f4c9-… | "Emergency Fix": 'User' role blanket FOR ALL on 9 tables | 55 |

---

## 7. Observed issues (factual observations, no severity judgment)

1. `handle_new_user` v2 assigns 'Admin' to every signup — the CASE's ELSE branch is also `'Admin'::app_role` with a comment saying to change it (20251020093607:22-25); not corrected until 20260214023114 (D02 era).
2. `20251120083932` leaves storage fully anonymous-writable; its three write policies stand un-dropped in migration history for ~7 months (until 20260611110000:16-17, whose comment states "defined 20251120083932, never dropped").
3. `20251120080517` covers 22 tables but omits subsection_documents, so the `TO public USING (true)` "Public can view subsection documents" policy (20251016064723:61) is never dropped anywhere in migration history.
4. Six of the 22 "full access" blanket policies (site_document_categories, inspection_subsections, qr_codes, user_sites, user_clients, site_marking_checklist) and six of the nine 'User'-role blanket policies have no in-history drop (§4).
5. The two "CRITICAL SECURITY FIX" migrations re-create `USING (true)` public policies while delegating field-level restraint to the client app in comments (20251016064350:70-76,88-94,106-113).
6. Anon/public read policies on clients and document_categories are created, dropped, and re-created three times across 20251015102828 → 20251016035546 → 20251016104322/20251020065437/20251020065547 → dropped again 20251017094000/20251120080517.
7. `temp_import` (explicitly "Temporary", 20251014120224:25) and the debug artifacts `user_policy_overrides` + `get_rls_policies_for_role` are never removed; `qr_codes` has zero non-generated app references (grep-verified).
8. `get_pending_verifications()` survives in history while both tables it queries were dropped (20260612230000) — the surviving definition references dropped relations.
9. Hard-coded identifiers baked into migrations: user UUID `02847fd1-…` granted Admin (20251014172735:3), template UUID `234af65e-…` (20251022100347:8), inspection UUIDs in later repair files (out of era).
10. The era ships data as migrations: 1,000+ LOC of template jsonb (files 10-12), including a `DELETE FROM inspection_templates` with no WHERE (20251014161831:2).
11. `calendar_events` has no FK to sites — tenancy is matched by `site_name` text (20251014132137:145, policy join on name 20251017054255:113-115).
12. `qr_scans` accepted anon INSERT from 2025-10-14 but nothing wrote to it until the 2026-07 edge function ("the table has existed since 20251014140001 but nothing ever wrote to it", 20260727100000:1-2).
13. Duplicate hierarchy: `inspection_subsections`/`inspection_items` (20251014114352:48-66) coexist with the site-level `subsections` model (20251014123510) for the whole era; both still exist at era end.

---

## ASSUMED (inferred, not independently verified)

- Unit attributions in §5 (e.g. useUserRole → H03, InteractiveFloorPlan → C12) follow the manifest's unit descriptions; file-to-unit membership for components was not re-derived from unit-files.json for non-D01 units.
- "Survives" claims are strictly migration-history claims. Prod is documented as ahead of / divergent from `schema_migrations` (20260727100000:5-6; 20260611100000:5-7), and a tier-2 anon-read lockdown plus "Staff" policy family exist only in docs/dashboard, not in migrations (referenced at 20260611110000:6-11) — live-DB posture may differ from everything in §3/§4.
- The 340/180/38-style statement counts are line-anchored regex counts (`^\s*CREATE POLICY` etc.); statements not starting at line beginnings (none observed while reading) would be missed.
- `DROP TABLE … CASCADE` (2026-06) is assumed not to have removed `get_pending_verifications` (plain plpgsql functions are not dependency-tracked to tables); not verified against a live catalog.
- The 20251017064450 tenant-section UPDATE targets `category = 'Low Voltage'` while the template was seeded with category 'Low Voltage & Line Shops' (20251014161831:76) — whether the UPDATE matched zero rows depends on live data at apply time; not verifiable from files alone.
