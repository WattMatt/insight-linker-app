# Triggers, Enums, Views, Storage, Realtime, Extensions

Effective (post-replay) state of all non-table, non-RLS schema objects. Replay order = migration filename order across `migration-events-01..10.json`; later events override earlier. The dashboard-applied `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` is treated as applied AFTER all migrations — it touches only `public`-schema SELECT policies (not triggers, enums, views, storage, realtime, or extensions), so it has **no effect** on any object documented here except indirectly (see Storage note).

Every claim cites `migration:line` against the work-batch JSON event log (`_work/migration-events-NN.json`), or names the migration `.sql` file. Where a claim could not be verified in the event log it is marked ⚠️ UNVERIFIED inline.

---

## 1. Triggers

### 1.1 Trigger function `public.update_updated_at_column()`

Generic `BEFORE UPDATE` timestamp maintainer: `NEW.updated_at = NOW(); RETURN NEW`. Originally `SECURITY INVOKER` with no `search_path` (20251014114352, events-01:300); dropped and recreated as `SECURITY DEFINER` + `SET search_path = public` in 20251014114445 (events-01:378). That `SECURITY DEFINER` version is the effective one.

All triggers below execute `public.update_updated_at_column()` `BEFORE UPDATE ... FOR EACH ROW`. The four originals on `profiles/clients/sites/inspections` were dropped and recreated in 20251014114445 (events-01:338-416); effective state is the recreated set.

| Trigger | Table | Created in (migration) | Citation |
|---|---|---|---|
| `update_profiles_updated_at` | `profiles` | 20251014114445 | events-01:388 |
| `update_clients_updated_at` | `clients` | 20251014114445 | events-01:394 |
| `update_sites_updated_at` | `sites` | 20251014114445 | events-01:402 |
| `update_inspections_updated_at` | `inspections` | 20251014114445 | events-01:410 |
| `update_settings_updated_at` | `settings` | 20251014132137 | events-01:1140 |
| `update_calendar_events_updated_at` | `calendar_events` | 20251014132137 | events-01:1146 |
| `update_site_documents_updated_at` | `site_documents` | 20251014140001 | events-01:1356 |
| `update_inspection_templates_updated_at` | `inspection_templates` | 20251014140001 | events-01:1362 |
| `update_pending_user_invites_updated_at` | `pending_user_invites` | 20251014164357 | events-01:1538 |
| `update_subsections_updated_at` | `subsections` | 20251014123510 | events-01:642 |
| `update_snags_updated_at` | `snags` | 20251016084545 | events-03:218 |
| `update_validation_conversations_updated_at` | `validation_conversations` | 20251016114052 | events-03:482 |
| `update_issue_reports_updated_at` | `issue_reports` | 20251018005315 | events-04:114 |
| `update_qr_codes_updated_at` | `qr_codes` | 20251020070753 | events-04:202 |
| `update_user_storage_connections_updated_at` | `user_storage_connections` | 20251027081639 | events-04:522 |
| `update_site_marking_checklist_updated_at` | `site_marking_checklist` | 20251027105104 | events-05:58 |
| `update_floor_plans_updated_at` | `subsection_floor_plans` | 20251027115044 | events-05:186 |
| `update_pins_updated_at` | `floor_plan_pins` | 20251027115044 | events-05:194 |
| `update_user_policy_overrides_updated_at` | `user_policy_overrides` | 20251120061340 | events-06:473 |
| `update_site_assets_updated_at` | `site_assets` | 20260109105319 | events-07:826 |
| `update_pdf_report_templates_updated_at` | `pdf_report_templates` | 20260110132516 | events-07:890 |
| `update_coc_extractions_updated_at` | `coc_extractions` | 20260113062616 | events-08:194 |
| `update_coc_validation_settings_updated_at` | `coc_validation_settings` | 20260116052034 | events-08:330 |
| `update_site_schematics_updated_at` | `site_schematics` | 20260120132425 | events-08:490 |
| `update_schematic_blocks_updated_at` | `schematic_blocks` | 20260120132425 | events-08:498 |
| `update_coc_local_validations_updated_at` | `coc_local_validations` | 20260309172544 | events-10:68 |

### 1.2 Other (non-timestamp) triggers

