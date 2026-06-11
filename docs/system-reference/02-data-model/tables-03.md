# Data Model — Tables (batch 03)

Effective-schema reference for: `inspections`, `issue_reports`, `notifications`, `offline_photos`, `pdf_report_templates`, `pending_user_invites`, `profiles`, `auth_events`, `coc_compliance_photos`, `coc_local_validations`, `contractor_coc_uploads`, `inspection_relink_audit`.

Method: effective state computed by replaying the chronological DDL event log (`docs/system-reference/_work/migration-events-01.json` … `-10.json`) in order — later events override earlier ones — then applying the out-of-band production SQL `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` (applied to prod 2026-06-11 via the dashboard, AFTER all migrations). types.ts cross-checked against `src/integrations/supabase/types.ts` (generated from the live DB).

Policy *names* are listed only; policy bodies are documented in the RLS reference (`02-data-model/rls-policies-01.md`).

**Tier-2 anon-read lockdown impact (this batch).** The 2026-06-11 prod SQL scans all `public` tables and drops every anon/public `FOR SELECT … USING(true)` policy, replacing it with `auth_read_<table>` (`FOR SELECT TO authenticated USING (true)`), excluding only `settings`. Two tables in this batch carried a matching anon SELECT policy and are therefore affected:
- `inspections` — `Public can view inspections` (no `TO` → public, `USING(true)`) → dropped, replaced by `auth_read_inspections`.
- `contractor_coc_uploads` — `allow read` (no `TO` → public, `USING(true)`) → dropped, replaced by `auth_read_contractor_coc_uploads`.
Citation: `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:22-39`.

---

## inspections

**Purpose.** Core record of a compliance inspection / on-site report. Holds template-driven form payload in `json_data`, links to a `site` (and optionally a `subsection`), and carries Firebase-migration provenance (`firebase_id`, `shop_number`). Read/written throughout the app — representative call site `src/components/ComprehensiveInspectionReport.tsx:120` (`supabase.from('inspections').select(...)`); 64 `from('inspections')` call sites across `src`.

