# Inventory slice 13 — supabase/migrations + seeds + templates + config.toml (database layer)

Date: 2026-07-29

Authoritative list command:

```
git ls-files 'supabase/migrations/*' 'supabase/seeds/*' 'supabase/templates/*' 'supabase/config.toml'
```

Output count: **186 files** (`| wc -l` → `186`): 183 `.sql` migrations (includes 2 `.down.sql` files), 1 seed, 1 email template, 1 `config.toml`.

Total LOC (`git ls-files ... | xargs wc -l`): **11,113** (config.toml 66 · migrations 10,443 · seed 525 · recovery.html 79).

NOTE on grep scope: the migrations directory also contains an **untracked** duplicate `20260525120000_auth_events_audit 2.sql` (see git status), so shell globs over-count. All aggregate counts below were re-run against **git-tracked files only** via `FILES=$(git ls-files 'supabase/migrations/*.sql'); echo "$FILES" | tr '\n' '\0' | xargs -0 grep ...`.

## Classification summary

| Group | Classification | Files | LOC |
|---|---|---|---|
| supabase/migrations/*.sql | source (SQL DDL/DML) | 183 | 10,443 |
| supabase/config.toml | config | 1 | 66 |
| supabase/seeds/fortress_abaqulusi_seed.sql | generated (header line 2: "Generated; safe to re-run") | 1 | 525 |
| supabase/templates/recovery.html | assets (email template pasted into Supabase dashboard) | 1 | 79 |

## Aggregate schema surface (derived from DDL grep only — not a live-DB introspection)

Commands and real outputs:

- `... grep -hicE "CREATE TABLE"` summed → **93** CREATE TABLE statements; distinct real table names after stripping `public.`/quotes and comment noise (`grep -hioE "CREATE TABLE (IF NOT EXISTS )?(public\.)?\"?[a-z_]+\"?" | ... | grep -viE '^(for|to)$' | sort -u | wc -l`) → **73 distinct tables ever created** (the case-insensitive grep also matches prose comments like "-- Create table for X", producing 18 "for" tokens that were filtered).
- `DROP TABLE` (case-insensitive): **12 named tables dropped and never re-created**: coc_compliance_photos, coc_extractions, coc_local_validations, coc_validation_settings, coc_validations, inspection_signatures, issue_reports, notifications, suggestions, validation_conversations, validation_feedback, validation_messages (plus dynamic `*_snap_` snapshot drops). → **~61 tables remain by DDL arithmetic** (ASSUMED, see below).
- `CREATE VIEW` / `CREATE MATERIALIZED VIEW`: **0**.
- `CREATE (OR REPLACE )?FUNCTION`: **53 statements**, 32 distinct function names (case-insensitive extraction, `to|with` comment noise filtered): validate_access_link(×3), handle_new_user(×3), validate_inspection_templates(×2), update_updated_at_column(×2), track_floor_plan_pin_changes(×2), sync_coc_compliance_status(×2), rollup_subsection_coc_status(×2), get_public_subsection_review(×2), get_public_subsection(×2), get_public_site_review(×2), get_pending_verifications(×2), apply_subsection_recompute(×2), validate_api_token, trg_rollup_coc_from_documents, trg_recompute_from_template, trg_recompute_from_inspections, temp_reset_password, resolve_inspection_subsection, recompute_subsection_installation_status, normalize_shop_key, normalize_inspection_json_data, log_user_site_assignment, inspections_auto_link_subsection, has_role, get_user_client_id, get_rls_policies_for_role, get_public_site_register, get_public_portfolio, contractor_has_site_access, cleanup_old_pending_invites, cleanup_activity_logs, _share_link. (get_public_site_register appears in both 20260610113000-era naming and 20260727101000; multiplicities are redefinitions via CREATE OR REPLACE.)
- `CREATE TRIGGER`: **52 statements** (case-insensitive, name-bearing); dominated by per-table `update_<table>_updated_at` triggers (28 tables) plus: on_auth_user_created (×2 defs), trg_sync_coc_compliance (×2), trg_rollup_coc_from_documents, trg_recompute_from_inspections, trg_recompute_from_template (matched as `trg_` by the single-line grep — definition spans lines), trg_inspections_auto_link_subsection, trigger_cleanup_activity_logs, log_user_site_insert, log_user_site_delete, floor_plan_pin_changes_trigger.
- `CREATE POLICY` (multi-line perl scan, tracked files): **481 total** (case-insensitive single-line grep agreed at 481; perl name+target extraction resolved 458 of them to a target table). `DROP POLICY`: **277 statements** — heavy policy churn.
- Policies per table (top of 458 resolved): storage.objects 87, subsection_documents 18, sites 17, clients 17, site_documents 16, subsections 15, inspections 15, snags 13, document_categories 12, inspection_items 11, floor_plan_pins 11, calendar_events 11, subsection_floor_plans 10, site_assets 9, settings 9, inspection_templates 9, site_marking_checklist 8, schematic_blocks 8, coc_validations 8, coc_extractions 8, profiles 7, inspection_subsections 7, activity_logs 6, … (long tail of 1–5 per table; full command output preserved in commands above).
- `ENABLE ROW LEVEL SECURITY`: **65 statements**.
- `GRANT` (line-start): **14**; `REVOKE`: **11** — concentrated in the 2026-06 public-RPC/lockdown migrations.
- `CREATE (UNIQUE )?INDEX`: **126 statements**.
- `CREATE TYPE`: **2** — `public.app_role` enum (20251014120311) and `asset_category` (20260109105319); app_role later extended with 'moderator' (20251014172237) and 'Client' (20251017054230).
- `CREATE EXTENSION`: 1 — `pgcrypto SCHEMA extensions` (20260212144831:1).
- Storage buckets (INSERT INTO storage.buckets): **9 ids** — company-logos, client-logos, site-images, inspection-photos, documents (20251014132137:1-8), profile-images (20251015010856), issue-screenshots (20251018005315), suggestion-screenshots (20251028170100), coc-photos (20260406131029). Bucket public-flag flip-flops: made private (20251016064350 era), `UPDATE storage.buckets SET public = true WHERE id='documents'` (20251027082859), `UPDATE storage.buckets SET public = true;` (all buckets, 20251120083932).
- pg_cron / scheduled jobs: **0** — `grep -rn "cron\.\|pg_cron\|schedule" supabase/migrations/` matches only `coc_db_schedule` table naming, no cron.
- Realtime/publication: only `ALTER TABLE floor_plan_pins REPLICA IDENTITY FULL` (20251120103640:2); comment states table auto-added to `supabase_realtime` publication.

## Chronological timeline of migration themes (from filenames + first-line comments)

1. **2025-10-14 → 10-18 (bootstrap, Lovable-era UUID filenames):** profiles/user_roles/app_role enum, clients→sites→subsections→inspections hierarchy, storage buckets, QR scan tracking (qr_scans), inspection templates + seeded template content (946f7a2f: 561 LOC), pending_user_invites (Firebase migration), snags, COC validations v1 (coc_validations, validation_conversations/messages), user_clients + user_sites role mapping, issue_reports.
2. **2025-10-20 → 10-30:** activity-log cleanup function, qr_codes table, handle_new_user trigger, cascade FKs, settings OAuth fields, user_storage_connections, site_marking_checklist (Fortress), subsection_floor_plans, suggestions, notifications.
3. **2025-11:** issue-report verification, security fixes (search_path), contractor RLS restriction sweep (296d33c0: 279 LOC), user_sites_history, template normalisation + validation functions, then an RLS **loosening** arc (20251120: "Remove ALL RLS restrictions for authenticated users", "Remove ALL storage restrictions", anon-everything on storage), floor_plan_pins defect tracking + realtime, security-definer helper phase.
4. **2026-01:** inspection_signatures, QR public read policies, data-repair one-offs (broken photo URLs), site_assets enum/table, pdf_report_templates, api_clients/api_access_tokens/api_request_logs (OAuth API), coc_extractions v2, coc_validation_settings, site_schematics + schematic AI regions, client_access_links (magic links) + validate_access_link iterations, is_compliant repair one-offs.
5. **2026-02:** auto-logout settings, temp_reset_password (pgcrypto), onboarding_completed, access_link_visitors, contractor inspection updates.
6. **2026-03 → 04:** coc_local_validations ("strict empirical engine"), Annexure-1 COC columns, coc_compliance_photos, offline_photos, schematic_blocks policy fix, coc photos/policies rework (20260406131029).
7. **2026-05:** inspection auto-link/resolve functions (normalize_shop_key, resolve_inspection_subsection, inspection_relink_audit — 20260519045946), auth_events audit trail (first human-named migration, 20260525120000).
8. **2026-06 (security rebuild + feature razor):** airtight public-share RPC rebuild (`_share_link`, get_public_subsection, get_public_portfolio, get_public_site_review, get_public_subsection_review — SECURITY DEFINER, token-scoped), phase-1 write lockdown, anon lockdowns, emergency triage lockdown, admin-config write lockdown, snag lifecycle (Open→Rectified→Closed), COC manual workflow → compliance gate → per-document rollup; **drops**: coc auto-validation tables, validation feedback tables, feedback/suggestions/issue_reports feature, schematic AI detection, inspection_signatures; Fortress building layer (375 LOC: building_assets, tenants, tenant_*, ppm_tasks, utilities_readings, expense_recoveries, ohs_compliance_items, security_incidents, masterfile_index, building_condition_items) + hardening + RLS scoping (with the only two `.down.sql` files); calendar_events tenancy RLS; recompute triggers; site_health_snapshots; subsection required-flags; site COC system (coc_import_batches, coc_db_schedule, coc_certificates), coc_file_pool, site documents management, COC cross-tenant leak fix.
9. **2026-07 (current branch feat/qr-platform):** snapshot scoping, empty-site score semantics (two consecutive product-decision reversals: NULL → 0%), register-truth COC model (20260725100000), qr_scans hardening, public verdict RPCs, per-subsection QR kill-switch + public snag channel.

## supabase/config.toml (config, 66 LOC) — full detail

- `project_id = "oltzgidkjxwsukvkomof"` (line 1).
- Declares **20 edge functions** with per-function `verify_jwt`:
  - `verify_jwt = true` (9): invite-user:3, delete-user:6, validate-coc:15, extract-coc:18, send-email:21, verify-fix:27, fix-tenant-images:36, compress-image:52, batch-compress-images:55.
  - `verify_jwt = false` (11): qr-redirect:9, report-issue:12, offline-review:24, templates:30, save-template:33, api-reports:39, template-sync:42, detect-schematic-regions:46, fix-inspection-photos:49, oauth-token:58, log-auth-event:65 (comment lines 61-64 explain anon-callable auth audit events).
- No other sections (no [auth], [db], [api] blocks) — functions-only config.

## supabase/seeds/fortress_abaqulusi_seed.sql (generated, 525 LOC)

- Header (lines 1-3): "Fortress Building Pack — Abaqulusi Plaza seed (real data from the 3 workbooks)", "Generated; safe to re-run (ON CONFLICT DO NOTHING on fixed UUIDs)", "**NOT applied to live DB.** Review then load via supabase."
- Single BEGIN/COMMIT transaction; **14 INSERT statements** (`grep -c "INSERT"` → 14) targeting: clients(1 row), sites(1), building_assets(45), building_condition_items, expense_recoveries, masterfile_index, ohs_compliance_items, ppm_tasks, security_incidents, tenant_movements, tenant_shop_specs, tenant_trading, tenants, utilities_readings.
- Contains real named individuals and site operational data (asset managers, contractors, contact person) for "Abaqulusi Plaza (Vryheid Plaza)".

## supabase/templates/recovery.html (assets, 79 LOC)

- Supabase "Reset Password" recovery **email template**, code-first: leads with `{{ .Token }}` 6-digit OTP code, `{{ .ConfirmationURL }}` as fallback link (lines 11, 48, 60).
- Header comment (lines 4-9): exists because `src/views/auth/ForgotPassword.tsx` is OTP-first (`verifyOtp({ type: "recovery" })`); default Supabase template ships link-only.
- Deployment is manual: "Paste into: Dashboard → Authentication → Emails → Reset Password" (line 12). Inline-styled table layout, "WM Compliance" branding.

## Per-file index (path · LOC · theme from first comment line)

Command used per file: `first=$(grep -m1 -E "^\s*--" "$f")` (fallback `head -1`); `loc=$(wc -l < "$f")`. All 186 files listed. For banner-comment files the substantive line 2-4 was substituted (verified by `head -5`).

| File (supabase/…) | Type | LOC | Theme |
|---|---|---|---|
| config.toml | config | 66 | Edge-function verify_jwt registry (see section above) |
| seeds/fortress_abaqulusi_seed.sql | generated | 525 | Abaqulusi Plaza Fortress data seed (see section above) |
| templates/recovery.html | assets | 79 | OTP-first password-reset email template |
| migrations/20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql | source | 227 | Create profiles table for user information |
| migrations/20251014114445_1195edac-dd33-41e4-a355-8c10546c0f12.sql | source | 41 | Drop triggers first |
| migrations/20251014120224_e944a635-b5b0-4808-b7c8-87c5c2a774e9.sql | source | 24 | Create a temporary table to hold JSON import data |
| migrations/20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql | source | 63 | Step 1: Create app_role enum |
| migrations/20251014120619_17bfa39c-50ea-4700-a84a-a2eb2e47123b.sql | source | 8 | Add missing fields to inspections table for calendar functionality |
| migrations/20251014123510_4c69dadd-d092-4989-a989-92a7498dd462.sql | source | 57 | Add subsections table to reflect the hierarchy: Client -> Site -> Subsection -> Inspection |
| migrations/20251014132137_627a24bc-ffbf-499d-bd22-96df6a7f3bfc.sql | source | 216 | Create storage buckets for file uploads |
| migrations/20251014140001_3adc740c-7446-410a-a427-957d649c4e3c.sql | source | 119 | Add QR scan tracking table |
| migrations/20251014142244_6a0c83d2-744e-4324-88ea-422feed90721.sql | source | 18 | Add firebase_id columns for migration tracking |
| migrations/20251014161057_1b2dda59-9f57-4fc3-b974-fb363a09b703.sql | source | 239 | Add template sections and cover page support |
| migrations/20251014161831_946f7a2f-f651-48f7-8414-6a4382f2e9a0.sql | source | 561 | Clear existing mock templates |
| migrations/20251014162009_3bf47f66-6819-4806-8e6c-b9adc13d5e5b.sql | source | 216 | Add the 3 missing inspection templates |
| migrations/20251014164357_37295947-5f1a-4fb6-aa2f-b81d8cf4144d.sql | source | 43 | Create a table to track pending user invites from Firebase migration |
| migrations/20251014172237_cf2b6c0e-4e10-4df0-abc2-8a96d54ef0ab.sql | source | 1 | Add moderator role to the app_role enum |
| migrations/20251014172735_c6e9844f-0866-4231-ab9b-eab69d39132e.sql | source | 3 | Assign Admin role to the current user |
| migrations/20251015010134_9e552eb7-e8b8-4e7d-af61-f0ddac644a18.sql | source | 11 | Add additional fields to profiles table for comprehensive user information |
| migrations/20251015010856_b93b0802-94f0-48f4-9b68-3634fd86419f.sql | source | 29 | Create storage bucket for user profile images |
| migrations/20251015020520_32a5b0f5-76a0-4360-be7b-87968045b9ff.sql | source | 8 | Add inspection_template_id to subsections table |
| migrations/20251015023536_dd3e4507-2aa2-41e6-a9dd-1436f75fd1a6.sql | source | 10 | Add jsonData column to inspections table to store section/item data |
| migrations/20251015102828_8f5f0c1e-3952-42ff-9fa1-e8daa9e47cfc.sql | source | 33 | Allow public (anon) users to read subsections data for QR code landing pages |
| migrations/20251015103303_079ba222-db0d-4485-ba22-df42ad3f9cad.sql | source | 5 | Allow public (anon) users to read site documents for QR code landing pages |
| migrations/20251016021446_aee864aa-97f6-4256-92c0-270037c8248f.sql | source | 2 | Remove all existing "05 Photos" document categories |
| migrations/20251016021558_9338f335-479a-4f3a-bc57-d9419dfb9be8.sql | source | 57 | Create site_document_categories table |
| migrations/20251016023327_e0b8f5b5-c473-42c3-bbc7-f3c6476ec105.sql | source | 5 | Update Miniature substation and RMU templates to Medium Voltage category |
| migrations/20251016030509_dbabc2e4-cdf2-4eae-9d67-82ad2ca0c747.sql | source | 10 | Insert Site Drawing template |
| migrations/20251016035250_e064da77-54b8-4ded-809b-a6681d97c458.sql | source | 38 | Add user_id column to activity_logs for better access control |
| migrations/20251016035546_4ea02c08-d2af-456a-a2e2-cacd46327e5d.sql | source | 74 | CRITICAL SECURITY FIX: Remove Public Access to Sensitive Data |
| migrations/20251016064350_7ace660c-3ad8-402b-84db-2739d3e6fb38.sql | source | 162 | Security Fix Migration: Restrict Public Access to Sensitive Data |
| migrations/20251016064723_bcd61aa1-b207-4223-835c-f3a8e411fe81.sql | source | 124 | Storage Security Fix: Allow Public Download Access for QR Code Documents |
| migrations/20251016084545_dc21b520-ba68-4adc-b959-f28f7b58622c.sql | source | 52 | Create snags table for tracking inspection issues |
| migrations/20251016104322_cc0e1efe-adca-45fe-b49d-23c6cc380a09.sql | source | 5 | Add public read access policy for clients table |
| migrations/20251016111626_9fa96ad4-bc65-4ec9-b54f-41023f815b12.sql | source | 36 | Create table for COC validation results |
| migrations/20251016113024_31b52d48-f7a0-4c2a-87cd-320283b976dc.sql | source | 4 | Add report_data column to store comprehensive validation reports |
| migrations/20251016113423_5df235f6-7aef-41b1-b9f8-03182e4bc681.sql | source | 6 | Update the status check constraint to include 'Incomplete' |
| migrations/20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql | source | 106 | Create table for validation conversations |
| migrations/20251017043548_7ab8054f-1946-4205-8a34-99bf25c52db0.sql | source | 7 | Add risk level and cost fields to snags table |
| migrations/20251017054230_bf53246a-a037-4e22-8a74-1f4cfc594269.sql | source | 1 | Step 1: Add Client role to the app_role enum |
| migrations/20251017054255_cd78a557-c3ab-4a9b-b95c-d8da8696f61c.sql | source | 133 | Step 2: Create user_clients mapping table and update RLS policies |
| migrations/20251017061634_0f314109-0186-45b7-9d30-23aacfd775d3.sql | source | 77 | Create user_sites mapping table for contractors |
| migrations/20251017064450_8cae7d6c-a09d-4bc4-b6cd-35028cf54759.sql | source | 54 | Add Tenant section to Electrical Main Board (EMB) Inspection template |
| migrations/20251017071948_89f6119a-044d-4fd1-b784-ef25a48f542f.sql | source | 5 | Add tenants column to inspection_templates table |
| migrations/20251017094000_3768dc89-d62f-4024-8a63-0a5de4e09423.sql | source | 77 | Fix public exposure of profiles and clients tables |
| migrations/20251017095131_9a8ba3df-3011-4282-a18e-42ecf40feb00.sql | source | 40 | Add automatic cleanup for old pending user invites |
| migrations/20251018005315_1d30c9c7-745a-4860-b1b1-f281dc276ae7.sql | source | 91 | Create issue_reports table |
| migrations/20251020065437_b54abd96-4eda-439b-877e-4a5484631839.sql | source | 5 | Add public RLS policy for clients table to allow QR code pages to display client information |
| migrations/20251020065547_c5f5b509-3774-43e5-b73c-a488f18330af.sql | source | 5 | Add public RLS policy for document_categories table to allow QR code pages to view document cat |
| migrations/20251020070622_59d3cf0b-7767-4fa6-adfe-ce7cdcc11d6a.sql | source | 26 | Create a function to automatically cleanup old activity logs, keeping only the last 20 |
| migrations/20251020070753_59422a85-6134-454d-867a-e70d1a886abe.sql | source | 59 | Create QR codes tracking table |
| migrations/20251020093607_800422ff-162b-4cf6-867a-6b2d690a64ff.sql | source | 38 | Create function to handle new user registration |
| migrations/20251020093858_2be55e8a-8d60-4677-9da5-136858567424.sql | source | 91 | Add foreign key constraints with cascade delete for user-related tables |
| migrations/20251020123629_e30aa31c-baf1-46f7-ad58-f8bfd42b9762.sql | source | 8 | Add qr_code_url column to subsections table |
| migrations/20251020130110_6c8cad99-9700-40e9-abf0-dead96bc50bc.sql | source | 5 | Add qr_base_url column to settings table |
| migrations/20251022100347_e6759bc9-e992-44ff-8bed-b05750eaf68b.sql | source | 7 | Update the "Other" item name to "48V Relay Status" in the Low Voltage Line Shop Board Audit tem |
| migrations/20251027075744_d0a3d62f-05ac-43a0-acd4-363ae5890a1a.sql | source | 43 | Add OAuth and integration fields to settings table |
| migrations/20251027081639_22cefe19-20a8-46df-93a3-f10415c8a441.sql | source | 61 | Create table for user cloud storage connections |
| migrations/20251027082859_7734c90d-cee6-4b0a-8680-50c1d58d3c0e.sql | source | 3 | Make the documents bucket public so generated URLs work |
| migrations/20251027105104_aadc2c43-92c7-4986-b4a3-22d2cd298968.sql | source | 47 | Create table for Fortress site marking checklists |
| migrations/20251027110429_f5b9c306-3551-4d2a-a308-c72408d7b9f4.sql | source | 2 | Add status column to site_marking_checklist to support N/A items |
| migrations/20251027115044_3a5a0a85-6c4a-4c4e-8d8d-e2e91cf6a078.sql | source | 92 | Create table for floor plan uploads |
| migrations/20251028165823_3011bd73-ec7a-4eb0-a346-ede292d41f2e.sql | source | 52 | Create suggestions table |
| migrations/20251028170100_ca817971-a393-42ff-acf3-cfe94940a7ac.sql | source | 30 | Create storage bucket for suggestion screenshots |
| migrations/20251030071546_f84d79c3-3466-4537-9303-247210557c2a.sql | source | 36 | Create notifications table |
| migrations/20251107084904_f848b2f4-aef0-4826-82f4-35016bd08bf8.sql | source | 56 | Add verification fields to issue_reports |
| migrations/20251107084924_7b603496-c362-4353-abc9-589c617582cc.sql | source | 43 | Fix security warning: Set search_path for function |
| migrations/20251110081647_69f2e3a5-b549-4921-a121-2bae1928e144.sql | source | 5 | Add COC fields to subsection_documents table |
| migrations/20251112021952_4c1c7d0c-9fae-41f2-b1cc-e0ec2656a9bf.sql | source | 161 | Function to normalize inspection json_data from numeric to string keys |
| migrations/20251117082400_09890016-cc28-4211-b3a2-01092a0e1105.sql | source | 5 | Add public access policy for inspection photos |
| migrations/20251117082653_0af759f2-afb5-4817-a6cc-446df00b2bf1.sql | source | 4 | Remove conflicting authenticated-only policy that blocks public access |
| migrations/20251119090707_b34c56a3-76db-41b6-8553-9c2ab1c86cc8.sql | source | 82 | CRITICAL SECURITY FIX: Restrict contractors to only their assigned sites and related data |
| migrations/20251119090820_296d33c0-ea98-46ca-84c8-c43f543484d9.sql | source | 279 | COMPREHENSIVE RLS AUDIT: Restrict contractors across all tables |
| migrations/20251119091647_56f5417f-d8fc-439c-b8ee-87aa78e81070.sql | source | 57 | Create assignment history table |
| migrations/20251120045010_89850619-9989-42f7-9797-6560789b83b3.sql | source | 78 | Migration to normalize all inspection template sections |
| migrations/20251120045029_ad225a07-585f-413a-848f-97a6371a1dd9.sql | source | 75 | Create a function to validate inspection template structure |
| migrations/20251120045114_44ed9877-73bb-47f5-b28b-fa4b3da8148f.sql | source | 71 | Drop and recreate the validation function with corrected SQL |
| migrations/20251120045331_2c30ed20-db9a-4389-8a90-9778498cdffe.sql | source | 66 | Add DELETE policies for contractors and clients on subsection_documents table |
| migrations/20251120051502_3843cc67-3b79-4c47-be4a-e544dd4c03fc.sql | source | 293 | Drop overly permissive storage policies |
| migrations/20251120051830_0f728c09-ca3c-4f83-9cb1-6cb15188ab4b.sql | source | 29 | Create function to get RLS policies for a specific role |
| migrations/20251120061340_29a4cccb-992b-47a3-b12c-108886eed9da.sql | source | 33 | Create table for user-specific policy overrides |
| migrations/20251120074459_d72be4fe-2446-4d4a-8d57-345d35bacdf4.sql | source | 78 | Fix RLS policies for subsection_documents to allow proper uploads |
| migrations/20251120080137_6ff47814-7f82-4ef5-9362-7038050cc5b2.sql | source | 26 | Fix document upload RLS by simplifying to allow ALL authenticated users |
| migrations/20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql | source | 237 | Remove ALL RLS restrictions for authenticated users |
| migrations/20251120081347_dfe72b01-89cf-4ace-9fa6-39b1a1ccfbab.sql | source | 51 | Remove all restrictive storage policies for documents bucket |
| migrations/20251120083541_6381caa6-9675-4a9f-918b-d0954835b896.sql | source | 41 | Remove ALL storage restrictions for ALL buckets |
| migrations/20251120083932_7add3605-ec9c-4049-a8fb-233ff75a3349.sql | source | 31 | Remove ALL restrictions on storage - allow anonymous access for everything |
| migrations/20251120102352_9e71ab8f-203e-4876-9207-b010022c3232.sql | source | 83 | Enhance floor_plan_pins table with professional defect tracking features |
| migrations/20251120102409_a7bc6b71-ab85-43e9-aa98-adf6c1024c49.sql | source | 27 | Fix security warning: Set search_path for the function |
| migrations/20251120103640_b5942e14-2aea-455c-918f-9ce42b257ead.sql | source | 4 | Enable realtime for floor_plan_pins table |
| migrations/20251120110544_4e89ad10-205d-44f0-9308-05167a2a3326.sql | source | 263 | Phase 1: Create security definer helper functions |
| migrations/20251120111033_1e66f4c9-8418-4d98-9333-8331b5c0aa7a.sql | source | 55 | Emergency Fix: Add User role policies (without the INSERT that failed) |
| migrations/20260107120703_5e5ed71f-854c-4fc9-b271-870c47e8e026.sql | source | 23 | Add fix verification columns to issue_reports table |
| migrations/20260108042823_c7515df1-fcdf-4adc-ae75-55420c305177.sql | source | 51 | Create table for storing inspection signatures |
| migrations/20260108043155_ce46260e-e4f6-49dc-ac7f-b2fea35fcf99.sql | source | 12 | Add rectification photo support to floor_plan_pins |
| migrations/20260108071956_61a3cdd4-0e0d-414e-a0aa-db2c0a258935.sql | source | 31 | Add public read policies for QR code landing page |
| migrations/20260108121126_8c54625a-9d18-45ef-8ba5-5358ba8bce5b.sql | source | 10 | Clean up broken photo URLs from inspection d4b630cf-f484-4d42-b346-d891c9c85f39 |
| migrations/20260108121329_2579467d-a0d9-4adf-bbe5-19e8f770c887.sql | source | 10 | Clean up broken photo URLs from "Ventilation & Cooling Systems" (section 0, item 2) |
| migrations/20260109084016_d57b7c31-aec3-441a-8832-76fcda58be64.sql | source | 7 | Add public read access for snags on the public QR landing page |
| migrations/20260109105319_51c4643e-1fc9-42d3-b4cc-8dad8d520921.sql | source | 83 | Create asset_types enum for categorizing assets |
| migrations/20260110132516_9c4acf95-e674-4d32-a18d-668b0add0770.sql | source | 80 | Create table for PDF report templates |
| migrations/20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql | source | 103 | Create table for OAuth API clients (external applications) |
| migrations/20260112114907_df79a7e4-f9b1-4de4-a1f9-0ef5bbdb3db0.sql | source | 18 | Backfill subsection_documents with extracted COC data from existing validations |
| migrations/20260113062616_960f2100-566c-454c-9738-b22646ec4836.sql | source | 50 | Create table to store COC extraction results |
| migrations/20260113062636_77327e63-3e41-4a7f-a70f-87a2706690ab.sql | source | 37 | Fix RLS policies for coc_extractions to be more restrictive |
| migrations/20260113123609_5d0752d4-c95d-4b30-b716-95177dc4bdd4.sql | source | 22 | Fix is_compliant for subsections that have failed validations but are marked as compliant |
| migrations/20260114082530_362f8fa2-77e6-44f2-9f74-fb117a357932.sql | source | 21 | Fix COC type and status CHECK constraints to allow all valid values |
| migrations/20260116052034_3ec8c385-2428-402e-9763-a9871451eb55.sql | source | 65 | Create coc_validation_settings table for storing validation configuration |
| migrations/20260119123152_ec4cb176-c376-4617-9b79-9e3b465a89ff.sql | source | 7 | Add asset-verification section to existing site_summary templates |
| migrations/20260120073408_51e2e561-5e4c-4f1b-8d1d-90d987a494c7.sql | source | 16 | Add fortress-checklist section to existing site_summary templates |
| migrations/20260120132425_dd27775f-2702-483d-846e-ba743b2d95f6.sql | source | 88 | Create table for storing site schematic diagrams |
| migrations/20260121080355_91217713-58ee-40f1-a28d-4b1b52c293ab.sql | source | 11 | Add detected_regions column to store AI-detected rectangle coordinates |
| migrations/20260121094541_8396c0ac-ce43-427a-a6ed-48645ef9ac70.sql | source | 4 | Add calibration fields to site_schematics |
| migrations/20260122090622_9c76c44a-8b4a-4666-807a-e523b21acfea.sql | source | 73 | Create table for client access links (shareable magic links) |
| migrations/20260123052442_27d0f826-373b-45e8-b6a3-bb0a40fe67f3.sql | source | 72 | Add public read policies for tables needed by public review pages |
| migrations/20260123052554_ac3f12e7-5888-4960-bf58-c83716abe25c.sql | source | 15 | The validate_access_link function already has SECURITY DEFINER, |
| migrations/20260123052614_a764fe2c-37bc-4a80-b19b-6860d8086690.sql | source | 55 | Drop the overly permissive UPDATE policy we just created |
| migrations/20260123052657_71a9512e-785c-4b85-bb99-36699b88907d.sql | source | 66 | The correct approach: use SECURITY DEFINER which executes as the function owner |
| migrations/20260130084823_e2a3c7ab-238a-4ebf-be44-b4f129217d9b.sql | source | 23 | Fix subsections where coc_status shows "Approved" but latest validation shows "Fail" |
| migrations/20260201150950_afa72d38-c1ae-4c85-8035-d0d82fe2c724.sql | source | 23 | Fix 1: Set is_compliant=false for subsections with Missing COC that require COC |
| migrations/20260201151127_01cd682f-c771-455b-9df6-dd86d54b1af4.sql | source | 70 | Create function to auto-update is_compliant when coc_status changes |
| migrations/20260206105621_98283aeb-a916-4255-912c-ca7e946e34c0.sql | source | 3 | Add auto-logout settings columns to settings table |
| migrations/20260212144831_85c05452-caf9-430b-b7cf-57affed32a53.sql | source | 26 | CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions; |
| migrations/20260214023114_a056bc18-90e7-4e5b-9b06-b7b6443a3ce7.sql | source | 32 | Add onboarding_completed column to profiles |
| migrations/20260214023532_c185ee4b-5e08-474c-b743-f138fea45cb3.sql | source | 1 | Mark all existing users as onboarding completed so they aren't blocked |
| migrations/20260216054714_fd97a029-74c6-40db-8d62-a78858ea0f2f.sql | source | 27 | Allow all authenticated users to insert site assets |
| migrations/20260217075058_c326adca-137f-404f-8bdb-00d321ce1fc0.sql | source | 0 | UPDATE settings SET qr_base_url = 'https://wm-compliance.lovable.app' WHERE qr_base_url = 'http |
| migrations/20260217082506_a2247d71-37f4-49d4-bb28-fbb9724692fd.sql | source | 31 | Table to store visitor details and log each access |
| migrations/20260217085025_6cdfaefc-6542-454a-b068-c3bc37e1ede1.sql | source | 6 | Allow anonymous users to read site_assets (for public review portals) |
| migrations/20260219090420_f8f55711-3403-4e75-90cc-fbb90366a038.sql | source | 26 | Allow contractors to update inspections on their assigned sites |
| migrations/20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql | source | 75 | Table for local COC validation records (strict empirical engine) |
| migrations/20260310075810_564cfaa3-71b1-47c0-9b8f-e0dc9457d00d.sql | source | 35 | Add columns to support Annexure 1 COC form structure |
| migrations/20260310083442_1b964afb-fbe3-4c55-9ad2-531d76c72522.sql | source | 79 | Create coc_compliance_photos table |
| migrations/20260310085611_954679cb-a199-4078-b21b-79f70f49edfa.sql | source | 69 | CRITICAL 2: Create offline_photos table for all non-COC photo contexts |
| migrations/20260313070142_6cd46c5f-c280-4370-b0b0-c23bb53c26ed.sql | source | 22 | Fix schematic_blocks INSERT policy to target authenticated role |
| migrations/20260313095510_cbed8b59-80ec-490d-b3a7-2841dbb0dd49.sql | source | 8 |  |
| migrations/20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql | source | 102 | coc_compliance_photos |
| migrations/20260410013045_e3990969-d3ba-4378-94ca-bfa2e8d541b3.sql | source | 33 | 1. Add columns to snags |
| migrations/20260519045946_ff0d3334-68ec-431a-b213-6a5bc51b25f1.sql | source | 119 | 1. Schema additions |
| migrations/20260525120000_auth_events_audit.sql | source | 55 | Migration: 20260525120000_auth_events_audit.sql |
| migrations/20260610113000_public_rpcs_phase1.sql | source | 77 | Airtight public-share rebuild — Phase 1: QR page + portfolio page functions. |
| migrations/20260610120000_phase1_write_lockdown.sql | source | 104 | Phase 1 remediation — write-side RLS lockdown |
| migrations/20260610130000_public_drilldown_rpcs.sql | source | 164 | Airtight public-share rebuild — Phase 2: review drill-down functions. |
| migrations/20260611100000_anon_lockdown_oob_tables.sql | source | 27 | 20260611100000_anon_lockdown_oob_tables.sql |
| migrations/20260611110000_emergency_triage_lockdown.sql | source | 59 | 20260611110000_emergency_triage_lockdown.sql |
| migrations/20260611140000_admin_config_write_lockdown.sql | source | 161 | Phase 1b remediation — admin-config write-side RLS lockdown |
| migrations/20260611150000_snag_status_lifecycle.sql | source | 28 | Snag lifecycle: Open -> Rectified -> Closed. Replaces the original |
| migrations/20260611160000_coc_manual_workflow.sql | source | 49 | COC manual workflow: add fields, normalise status, derive is_compliant from the manual |
| migrations/20260611161000_coc_status_check_permissive.sql | source | 21 | Relax the coc_status CHECK so the OLD validation flow (still deployed) does not break. |
| migrations/20260612120000_coc_compliance_gate.sql | source | 71 | COC verdict becomes a GATE on is_compliant, integrated into the inspection-driven |
| migrations/20260612130000_drop_coc_validation_tables.sql | source | 11 | Drop the COC auto-validation engine tables outright (no snapshot — decision #3). |
| migrations/20260612131000_drop_validation_feedback_tables.sql | source | 7 | Drop the COC-validation feedback loop tables. These belonged to the removed validation |
| migrations/20260612140000_coc_per_document_rollup.sql | source | 119 | Per-document COC: add expiry, normalise messy values, and derive subsections.coc_status |
| migrations/20260612200000_fortress_building_layer.sql | source | 375 | Fortress Building Report Pack — property/facilities-management layer |
| migrations/20260612210000_fortress_layer_hardening.down.sql | source | 36 | DOWN — reverses 20260612210000_fortress_layer_hardening.sql |
| migrations/20260612210000_fortress_layer_hardening.sql | source | 82 | Fortress layer — hardening follow-up (schema-review fixes SV-1, SV-2, SV-4, SV-5) |
| migrations/20260612220000_fortress_rls_scope.down.sql | source | 20 | DOWN — reverts Fortress RLS to the base blanket read (…200000 posture). |
| migrations/20260612220000_fortress_rls_scope.sql | source | 65 | Fortress layer — RLS hardening (security review · addresses G-SEC-13) |
| migrations/20260612230000_drop_feedback_feature_tables.sql | source | 10 | Remove the in-app issue-reporting + suggestions + fix-verification feature entirely. |
| migrations/20260612240000_calendar_events_date_order_check.sql | source | 8 | C3: prevent inverted date ranges on calendar_events. An end_date before start_date |
| migrations/20260612250000_calendar_events_tenancy_rls.sql | source | 45 | C2: give calendar_events real tenancy + attribution and replace the permissive |
| migrations/20260614090000_drop_schematic_ai_detection.sql | source | 14 | Drop the unused AI schematic-region-detection columns. |
| migrations/20260614090500_schematic_blocks_page_number.sql | source | 13 | Scope schematic blocks to a PDF page. |
| migrations/20260614100000_public_site_review_schematic_assets.sql | source | 94 | Phase 1 of public-read RLS hardening (docs/security/public-read-rls-hardening.md): |
| migrations/20260614110000_drop_stale_anon_site_assets_policy.sql | source | 16 | Reconcile migration history with production for site_assets RLS. |
| migrations/20260615120000_recompute_on_inspection_change.sql | source | 41 | Recompute subsections.is_compliant when an inspection changes. |
| migrations/20260615130000_drop_inspection_signatures.sql | source | 93 | Remove the inspection sign-off / signatures feature. |
| migrations/20260615140000_inspection_status_existence_based.sql | source | 109 | Inspection status markers → existence-based compliance. |
| migrations/20260616100000_fix_recompute_from_template_trigger.sql | source | 36 | Fix the trg_recompute_from_template() trigger function. |
| migrations/20260616110000_site_health_snapshots.sql | source | 28 | Per-site daily health snapshots — powers the KPI dashboard "Trends" card. |
| migrations/20260616120000_subsection_thermal_required.sql | source | 19 | Per-subsection "thermal/infrared report required" flag. |
| migrations/20260616130000_subsection_inspection_required.sql | source | 8 | Per-subsection "inspection required" flag. When false, the subsection is treated as |
| migrations/20260619120000_coc_evaluation_reports.sql | source | 11 | Evaluation reports: link a supporting evaluation/verification report document to |
| migrations/20260619130000_site_coc_system.sql | source | 90 | Site COC system: ingest the COC working workbooks into structured, subsection-integrated |
| migrations/20260619140000_coc_cert_document_links.sql | source | 7 | Link an imported COC certificate row to the actual uploaded files (COC + evaluation report) |
| migrations/20260619150000_coc_file_pool.sql | source | 25 | Site COC file pool: every dropped file uploads here first (never rejected). Exact register |
| migrations/20260621120000_site_documents_management.sql | source | 35 | Site Documents management: add document metadata to site_documents, add an is_system |
| migrations/20260623120000_coc_client_read_and_leak_fix.sql | source | 74 | Close the cross-tenant leak on the COC tables (previously `using (true)` for SELECT |
| migrations/20260624120000_coc_pool_reasons.sql | source | 6 | Persist the assignment classification on each pooled COC file so the Bulk Assign |
| migrations/20260708090000_site_health_snapshots_scoping.sql | source | 38 | Scope site_health_snapshots reads. |
| migrations/20260708150000_null_health_scores_for_empty_sites.sql | source | 11 | An empty site (no subsections captured) has NO health score. |
| migrations/20260708170000_empty_sites_score_zero.sql | source | 9 | Product decision (2026-07-08): an unpopulated site (zero subsections) scores 0% — |
| migrations/20260725100000_coc_register_truth.sql | source | 114 | Register-truth COC model: |
| migrations/20260727100000_qr_scans_hardening.sql | source | 40 | qr_scans hardening: the table has existed since 20251014140001 but nothing |
| migrations/20260727101000_public_verdict_rpcs.sql | source | 121 | QR platform: public verdict exposure. |
| migrations/20260727102000_qr_killswitch_snag_channel.sql | source | 16 | Per-subsection QR kill-switch (checked by the qr-redirect edge function) and |

## Runtime observations (file:line cited)

- **Edge-function registry**: supabase/config.toml declares 20 edge functions; anon-callable (verify_jwt=false) entry points include qr-redirect (config.toml:9-10), report-issue (:12-13), offline-review (:24-25), templates (:30-31), save-template (:33-34), api-reports (:39-40), template-sync (:42-43), detect-schematic-regions (:46-47), fix-inspection-photos (:49-50), oauth-token (:58-59), log-auth-event (:65-66, rationale comment :61-64).
- **Auth-signup hook**: trigger `on_auth_user_created AFTER INSERT ON auth.users` → `public.handle_new_user()`; first user auto-gets Admin role (20251020093607_800422ff.sql:23,33-37).
- **Anon/public request surface (SECURITY DEFINER RPCs granted to anon)**: `_share_link(p_token)` (20260610113000_public_rpcs_phase1.sql:9), `get_public_subsection(p_subsection_id)` (:22; redefined with 'verdict' key in 20260727101000_public_verdict_rpcs.sql:24), `get_public_portfolio(p_token)` (:53), `get_public_site_review(p_token,p_site_id)` (20260610130000_public_drilldown_rpcs.sql:12), `get_public_subsection_review(p_token,p_subsection_id)` (:86), `get_public_site_register(p_site_id)` (20260727101000_public_verdict_rpcs.sql:93, GRANT to anon :116).
- **Service-role writers (out-of-band jobs)**: qr_scans rows are written by the qr-redirect edge function using service role (20260727100000_qr_scans_hardening.sql:1-4); site_health_snapshots "written by the scheduled capture job (service role bypasses RLS)" (20260616110000_site_health_snapshots.sql:2) — the scheduler itself is NOT defined in any migration (no pg_cron found).
- **In-DB background maintenance**: `cleanup_activity_logs()` keeps last 20 rows via trigger `trigger_cleanup_activity_logs` (20251020070622_59d3cf0b.sql:1); `cleanup_old_pending_invites()` (20251017095131_9a8ba3df.sql:1).
- **Trigger-driven recompute pipeline**: `trg_recompute_from_inspections` / `apply_subsection_recompute` recompute subsections.is_compliant on inspection change (20260615120000_recompute_on_inspection_change.sql:1); `trg_recompute_from_template` fix (20260616100000); `trg_rollup_coc_from_documents` rolls up per-document COC status (20260612140000); `trg_sync_coc_compliance` (20260201151127).
- **QR kill-switch**: `subsections.qr_disabled` column "checked by the qr-redirect edge function" (20260727102000_qr_killswitch_snag_channel.sql:1-8); snags gain `reported_channel` ('internal'|'public_qr') (:10-16).
- **Realtime**: floor_plan_pins REPLICA IDENTITY FULL for supabase_realtime (20251120103640:2).
- **External integrations referenced in DDL**: OAuth API surface (api_clients, api_access_tokens, api_request_logs — 20260110172925:1); user cloud-storage connections (20251027081639:1); Turnstile/captcha not in this slice.
- **Manual deploy channel**: recent migrations carry "PROD APPLY: Supabase Management API database/query … NOT supabase db push (prod schema is ahead of schema_migrations)" (20260727100000:5-6, 20260727101000:16-17, 20260727102000:4-5).

## Oddities (factual only)

- **Untracked " 2.sql" duplicate inside migrations dir**: `supabase/migrations/20260525120000_auth_events_audit 2.sql` exists on disk but is not in git (git status untracked); naive shell globs (e.g. `supabase/migrations/*.sql`) include it and double-count auth_events DDL.
- **Zero-newline migration**: `20260217075058_c326adca….sql` reports 0 lines via `wc -l` but contains 142 bytes (`wc -c` → 142) — a single UPDATE of settings.qr_base_url to 'https://wm-compliance.lovable.app' with no trailing newline.
- **Only 2 of 183 files have `.down.sql` counterparts**: 20260612210000_fortress_layer_hardening.down.sql (36 LOC) and 20260612220000_fortress_rls_scope.down.sql (20 LOC); no other migration is reversible-by-file.
- **Filename convention break**: 20251014→20260519 use `<timestamp>_<uuid>.sql` (Lovable-generated); from 20260525120000_auth_events_audit.sql onward all are human-named. 
- **Migration history diverges from production**: three 2026-07 migrations state prod is applied via Management API because "prod schema is ahead of schema_migrations" (20260727100000:5-6).
- **RLS churn recorded in-history**: 481 CREATE POLICY vs 277 DROP POLICY across 183 files; November 2025 contains an explicit "Remove ALL RLS restrictions for authenticated users" (20251120080517:1) and "allow anonymous access for everything" on storage (20251120083932:1), later reversed by 2026-06 lockdown migrations.
- **12 tables created then dropped** (feature removals live in history): COC auto-validation engine (coc_validations, coc_extractions, coc_local_validations, coc_validation_settings, coc_compliance_photos), validation feedback loop (validation_conversations/messages/feedback), feedback feature (issue_reports, suggestions, notifications), inspection_signatures.
- **Contradictory consecutive product decisions**: 20260708150000 sets empty-site health score to NULL ("has NO health score"); 20260708170000 (same day) reverses to 0%.
- **Seed not applied**: seeds/fortress_abaqulusi_seed.sql:3 says "NOT applied to live DB. Review then load via supabase." It also contains real personal names/contact roles.
- **temp_import** table created for one-time JSON import (20251014120224:1) with no DROP in history.
- **temp_reset_password** function exists in history (20260212144831) — name declares itself temporary; no DROP found in migrations (`grep -l "temp_reset_password"` matches only its creating file).
- **recovery.html deploys by hand**: template must be pasted into the Supabase dashboard (recovery.html:12); nothing in-repo wires it.

## ASSUMED (inferred, not verified)

- "~61 tables currently live" is DDL arithmetic (73 created − 12 dropped); the true prod schema may differ, especially since migrations state prod is AHEAD of schema_migrations (see Oddities). No live DB was queried.
- Distinct-name extraction filtered tokens `for`/`to`/`with` as comment noise; assumed no real table/function is actually named `for`/`to`/`with`.
- The seed file is classified "generated" solely on its own header claim ("Generated; safe to re-run"); the generator itself was not located in this slice.
- The "scheduled capture job" writing site_health_snapshots is assumed to live outside this slice (edge function or external cron); not verified here.
- Per-table policy counts are lower-bound: the perl extraction resolved 458 of 481 CREATE POLICY statements; the remainder had formats the regex did not capture (e.g. schema-qualified/odd whitespace).
- LOC for the migrations subgroup (10,443) computed as 11,113 − 66 − 525 − 79 from the single `wc -l` run.