| Trigger | Table | Timing / event | Function | Purpose | Citation |
|---|---|---|---|---|---|
| `on_auth_user_created` | `auth.users` | `AFTER INSERT FOR EACH ROW` | `public.handle_new_user()` | On signup, inserts a `profiles` row and a `user_roles` row. Dropped+recreated in 20251020093607; function body has changed several times (see §1.3). | events-04:242 (recreate), events-01:290 (orig) |
| `trigger_cleanup_activity_logs` | `activity_logs` | `AFTER INSERT FOR EACH STATEMENT` | `public.cleanup_activity_logs()` | After every insert, trims `activity_logs` to the 20 most recent rows. | events-04:146 |
| `log_user_site_insert` | `user_sites` | `AFTER INSERT FOR EACH ROW` | `public.log_user_site_assignment()` | Writes an `'assigned'` row into `user_sites_history`. | events-06 (20251119091647), events-06:44 |
| `log_user_site_delete` | `user_sites` | `AFTER DELETE FOR EACH ROW` | `public.log_user_site_assignment()` | Writes a `'removed'` row into `user_sites_history`. | events-06:50 |
| `floor_plan_pin_changes_trigger` | `floor_plan_pins` | `BEFORE UPDATE FOR EACH ROW` | `public.track_floor_plan_pin_changes()` | Appends a diff entry (status/priority/assigned_contractor from→to) to `edit_history`, sets `last_modified_at = NOW()`. Function gained `SECURITY DEFINER`+`search_path` in 20251120102409. | events-06:138 (trigger), events-06:147 (fn fix) |
| `trg_sync_coc_compliance` | `subsections` | `BEFORE INSERT OR UPDATE OF coc_status, is_coc_required FOR EACH ROW` | `public.sync_coc_compliance_status()` | Recomputes `is_compliant` from `coc_status`/`is_coc_required` and the latest `coc_validations` row. | events-09:106 |
| `trg_inspections_auto_link_subsection` | `inspections` | `BEFORE INSERT OR UPDATE OF json_data, subsection_id FOR EACH ROW` | `public.inspections_auto_link_subsection()` | When `subsection_id IS NULL`, resolves a subsection from `json_data` (firebase key / shop number) and sets `NEW.subsection_id`. | events-10:700 |

### 1.3 `public.handle_new_user()` — effective body

`LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` (final version `'public'`). Effective definition (20260214023114, events-09:171):

```sql
INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN (SELECT COUNT(*) FROM auth.users) = 1
                       THEN 'Admin'::app_role ELSE 'User'::app_role END);
RETURN NEW;
```

History: created inserting only `profiles` (20251014114352, events-01:282); rewritten in 20251020093607 to also insert `user_roles` where BOTH `CASE` branches yielded `'Admin'` (every signup became Admin, events-04:234); final 20260214023114 rewrite makes the `ELSE` branch `'User'` so only the first-ever user gets `'Admin'`.

### 1.4 Trigger functions with no trigger / one-off functions (not active triggers)

- `public.cleanup_old_pending_invites()` — `SECURITY DEFINER`, deletes `pending_user_invites` older than 30 days; granted `EXECUTE TO authenticated`; intended for manual/pg_cron use — NOT wired to any trigger (20251017095131, events-04:2). ⚠️ UNVERIFIED whether a `pg_cron` job calls it (no `cron.schedule` in the event log).
- `public.normalize_inspection_json_data()` — one-off; created, run, then `DROP FUNCTION` in the same migration 20251112021952 (events-05:507-529). **Gone** from effective schema.
- `public.temp_reset_password()` — one-off; created, run, then dropped in 20260212144831 (events-09:139-160). **Gone**.

---

## 2. Enums (effective value sets)

Only two `CREATE TYPE ... AS ENUM` appear in the log. (`confidence`, `coc_type`, `coc_status`, etc. on various tables are TEXT `CHECK` constraints, not enums — excluded.)

| Enum type | Effective values (in definition order) | Definition + ALTER history | Citation |
|---|---|---|---|
| `public.app_role` | `'Admin'`, `'User'`, `'Contractor'`, `'Client'`, `'Moderator'` | Created `AS ENUM ('Admin','User','Contractor')` in 20251014120311. `ADD VALUE 'Moderator'` in 20251014172237. `ADD VALUE 'Client'` in 20251017054230. | events-01:451 (create); events-01:1546 (Moderator); events-02:507 (Client) |
| `public.asset_category` | `'electrical_meter'`, `'water_meter'`, `'equipment'`, `'other'` | Created `AS ENUM (...)` in 20260109105319. No `ALTER TYPE` afterward. (File comment mislabels it "asset_types".) | events-07:771 |