**Created:** `20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| site_id | uuid | NOT NULL | — | public.sites(id) ON DELETE CASCADE |
| title | text | NOT NULL | — | — |
| description | text | nullable | — | — |
| status | text | NOT NULL | `'Pending'` | — |
| inspection_date | date | nullable | — | — |
| inspector_id | uuid | nullable | — | auth.users(id) (no ON DELETE → NO ACTION) |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| priority | text | nullable | `'Medium'` | — |
| end_date | date | nullable | — | — |
| assigned_to | text[] | nullable | — | — |
| subsection_id | uuid | nullable | — | public.subsections(id) ON DELETE CASCADE |
| project_name | text | nullable | — | — |
| shop_number | text | nullable | — | — |
| shop_name | text | nullable | — | — |
| inspector_name | text | nullable | — | — |
| client_rep | text | nullable | — | — |
| consultant | text | nullable | — | — |
| contractor | text | nullable | — | — |
| testing_party | text | nullable | — | — |
| location | text | nullable | — | — |
| qr_code_url | text | nullable | — | — |
| firebase_id | text | nullable | — | — (not unique) |
| json_data | jsonb | nullable | `'{}'::jsonb` | — |
| template_id | uuid | nullable | — | public.inspection_templates(id) (no ON DELETE → NO ACTION) |
| quality_rating | integer | nullable | — | — |

Column citations: base table `20251014114352…sql`; `priority`/`end_date`/`assigned_to` `20251014120619…sql`; `subsection_id` `20251014123510…sql`; `project_name`…`qr_code_url` `20251014132137…sql`; `firebase_id` `20251014142244…sql`; `json_data`/`template_id` `20251015023536…sql`; `quality_rating` `20251016084545…sql`.

### Constraints, indexes, unique keys
- PK: `id`.
- CHECK: `quality_rating >= 1 AND quality_rating <= 5` (`20251016084545…sql`).
- Indexes: `idx_inspections_inspection_date(inspection_date)`, `idx_inspections_end_date(end_date)` (`20251014120619…sql`); `idx_inspections_subsection_id(subsection_id)` (`20251014123510…sql`); `idx_inspections_firebase_id(firebase_id)` (`20251014142244…sql`); `idx_inspections_template_id(template_id)` btree and `idx_inspections_json_data(json_data)` GIN (`20251015023536…sql`); partial `idx_inspections_site_subsection_null ON (site_id) WHERE subsection_id IS NULL` (`20260519045946…sql`).
- No UNIQUE constraint beyond the PK.

### RLS
Enabled: **yes** (`20251014114352…sql`). Effective policy names (after replay + tier-2 lockdown):
- `Admins can manage all inspections` (ALL) — `20251120110544…sql`
- `Users can manage all inspections` (ALL) — `20251120111033…sql`
- `Clients can view inspections for their sites` (SELECT) — `20251120110544…sql`
- `Contractors can view inspections for assigned sites` (SELECT) — `20251120110544…sql`
- `Contractors can update inspections for assigned sites` (UPDATE) — `20260219090420…sql`
- `Contractors can insert inspections for assigned sites` (INSERT) — `20260219090420…sql`
- `auth_read_inspections` (SELECT TO authenticated USING(true)) — created by tier-2 prod SQL, replacing the dropped `Public can view inspections`.

Earlier policy generations dropped during replay: the four original `Authenticated users can …` policies, `Clients can view their inspections`, `Contractors can view/update inspections for their sites`, the blanket `All authenticated users full access to inspections`, and `Public can view inspections` (the last dropped by the tier-2 SQL).

### Triggers
- `update_inspections_updated_at` — BEFORE UPDATE, `EXECUTE FUNCTION public.update_updated_at_column()` (`20251014114352…sql`; dropped + recreated in `20251014114445…sql`).
- `trg_inspections_auto_link_subsection` — BEFORE INSERT OR UPDATE OF `json_data`, `subsection_id`, `EXECUTE FUNCTION public.inspections_auto_link_subsection()` (`20260519045946…sql`).

### types.ts cross-check
`src/integrations/supabase/types.ts:1449`. Row enumerates all 27 migration columns with matching nullability, plus one extra: **`deleted_at: string | null`**.
⚠️ **DISCREPANCY (types.ts vs migrations)** — `inspections.deleted_at` appears in types.ts but is created by no migration in `supabase/migrations/` (grep for `deleted_at` returns zero hits in that directory). Either added out-of-band on the live DB, or stale generated types. Relationships block lists only `site_id`→sites, `subsection_id`→subsections, `template_id`→inspection_templates (the `inspector_id`→auth.users FK is omitted, as types.ts conventionally omits auth.users FKs).

### Notable history
- Write-side RLS evolved through several generations (blanket authenticated → role-scoped → Admin/User/Client/Contractor split). See policy list above.
- One-time data fixes to `json_data`: numeric→string key normalization backfill via `normalize_inspection_json_data()` (`20251112021952…sql`); two single-row photo-array clears on inspection `d4b630cf-…` (`20260108121126…sql`, `20260108121329…sql`).
- One-time orphan relink + `firebase_id` backfill DO-block: mutates `inspections.subsection_id`, backfills `subsections.firebase_id`, and inserts `inspection_relink_audit` rows (`20260519045946…sql`).
- No column drops or renames.

---

## issue_reports

**Purpose.** In-app bug/issue reports submitted by users, with admin triage + AI-assisted fix-verification fields. Read/written by the issue-reporting UI — representative call site `src/components/IssueReportDialog.tsx:76` (`supabase.from('issue_reports')…`); 11 call sites across `src`.

**Created:** `20251018005315_1d30c9c7-745a-4860-b1b1-f281dc276ae7.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| reported_by | uuid | nullable | — | auth.users(id) ON DELETE SET NULL |
| user_email | text | NOT NULL | — | — |
| user_name | text | nullable | — | — |
| description | text | NOT NULL | — | — |
| severity | text | NOT NULL | `'medium'` | — |
| category | text | NOT NULL | `'general'` | — |
| status | text | NOT NULL | `'new'` | — |
| screenshot_url | text | nullable | — | — |
| page_url | text | NOT NULL | — | — |
| browser_info | jsonb | nullable | `'{}'::jsonb` | — |
| resolved_at | timestamptz | nullable | — | — |
| resolved_by | uuid | nullable | — | auth.users(id) ON DELETE SET NULL |
| admin_notes | text | nullable | — | — |
| needs_user_verification | boolean | nullable | false | — |
| verification_status | text | nullable | `'pending'` | — |
| verified_at | timestamptz | nullable | — | — |
| verified_by | uuid | nullable | — | auth.users(id) |
| rejection_reason | text | nullable | — | — |
| rejection_screenshot_url | text | nullable | — | — |
| fix_description | text | nullable | — | — |
| fix_test_result | jsonb | nullable | — | — |
| fix_test_run_at | timestamptz | nullable | — | — |
| fix_confidence_score | integer | nullable | — | — |

Column citations: base table `20251018005315…sql`; verification columns (`needs_user_verification`…`rejection_screenshot_url`) `20251107084904…sql`; fix columns (`fix_description`…`fix_confidence_score`) `20260107120703…sql`.

### Constraints, indexes, unique keys
- PK: `id`. No CHECK constraints, no secondary indexes, no UNIQUE keys created in any migration.

### RLS
Enabled: **yes** (`20251018005315…sql`). Policy names:
- `Users can create their own issue reports` (INSERT)
- `Users can view their own issue reports` (SELECT)
- `Admins can view all issue reports` (SELECT)
- `Admins can update issue reports` (UPDATE)
- `Admins can delete issue reports` (DELETE)

(Not affected by the tier-2 lockdown — no anon/public `USING(true)` SELECT policy.)