Append order note: `'Moderator'` was added (20251014172237) before `'Client'` (20251017054230), so the enum's physical sort order is Admin, User, Contractor, Moderator, Client. The table above lists Client before Moderator only for readability; ⚠️ UNVERIFIED which of Client/Moderator sorts first in `enumsortorder` (ALTER TYPE ADD VALUE without BEFORE/AFTER appends at the end, so the literal order is Admin, User, Contractor, **Moderator, Client**).

---

## 3. Views

**None.** No `CREATE VIEW` or `CREATE MATERIALIZED VIEW` event appears anywhere in `migration-events-01..10.json` or in the applied prod SQL. The application instead exposes read access via `SECURITY DEFINER` RPC functions (e.g. `get_public_subsection`, `get_public_site_review`) and via RLS on base tables.

---

## 4. Storage buckets

### 4.1 Bucket inventory (effective public flag)

The decisive event for most buckets is **`20251120083541`**, which ran `UPDATE storage.buckets SET public = true` with **no WHERE clause** — flipping *every* bucket to public (events-06:1400). No later migration sets any of these back to private, so all buckets that existed at that point are public. `coc-photos` was created later, already `public=true`.

| Bucket id/name | public (effective) | Created (migration) | Public-flag trail | Citation |
|---|---|---|---|---|
| `company-logos` | **true** | 20251014132137 | created `true` | events-01:652 |
| `client-logos` | **true** | 20251014132137 | created `true` | events-01:658 |
| `site-images` | **true** | 20251014132137 (`true`) → 20251017094000 set `false` → 20251120083541 set `true` (blanket) | events-01:666; events-03:700; events-06:1400 |
| `inspection-photos` | **true** | 20251014132137 | created `true` | events-01:674 |
| `documents` | **true** | 20251014132137 (`false`) → 20251027082859 `true` → (20251120081347 `true`) → 20251120083541 `true` | events-01:682; events-04:539; events-06:1342 |
| `profile-images` | **true** | 20251015010856 (`true`) → 20251017094000 set `false` → 20251120083541 set `true` (blanket) | events-02:91; events-03:700; events-06:1400 |
| `issue-screenshots` | **true** (blanket) | 20251018005315 (`false`) → 20251120083541 `true` | events-04:35; events-06:1400 |
| `suggestion-screenshots` | **true** (blanket) | 20251028170100 (`false`) → 20251120083541 `true` | events-05:258; events-06:1400 |
| `coc-photos` | **true** | 20260310083442 | created `true` | events-10:158 |

Notes:
- The 20251017094000 security fix that set `profile-images` and `site-images` to `false` (events-03:700) was **fully reverted** by the blanket 20251120083541 update.
- ⚠️ UNVERIFIED: no migration sets `file_size_limit` or `allowed_mime_types` on any bucket. Every `INSERT INTO storage.buckets` uses only `(id, name, public)`. Effective file-size / MIME limits are therefore the Supabase defaults (project-level), not set in SQL.

### 4.2 `storage.objects` policies — effective set (verbatim)

The effective storage.objects policy set is determined by the **last migration that mutated storage.objects policies for each bucket**. Two late migrations wiped *all* storage policies via dynamic `DO` blocks:

- `20251120083541` (events-06:1390) dropped ALL storage.objects policies, then created 5.
- `20251120083932` (events-06:1448) again dropped ALL storage.objects policies, then created 4. **This is the last whole-table storage-policy reset.**
- `20260310083442` (events-10:166) and `20260310085611` (events-10:240) then ADD/replace `coc-photos`-scoped policies (these do not drop the four blanket policies, which contain no name filter match for the dynamic drops — but note both 20251120083541/083932 ran *before* coc-photos existed).

So the effective `storage.objects` policy set = the four blanket policies from `20251120083932` **plus** the `coc-photos` policies layered on in 20260310083442 / 20260310085611. All policies below are the effective ones; all earlier per-bucket/per-role policies (company-logos, client-logos, site-images, inspection-photos, documents, profile-images, issue-screenshots, suggestion-screenshots from 20251120051502 and earlier) were **dropped** and are NOT in effect.

#### Blanket policies (from 20251120083932, events-06:1456-1485)

All four have **no `TO` clause → default role `public` (includes anon)**. None has a `bucket_id` filter.