### Triggers
- `update_issue_reports_updated_at` — BEFORE UPDATE, `EXECUTE FUNCTION public.update_updated_at_column()` (`20251018005315…sql`).

### types.ts cross-check
`src/integrations/supabase/types.ts:1744`. All 26 columns present with matching nullability. `Relationships: []` (auth.users FKs omitted by convention). **No discrepancy.**

### Notable history
Three additive column waves (base, verification, AI-fix); no drops/renames/backfills.

---

## notifications

**Purpose.** Per-user in-app notifications (primarily "issue resolved"). Read by the notification listener and written when an issue is resolved — representative call site `src/components/NotificationListener.tsx:28` (`supabase.from('notifications')…`); insert at `src/views/IssueReports.tsx:181`.

**Created:** `20251030071546_f84d79c3-3466-4537-9303-247210557c2a.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| user_id | uuid | NOT NULL | — | none (no FK — value is an auth user id but unconstrained) |
| issue_report_id | uuid | nullable | — | public.issue_reports(id) ON DELETE CASCADE |
| message | text | NOT NULL | — | — |
| read | boolean | nullable | false | — |
| created_at | timestamptz | nullable | now() | — |
| type | text | nullable | `'issue_resolved'` | — |

Citation: migration `20251030071546…sql` (CREATE TABLE detail).

### Constraints, indexes, unique keys
- PK: `id`.
- Index: `idx_notifications_user_id_read ON (user_id, read)` (`20251030071546…sql`).
- No CHECK or UNIQUE beyond the PK.

### RLS
Enabled: **yes** (`20251030071546…sql`). Policy names:
- `Users can view their own notifications` (SELECT)
- `Users can update their own notifications` (UPDATE)
- `Authenticated users can insert notifications` (INSERT, `WITH CHECK (true)` — any authenticated user may insert a notification for any `user_id`; the SQL comment says "Admins" but the policy does not check role)

(Not affected by the tier-2 lockdown — the INSERT policy uses `WITH CHECK(true)`, not a SELECT `USING(true)`.)

### Triggers
None attached.

### types.ts cross-check
`src/integrations/supabase/types.ts:1831`. Row columns `created_at, id, issue_report_id, message, read, type, user_id` with matching nullability (`created_at`, `read`, `type`, `issue_report_id` nullable). Relationships list `issue_report_id`→issue_reports. **No discrepancy.**

### Notable history
Single migration; no renames/drops/backfills.

---

## offline_photos

**Purpose.** Generic photo records for non-COC contexts (offline-capture queue). `context_type`/`context_id` polymorphically reference a subsection, site, or inspection. Read/written by the offline-photo hook — representative call site `src/hooks/useOfflinePhotos.ts:257` (`supabase.from('offline_photos')…`); delete at `:318`.

**Created:** `20260310085611_954679cb-a199-4078-b21b-79f70f49edfa.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| context_type | text | NOT NULL | — | — |
| context_id | uuid | NOT NULL | — | none (polymorphic; no FK) |
| secondary_context_id | uuid | nullable | — | none (no FK) |
| photo_type | text | NOT NULL | — | — |
| storage_path | text | NOT NULL | — | — |
| file_name | text | NOT NULL | — | — |
| file_size | bigint | NOT NULL | — | — |
| mime_type | text | NOT NULL | — | — |
| captured_at | timestamptz | NOT NULL | now() | — |
| captured_by | uuid | NOT NULL | — | none (no FK — value is an auth user id but unconstrained) |
| latitude | numeric | nullable | — | — |
| longitude | numeric | nullable | — | — |
| notes | text | nullable | — | — |
| created_at | timestamptz | NOT NULL | now() | — |

Citation: migration `20260310085611…sql` (CREATE TABLE detail; "no FK constraints on context columns").

### Constraints, indexes, unique keys
- PK: `id`. No CHECK, no secondary indexes, no UNIQUE beyond the PK created in any migration.

### RLS
Enabled: **yes** (`20260310085611…sql`). Effective policy name (after replay):
- `All authenticated users full access (offline_photos)` (ALL TO authenticated, `USING(true) WITH CHECK(true)`) — `20260406131029…sql`.

Dropped during replay: the four original role-scoped policies (`Admins can manage all offline photos`, `Users can manage all offline photos`, `Users can manage their own offline photos`, `Contractors can view offline photos for assigned sites`), collapsed into the single blanket policy above (`20260406131029…sql`). (Not affected by tier-2 lockdown — its SELECT path is the ALL policy with `qual=true` but `TO authenticated`, not public/anon.)

### Triggers
None attached.

### types.ts cross-check
`src/integrations/supabase/types.ts:1869`. All 15 columns present with matching nullability. `Relationships: []` (consistent with no DB-level FKs). **No discrepancy.**

### Notable history
Created with role-scoped RLS; policies collapsed to blanket authenticated access in `20260406131029…sql`. No column drops/renames/backfills.

---

## pdf_report_templates

**Purpose.** Stores PDF report layout templates (one default per `report_type`); `customization` and `sections` hold the rendering config as JSONB. Managed by the PDF template UI — representative call site `src/components/settings/PDFTemplateManager.tsx:563` (`supabase.from("pdf_report_templates")…`); 9 call sites.

**Created:** `20260110132516_9c4acf95-e674-4d32-a18d-668b0add0770.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| name | text | NOT NULL | — | — |
| report_type | text | NOT NULL | — | — (no CHECK; inline comment enumerates `site_summary`/`inspection`/`floor_plan`/`asset_verification`/`compliance` but nothing enforces it) |
| description | text | nullable | — | — |
| is_default | boolean | nullable | false | — |
| customization | jsonb | NOT NULL | `'{}'::jsonb` | — |
| sections | jsonb | NOT NULL | `'[]'::jsonb` | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| created_by | uuid | nullable | — | auth.users(id) (no ON DELETE → NO ACTION) |

Citation: migration `20260110132516…sql` (CREATE TABLE detail).

### Constraints, indexes, unique keys
- PK: `id`.
- Partial UNIQUE index: `idx_pdf_templates_default_per_type ON (report_type) WHERE is_default = true` — at most one default template per report_type (`20260110132516…sql`).
- No CHECK constraints.

### RLS
Enabled: **yes** (`20260110132516…sql`). Policy names:
- `Admins can manage PDF templates` (ALL, `USING has_role(…, 'Admin')`, no WITH CHECK)
- `Authenticated users can view PDF templates` (SELECT, `USING auth.uid() IS NOT NULL`)

(Not affected by tier-2 lockdown — the SELECT policy's `qual` is `auth.uid() IS NOT NULL`, not the literal `true`.)

### Triggers
- `update_pdf_report_templates_updated_at` — BEFORE UPDATE, `EXECUTE FUNCTION public.update_updated_at_column()` (`20260110132516…sql`).

### types.ts cross-check
`src/integrations/supabase/types.ts:1977`. All 10 columns present; `customization` and `sections` typed `Json` (NOT NULL — matches). `Relationships: []`. **No discrepancy.**

### Notable history
- 5 default seed rows inserted at creation (one per report_type), each with full `customization`/`sections` JSONB (`20260110132516…sql`).
- Three idempotent JSONB section-append updates to existing `site_summary` templates: `asset-verification` KPI (`20260119123152…sql`), `fortress-checklist` table + `documents-summary` table (`20260120073408…sql`).
- No column drops/renames.

---

## pending_user_invites

**Purpose.** Tracks pending user invites carried over from the Firebase migration (email-harvesting-sensitive; auto-pruned after 30 days). Read/written by the Users admin view — representative call site `src/views/Users.tsx:120` (`supabase.from("pending_user_invites")…`); 2 call sites.

**Created:** `20251014164357_37295947-5f1a-4fb6-aa2f-b81d8cf4144d.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| firebase_id | text | nullable | — | — |
| email | text | NOT NULL | — | UNIQUE |
| full_name | text | nullable | — | — |
| invited_at | timestamptz | nullable | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

Citation: migration `20251014164357…sql` (CREATE TABLE detail).

### Constraints, indexes, unique keys
- PK: `id`.
- UNIQUE: `email`.
- Index: `idx_pending_invites_created_at ON (created_at)` — for cleanup queries (`20251017095131…sql`).

### RLS
Enabled: **yes** (`20251014164357…sql`). Policy names (all `TO authenticated`, `has_role(…, 'Admin')`):
- `Admins can view pending invites` (SELECT)
- `Admins can insert pending invites` (INSERT)
- `Admins can update pending invites` (UPDATE)
- `Admins can delete pending invites` (DELETE)

(Not affected by tier-2 lockdown.)

### Triggers
- `update_pending_user_invites_updated_at` — BEFORE UPDATE, `EXECUTE FUNCTION public.update_updated_at_column()` (`20251014164357…sql`).

### Notable history
- Companion SECURITY DEFINER function `cleanup_old_pending_invites()` deletes rows older than 30 days and logs to `activity_logs` (`20251017095131…sql`); the `created_at` index was added in the same migration.
- No column drops/renames.

---

## profiles

**Purpose.** Per-user profile (1:1 with `auth.users`), seeded on signup by the `handle_new_user()` trigger function. Holds display/contact fields and the onboarding gate. Read widely — representative call site `src/components/ClientPortalLayout.tsx:54` (`supabase.from("profiles")…`); 22 call sites.