```sql
-- "Anyone can view all storage"   FOR SELECT  USING (true)
-- "Anyone can upload to all storage"  FOR INSERT  WITH CHECK (true)
-- "Anyone can update all storage"  FOR UPDATE  USING (true)        -- no WITH CHECK
-- "Anyone can delete from all storage"  FOR DELETE  USING (true)
```

Net effect: anonymous users can SELECT/INSERT/UPDATE/DELETE any object in any bucket via the storage API.

#### `coc-photos`-scoped policies (layered after the blanket reset)

From `20260310083442` (events-10:166-187):

```sql
-- "Authenticated users can upload COC photos"
--   FOR INSERT TO authenticated  WITH CHECK (bucket_id = 'coc-photos')

-- "Anyone can view COC photos"
--   FOR SELECT TO public  USING (bucket_id = 'coc-photos')
```

The `20260310083442` DELETE policy *"Users can delete their own COC photos"* (`bucket_id = 'coc-photos' AND auth.uid()::text = (storage.foldername(name))[1]`, events-10:182) was **dropped** in 20260310085611 and replaced by (events-10:255):

```sql
-- "Authenticated users can delete own coc-photos"
--   FOR DELETE TO authenticated
--   USING (bucket_id = 'coc-photos'
--          AND ( has_role(auth.uid(),'Admin'::app_role)
--                OR has_role(auth.uid(),'User'::app_role)
--                OR auth.uid()::text = owner::text ))
```

20260310085611 also issued defensive `DROP POLICY IF EXISTS` for `"Authenticated users can delete coc-photos"` and `"Allow delete for authenticated users"` (events-10:240-253) — names that do not correspond to any policy created in the event log (no-ops, ⚠️ UNVERIFIED they ever existed).

**Effective storage.objects policy list:** 4 blanket (`Anyone can …`) + 3 coc-photos (`Authenticated users can upload COC photos`, `Anyone can view COC photos`, `Authenticated users can delete own coc-photos`) = **7 policies**. Because the blanket policies are permissive and have no bucket filter, the coc-photos policies are functionally redundant (the blanket policies already grant the same or broader access).

> The 2026-06-11 prod lockdown SQL filters `pg_policies` by `schemaname='public'` only (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:23`), so it does **not** touch any `storage.objects` policy above. The blanket anon storage access remains in effect post-lockdown.

---

## 5. Realtime publications / replica identity

| Change | Object | Detail | Citation |
|---|---|---|---|
| `REPLICA IDENTITY FULL` | `floor_plan_pins` | `ALTER TABLE floor_plan_pins REPLICA IDENTITY FULL` — emits full-row data in realtime change events. | events-06:155 (20251120103640) |

⚠️ UNVERIFIED — publication membership: the 20251120103640 migration's comment claims Supabase auto-adds `floor_plan_pins` to the `supabase_realtime` publication, but **no `ALTER PUBLICATION` statement exists** in any migration in the log (events-06:155). No other table has a recorded `REPLICA IDENTITY` change or explicit `ALTER PUBLICATION ... ADD TABLE`. Any other realtime-enabled tables were configured outside SQL migrations (e.g. Supabase dashboard) and cannot be confirmed from the event log.

`NOTIFY pgrst, 'reload schema'` is emitted at the end of `20260525120000_auth_events_audit.sql` (events-10:773) — this is a PostgREST schema-cache reload, not a realtime publication change.

---

## 6. Extensions

| Extension | Schema | Migration | Citation |
|---|---|---|---|
| `pgcrypto` | `extensions` | `CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions` — added to supply `crypt()`/`gen_salt()` for the one-off `temp_reset_password()` (which was itself dropped in the same migration; the extension is not dropped and remains). | events-09:131 (20260212144831) |

No other `CREATE EXTENSION` appears in the log. Functions using `gen_random_uuid()` / `gen_random_bytes()` (e.g. `api_clients.client_id DEFAULT encode(gen_random_bytes(16),'hex')`, events-08:6) rely on `pgcrypto`/`pgcrypto`-style functions that on Supabase are available by default; ⚠️ UNVERIFIED that any extension other than the explicit `pgcrypto` above is enabled (Supabase enables several by default outside migrations).

---

## 7. Cross-references

- Full trigger-function bodies, RLS write boundaries, and SECURITY DEFINER RPCs: see `03-auth-and-access/` and the `rls-policies-*.md` files in this directory.
- Table column definitions for every table named here: see `tables-01.md` … `tables-06.md`.