**Created:** `20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | — | PRIMARY KEY; auth.users(id) ON DELETE CASCADE (constraint `profiles_id_fkey`) |
| email | text | NOT NULL | — | — |
| full_name | text | nullable | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| status | text | nullable | `'Active'` | — |
| phone | text | nullable | — | — |
| job_title | text | nullable | — | — |
| department | text | nullable | — | — |
| company | text | nullable | — | — |
| address | text | nullable | — | — |
| city | text | nullable | — | — |
| country | text | nullable | — | — |
| postal_code | text | nullable | — | — |
| bio | text | nullable | — | — |
| avatar_url | text | nullable | — | — |
| onboarding_completed | boolean | nullable | false | — |

Column citations: base table (`id`, `email`, `full_name`, `created_at`, `updated_at`) `20251014114352…sql`; `status` `20251014120311…sql`; `phone`…`avatar_url` `20251015010134…sql`; `onboarding_completed` `20260214023114…sql`. The `profiles_id_fkey` (id→auth.users ON DELETE CASCADE) re-declared conditionally in `20251020093858…sql`.

### Constraints, indexes, unique keys
- PK: `id` (also FK to auth.users).
- No CHECK, no secondary indexes, no additional UNIQUE keys created in any migration.

### RLS
Enabled: **yes** (`20251014114352…sql`). Effective policy names (after replay):
- `Users can update their own profile` (UPDATE) — base migration
- `Users can insert their own profile` (INSERT) — base migration
- `Users can view their own profile` (SELECT) — `20251016064350…sql`
- `Admins can view all profiles` (SELECT) — `20251016064350…sql`
- `Contractors can view their own profile` (SELECT) — `20251119090820…sql`

Dropped during replay: original `Users can view all profiles` (public `USING(true)`, dropped `20251016035546…sql`) and the interim `Authenticated users can view profiles` (dropped `20251016064350…sql`). (Not affected by tier-2 lockdown — the public read policy was already removed pre-2026.)

### Triggers
- `update_profiles_updated_at` — BEFORE UPDATE, `EXECUTE FUNCTION public.update_updated_at_column()` (`20251014114352…sql`; dropped + recreated `20251014114445…sql`).

Note: rows are *populated* by `handle_new_user()` (SECURITY DEFINER), a trigger attached to `auth.users` (not to `profiles`) — `20251020093607…sql`, later updated `20260214023114…sql` so new signups default to the `User` role (only the first `auth.users` row gets `Admin`).

### types.ts cross-check
`src/integrations/supabase/types.ts:2046`. All 17 columns present with matching nullability. `Relationships: []` (auth.users FK omitted by convention). **No discrepancy.**

### Notable history
- One-time backfill: `UPDATE profiles SET onboarding_completed = true WHERE onboarding_completed = false OR IS NULL` — grandfathers existing users past the new onboarding gate (`20260214023532…sql`).
- No column drops/renames.

---

## public.auth_events

**Purpose.** POPIA §16/§24 authentication-audit trail (login, logout, password/MFA changes, account deletion, etc.). Written by service-role only via edge functions — `supabase/functions/log-auth-event/index.ts:146` (`supabase.from('auth_events').insert(...)`), also `supabase/functions/invite-user/index.ts:258` and `supabase/functions/delete-user/index.ts`. Client helper: `src/lib/auth-audit.ts` (`recordAuthEvent`, line 87) which calls the edge function rather than the table directly.

**Created:** `20260525120000_auth_events_audit.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| user_id | uuid | nullable | — | none — intentionally NO FK to auth.users so audit rows survive user deletion |
| event_type | text | NOT NULL | — | — (CHECK; see below) |
| ip_address | inet | nullable | — | — |
| user_agent | text | nullable | — | — |
| metadata | jsonb | NOT NULL | `'{}'` | — |
| occurred_at | timestamptz | NOT NULL | now() | — |

Citation: migration `20260525120000_auth_events_audit.sql` (CREATE TABLE detail).

### Constraints, indexes, unique keys
- PK: `id`.
- CHECK `auth_events_event_type_check`: `event_type IN ('login','logout','password_changed','password_reset_requested','magic_link_requested','lockout','mfa_enrolled','mfa_unenrolled','account_deleted','account_email_changed','user_created')` (11-value whitelist).
- Indexes: `idx_auth_events_user_id(user_id)`, `idx_auth_events_event_type(event_type)`, `idx_auth_events_occurred_at(occurred_at DESC)`.
- No UNIQUE beyond the PK.

### RLS
Enabled: **yes** (`20260525120000…sql`). Policy names:
- `auth_events: user reads own` (SELECT TO authenticated, `USING user_id = auth.uid()`).

**No INSERT/UPDATE/DELETE policy exists by design** — only service-role (which bypasses RLS) can write. (Not affected by tier-2 lockdown — its only SELECT policy is `user_id = auth.uid()`, not public `USING(true)`.)

### Triggers
None attached.

### types.ts cross-check
⚠️ **DISCREPANCY (types.ts vs migrations)** — `auth_events` is **absent from `src/integrations/supabase/types.ts`** entirely (grep for `auth_events:` returns no match). The table exists in migrations (and is written by edge functions) but the generated types were not regenerated to include it. App code that touches it uses untyped/`as any` paths or goes through edge functions.

### Notable history
- Migration also emits `NOTIFY pgrst, 'reload schema'` at the end to refresh the PostgREST cache (`20260525120000…sql`).
- The SELECT policy was declared with `DROP POLICY IF EXISTS` then `CREATE` (idempotent re-create). No column drops/renames/backfills.

---

## public.coc_compliance_photos

**Purpose.** Photo evidence attached to a subsection's COC (Certificate of Compliance) inspection, optionally linked to a parsed `coc_validation`. Read/written by the offline-photo hook — representative call site `src/hooks/useOfflinePhotos.ts:237` (`supabase.from('coc_compliance_photos')…`); delete at `:316`.

**Created:** `20260310083442_1b964afb-fbe3-4c55-9ad2-531d76c72522.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| subsection_id | uuid | NOT NULL | — | public.subsections(id) ON DELETE CASCADE |
| coc_validation_id | uuid | nullable | — | public.coc_validations(id) ON DELETE SET NULL |
| photo_type | text | NOT NULL | — | — |
| storage_path | text | NOT NULL | — | — |
| file_name | text | NOT NULL | — | — |
| file_size | bigint | NOT NULL | — | — |
| mime_type | text | NOT NULL | — | — |
| captured_at | timestamptz | NOT NULL | now() | — |
| captured_by | uuid | NOT NULL | — | auth.users(id) |
| latitude | numeric | nullable | — | — |
| longitude | numeric | nullable | — | — |
| notes | text | nullable | — | — |
| created_at | timestamptz | NOT NULL | now() | — |

Citation: migration `20260310083442…sql` (CREATE TABLE detail).

### Constraints, indexes, unique keys
- PK: `id`.
- Indexes: `idx_coc_photos_subsection(subsection_id)`, `idx_coc_photos_validation(coc_validation_id)`, `idx_coc_photos_captured_by(captured_by)` (`20260310083442…sql`).
- No CHECK or UNIQUE beyond the PK.

### RLS
Enabled: **yes** (`20260310083442…sql`). Effective policy name (after replay):
- `All authenticated users full access (coc_compliance_photos)` (ALL TO authenticated, `USING(true) WITH CHECK(true)`) — `20260406131029…sql`.

Dropped during replay: the four original role-scoped policies (`Admins can manage all COC photos`, `Users can manage all COC photos`, `Contractors can view COC photos for assigned sites`, `Users can manage their own COC photos`), collapsed into the single blanket policy above (`20260406131029…sql`). Note: those original policies passed role literals as bare text (`'Admin'`/`'User'`/`'Contractor'`) without `::app_role` cast — moot now that all four are dropped. (Not affected by tier-2 lockdown — the surviving ALL policy is `TO authenticated`.)

### Triggers
None attached.

### types.ts cross-check
`src/integrations/supabase/types.ts:373`. All 14 columns present with matching nullability. Relationships list `coc_validation_id`→coc_validations and `subsection_id`→subsections (the `captured_by`→auth.users FK is omitted by convention). **No discrepancy.**

### Notable history
Created with role-scoped RLS; policies collapsed to blanket authenticated access in `20260406131029…sql`. No column drops/renames/backfills.

---

## public.coc_local_validations

**Purpose.** On-device / locally-computed COC validation result records — electrical-installation test readings, fraud-risk scoring, and (via the Annexure-1 column set) full SANS/ECASA certificate form capture. ⚠️ UNVERIFIED runtime usage: no `from('coc_local_validations')` or other reference found outside `src/integrations/supabase/types.ts` (grep across `src/` and `supabase/functions/` returned only the generated-types definition and its FK metadata). The table exists and is RLS-protected but appears unreferenced by checked-in app code.

**Created:** `20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql` (base 36 columns); Annexure-1 column set (32 additional columns) added `20260310075810_564cfaa3-71b1-47c0-9b8f-e0dc9457d00d.sql`.

### Columns

68 columns total. Base set (`20260309172544…sql`):

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| site_id | uuid | nullable | — | public.sites(id) ON DELETE CASCADE |
| coc_reference_number | text | NOT NULL | — | — |
| certificate_type | text | NOT NULL | — | — |
| installation_address | text | NOT NULL | — | — |
| registered_person_name | text | NOT NULL | — | — |
| registration_number | text | NOT NULL | — | — |
| registration_category | text | NOT NULL | — | — |
| date_of_issue | date | NOT NULL | — | — |
| installation_type | text | NOT NULL | — | — |
| phase_configuration | text | NOT NULL | — | — |
| supply_voltage | numeric | NOT NULL | 230 | — |
| supply_frequency | numeric | NOT NULL | 50 | — |
| insulation_resistance | numeric | nullable | — | — |
| earth_loop_impedance | numeric | nullable | — | — |
| rcd_trip_time | numeric | nullable | — | — |
| rcd_rated_current | numeric | NOT NULL | 30 | — |
| pscc | numeric | nullable | — | — |
| earth_continuity | numeric | nullable | — | — |
| voltage_at_main_db | numeric | nullable | — | — |
| polarity_correct | boolean | NOT NULL | false | — |
| has_signature | boolean | NOT NULL | false | — |
| signature_date | date | nullable | — | — |
| has_solar_pv | boolean | NOT NULL | false | — |
| has_bess | boolean | NOT NULL | false | — |
| solar_grounding_verified | boolean | nullable | — | — |
| inverter_sync_verified | boolean | nullable | — | — |
| bess_fire_protection | boolean | nullable | — | — |
| spd_operational | boolean | nullable | — | — |
| afdd_installed | boolean | nullable | — | — |
| validation_status | text | NOT NULL | `'INVALID'` | — |
| fraud_risk_score | text | NOT NULL | `'LOW'` | — |
| validation_results_json | jsonb | nullable | `'{}'::jsonb` | — |
| created_by | uuid | nullable | — | auth.users(id) ON DELETE SET NULL |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

Annexure-1 additions (`20260310075810…sql`, all `ADD COLUMN IF NOT EXISTS`; only `form_type` is NOT NULL):

| name | type | null | default |
|---|---|---|---|
| form_type | text | NOT NULL | `'annexure1'` |
| form_data_json | jsonb | nullable | `'{}'::jsonb` |
| building_name | text | nullable | — |
| gps_coordinates | text | nullable | — |
| suburb_township | text | nullable | — |
| district_town_city | text | nullable | — |
| erf_lot_no | text | nullable | — |
| registered_person_id_number | text | nullable | — |
| regulation_type | text | nullable | — |
| registered_person_reg_date | text | nullable | — |
| supply_system_type | text | nullable | `'TN-S'` |
| installation_permanent | boolean | nullable | true |
| phase_rotation | text | nullable | — |
| main_switch_type | text | nullable | — |
| number_of_poles | integer | nullable | — |
| current_rating_a | numeric | nullable | — |
| short_circuit_withstand_ka | numeric | nullable | — |
| neutral_loop_impedance_ohm | numeric | nullable | — |
| elevated_voltage_v | numeric | nullable | — |
| voltage_no_load_r | numeric | nullable | — |
| voltage_no_load_y | numeric | nullable | — |
| voltage_no_load_b | numeric | nullable | — |
| voltage_full_load_r | numeric | nullable | — |
| voltage_full_load_y | numeric | nullable | — |
| voltage_full_load_b | numeric | nullable | — |
| continuity_of_bonding | text | nullable | — |
| continuity_ring_circuits | text | nullable | — |
| earth_leakage_test_button | boolean | nullable | — |
| phase_rotation_correct | boolean | nullable | — |
| switching_devices_correct | boolean | nullable | — |
| comments | text | nullable | — |
| db_supply_name | text | nullable | — |

### Constraints, indexes, unique keys
- PK: `id`. No CHECK, no secondary indexes, no UNIQUE beyond the PK created in any migration.

### RLS
Enabled: **yes** (`20260309172544…sql`). Policy names (all `TO authenticated`):
- `Admins can manage all COC local validations` (ALL)
- `Users can manage all COC local validations` (ALL)
- `Contractors can view COC local validations for assigned sites` (SELECT)
- `Users can view own COC local validations` (SELECT, `created_by = auth.uid()`)

(Not affected by tier-2 lockdown — no anon/public `USING(true)` SELECT policy.)

### Triggers
- `update_coc_local_validations_updated_at` — BEFORE UPDATE, `EXECUTE FUNCTION public.update_updated_at_column()` (`20260309172544…sql`).

### types.ts cross-check
`src/integrations/supabase/types.ts:547`. All 68 columns present with matching nullability (base 36 + Annexure-1 32). Relationships list `site_id`→sites (created_by→auth.users omitted by convention). **No discrepancy.**

### Notable history
Two additive waves (base + Annexure-1). No column drops/renames/backfills.

---

## public.contractor_coc_uploads

**Purpose.** Contractor-submitted COC document uploads, keyed by free-text `project_id` + `section_name`. ⚠️ UNVERIFIED runtime usage: no `from('contractor_coc_uploads')` or other reference found outside `src/integrations/supabase/types.ts` (grep across `src/` and `supabase/functions/`). The table exists and is RLS-protected but appears unreferenced by checked-in app code.

**Created:** `20260410013045_e3990969-d3ba-4378-94ca-bfa2e8d541b3.sql` (`CREATE TABLE IF NOT EXISTS`, unqualified → public schema).

### Columns (per migration)

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| project_id | text | NOT NULL | — | — |
| section_name | text | NOT NULL | — | — |
| file_url | text | NOT NULL | — | — |
| file_name | text | nullable | — | — |
| contractor_email | text | nullable | — | — |
| notes | text | nullable | — | — |
| status | text | NOT NULL | `'submitted'` | — |
| submitted_at | timestamptz | nullable | now() | — |

Citation: migration `20260410013045…sql:12-22` (CREATE TABLE body — exactly these 9 columns).

### Constraints, indexes, unique keys
- PK: `id`. No CHECK, no secondary indexes, no UNIQUE beyond the PK created in any migration.

### RLS
Enabled: **yes** (`20260410013045…sql:24`). Effective policy names (after replay + tier-2 lockdown):
- `allow insert` (INSERT, no `TO` → PUBLIC incl. anon, `WITH CHECK(true)`)
- `allow update` (UPDATE, no `TO` → PUBLIC incl. anon, `USING(true)`, **no WITH CHECK**)
- `auth_read_contractor_coc_uploads` (SELECT TO authenticated `USING(true)`) — created by the tier-2 prod SQL, replacing the dropped `allow read`.

Dropped by the tier-2 prod SQL: `allow read` (`FOR SELECT` no `TO` → public, `USING(true)`) — citation `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:22-39`. **Note:** the INSERT and UPDATE policies remain PUBLIC (anon can still insert/update); the lockdown closed the *read* side only.

### Triggers
None attached.

### types.ts cross-check
`src/integrations/supabase/types.ts:966`. Row enumerates the 9 migration columns **plus three extra**: `legend_card_id: string | null`, `site_id: string | null`, `subsection_id: string | null`.
⚠️ **DISCREPANCY (types.ts vs migrations)** — `legend_card_id`, `site_id`, `subsection_id` appear in types.ts but are created by no migration in `supabase/migrations/` (the CREATE TABLE body at `20260410013045…sql:12-22` contains only the 9 columns; no `ALTER TABLE contractor_coc_uploads ADD COLUMN` exists in any migration). Added out-of-band on the live DB, or stale generated types. types.ts `Relationships: []` (no FK metadata for the extra columns).

### Notable history
Same migration also added six columns to `snags` (`project_id`, `attachment_urls`, `closeout_photo_url`, `sign_off_requested_at`, `signed_off_by`, `signed_off_at`) — out of scope here. No column drops/renames on this table within migrations.

---

## public.inspection_relink_audit

**Purpose.** Audit log of automatic inspection↔subsection relink attempts (orphan-recovery during the Firebase migration). Rows are written by the `inspections_auto_link_subsection()` BEFORE-trigger path and the one-time backfill DO-block — not by application code. ⚠️ UNVERIFIED runtime usage: no `from('inspection_relink_audit')` or other reference found outside `src/integrations/supabase/types.ts` (grep across `src/` and `supabase/functions/`).

**Created:** `20260519045946_ff0d3334-68ec-431a-b213-6a5bc51b25f1.sql` (`CREATE TABLE IF NOT EXISTS`).

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| inspection_id | uuid | NOT NULL | — | none (no FK) |
| site_id | uuid | nullable | — | none (no FK) |
| attempted_shop_number | text | nullable | — | — |
| attempted_firebase_key | text | nullable | — | — |
| match_count | integer | NOT NULL | 0 | — |
| resolution | text | NOT NULL | — | — |
| resolved_subsection_id | uuid | nullable | — | none (no FK) |
| created_at | timestamptz | NOT NULL | now() | — |

Citation: migration `20260519045946…sql` (CREATE TABLE detail; "No FK constraints").

### Constraints, indexes, unique keys
- PK: `id`. No CHECK, no secondary indexes, no UNIQUE beyond the PK created in any migration.

### RLS
Enabled: **yes** (`20260519045946…sql`). Policy names (both declared `DROP … IF EXISTS` then `CREATE`; no `TO` role → default PUBLIC):
- `Admins view relink audit` (SELECT, `USING has_role(auth.uid(), 'Admin'::app_role)`)
- `Service inserts relink audit` (INSERT, `WITH CHECK(true)` — permits service-role and trigger writes)

(Not affected by tier-2 lockdown — the SELECT policy's `qual` is the `has_role(...)` expression, not the literal `true`.)

### Triggers
None attached to this table. (Its rows are written *by* the `trg_inspections_auto_link_subsection` trigger on `inspections`, and by the one-time backfill.)

### types.ts cross-check
`src/integrations/supabase/types.ts:1250`. All 9 columns present with matching nullability. `Relationships: []` (consistent with no DB-level FKs). **No discrepancy.**

### Notable history
- One-time backfill (same migration): the orphan-relink DO-block inserts audit rows with `resolution ∈ {'auto_relinked','multiple_matches','no_match'}` while mutating `inspections.subsection_id` and `subsections.firebase_id` (`20260519045946…sql`).
- No column drops/renames.

---

## Dropped tables

None of the twelve tables in this batch were dropped. Every table's event history is create/enable/alter-only; no `DROP TABLE` or `ALTER … RENAME` event exists for any of them across batches 01–10.
