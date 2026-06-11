# Effective-schema reference: tables (batch 01)

Scope: `access_link_visitors`, `activity_logs`, `api_access_tokens`, `api_clients`, `api_request_logs`, `auth_events`, `calendar_events`, `client_access_links`, `clients`, `coc_compliance_photos`, `coc_extractions`, `coc_local_validations`.

Method: effective state = replay of all migration DDL events in chronological order, then the dashboard-applied `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` (applied AFTER all migrations). Policy bodies are documented elsewhere; only policy NAMES are listed here. Column types/nullability cross-checked against `src/integrations/supabase/types.ts` (generated from the live DB).

Notes that apply broadly:
- `update_updated_at_column()` is a `BEFORE UPDATE` trigger fn defined in `20251014114352` and recreated `SECURITY DEFINER SET search_path = public` in `20251014114445`.
- The tier-2 prod SQL (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:18-41`) scans ALL public tables, drops every `cmd='SELECT' qual='true'` policy whose roles are `{public}` or include `anon` (excluding `settings`), and replaces each affected table's set with one policy `auth_read_<table>` = `FOR SELECT TO authenticated USING (true)`. Tables below that had such a policy at end-of-migrations: `clients`, `client_access_links`, `coc_extractions`.

---

## access_link_visitors

**Purpose.** Visitor lead-capture / access log for client magic-link pages — a row is inserted (incl. anonymously) each time someone registers to view a shared link. Call site: `src/components/VisitorRegistrationGate.tsx:89` (`supabase.from("access_link_visitors").insert({...})`). Created `20260217082506_a2247d71-37f4-49d4-bb28-fbb9724692fd.sql`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| access_link_id | uuid | yes | — | → client_access_links(id) ON DELETE CASCADE |
| first_name | text | no | — | |
| last_name | text | no | — | |
| email | text | no | — | |
| phone | text | no | — | |
| role | text | no | — | |
| accessed_at | timestamptz | no | now() | |
| ip_address | text | yes | — | |
| user_agent | text | yes | — | |

- Constraints: PK on `id`. FK `access_link_visitors_access_link_id_fkey`.
- Indexes: `idx_access_link_visitors_link_id` (access_link_id), `idx_access_link_visitors_email` (email).
- RLS: **enabled**. Policies: `Anyone can register as visitor` (INSERT, public/anon), `Admins can view visitors` (SELECT, gated by `has_role(...,'Admin')`).
- Triggers: none.
- types.ts cross-check (`src/integrations/supabase/types.ts:17-63`): consistent. No discrepancy.
- Not affected by tier-2 SQL (no anon/public `USING(true)` SELECT policy).

---

## activity_logs

**Purpose.** Dashboard "recent activity" feed (auto-trimmed to the 20 most recent rows). Call site: `src/views/Dashboard.tsx:118` (`supabase.from("activity_logs").select("*").order("created_at",...).limit(5)`). Created `20251014132137_627a24bc-ffbf-499d-bd22-96df6a7f3bfc.sql`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| user_email | text | no | — | |
| action | text | no | — | |
| details | text | yes | — | |
| created_at | timestamptz | yes | now() | |
| user_id | uuid | yes | — | → auth.users(id) ON DELETE SET NULL |

- `user_id` added `20251016035250`; FK `activity_logs_user_id_fkey` (ON DELETE SET NULL) added conditionally `20251020093858`.
- Constraints: PK on `id`. FK as above.
- Indexes: `idx_activity_logs_user_id` (user_id) — `20251016035250`.
- RLS: **enabled**. Effective policies: `Users can view their own activity logs` (SELECT), `Admins can view all activity logs` (SELECT), `Users can insert their own activity logs` (INSERT), `Contractors can view their own activity logs` (SELECT, `20251119090820`). The original `Authenticated users can view/insert activity logs` policies were dropped `20251016035250`.
- Triggers: `trigger_cleanup_activity_logs` — `AFTER INSERT ... FOR EACH STATEMENT EXECUTE FUNCTION cleanup_activity_logs()` (`20251020070622`), which deletes all but the 20 newest rows.
- types.ts cross-check (`src/integrations/supabase/types.ts:64-90`): consistent. No discrepancy.
- Not affected by tier-2 SQL.

---

## api_access_tokens

**Purpose.** OAuth2 access/refresh tokens for external API clients; validated server-side. Call sites: `supabase/functions/oauth-token/index.ts:52`, `supabase/functions/api-reports/index.ts:19` (`.from("api_access_tokens")`). Created `20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| client_id | uuid | no | — | → api_clients(id) ON DELETE CASCADE |
| access_token | text | no | encode(gen_random_bytes(32),'hex') | UNIQUE |
| refresh_token | text | yes | encode(gen_random_bytes(32),'hex') | UNIQUE |
| scopes | text[] | yes | ARRAY['reports:read'] | |
| expires_at | timestamptz | no | now() + interval '1 hour' | |
| refresh_expires_at | timestamptz | yes | now() + interval '30 days' | |
| created_at | timestamptz | yes | now() | |
| last_used_at | timestamptz | yes | — | |

- Constraints: PK on `id`; UNIQUE on `access_token` and on `refresh_token`. FK `api_access_tokens_client_id_fkey`.
- Indexes: `idx_api_access_tokens_token` (access_token), `idx_api_access_tokens_expires` (expires_at). (UNIQUE columns also imply unique indexes.)
- RLS: **enabled**. Policy: `Service role manages tokens` (FOR ALL TO service_role). No anon/authenticated policy — only service-role can touch tokens.
- Triggers: none.
- Related function: `validate_api_token(text)` (SECURITY DEFINER) reads this table and updates `last_used_at`.
- types.ts cross-check (`src/integrations/supabase/types.ts:91-134`): consistent. No discrepancy.
- Not affected by tier-2 SQL.

---

## api_clients

**Purpose.** Registered external OAuth applications (client_id/secret, scopes). Call site: `src/views/APIClients.tsx:49` (`.from("api_clients")`). Created `20260110172925`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| name | text | no | — | |
| client_id | text | no | encode(gen_random_bytes(16),'hex') | UNIQUE |
| client_secret | text | no | encode(gen_random_bytes(32),'hex') | |
| redirect_uris | text[] | yes | '{}' | |
| scopes | text[] | yes | ARRAY['reports:read'] | |
| is_active | boolean | yes | true | |
| created_by | uuid | yes | — | → auth.users(id) |
| created_at | timestamptz | yes | now() | |
| updated_at | timestamptz | yes | now() | |

- Constraints: PK on `id`; UNIQUE on `client_id`. FK on `created_by` → auth.users(id) (no ON DELETE action specified).
- Indexes: `idx_api_clients_client_id` (client_id).
- RLS: **enabled**. Policy: `Admins can manage API clients` (FOR ALL TO authenticated, `has_role(...,'Admin')`).
- Triggers: none in the event log. ⚠️ UNVERIFIED — `updated_at` has a default but no `update_*_updated_at` trigger was recorded for this table; the column is only maintained if the app sets it.
- types.ts cross-check (`src/integrations/supabase/types.ts:135-173`): consistent. No discrepancy.
- Not affected by tier-2 SQL.

---

## api_request_logs

**Purpose.** Audit trail of external API requests. Call site: `src/views/APIClients.tsx:61` (`.from("api_request_logs")`). Created `20260110172925`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| client_id | uuid | yes | — | → api_clients(id) ON DELETE SET NULL |
| endpoint | text | no | — | |
| method | text | no | — | |
| status_code | integer | yes | — | |
| request_params | jsonb | yes | — | |
| ip_address | text | yes | — | |
| user_agent | text | yes | — | |
| created_at | timestamptz | yes | now() | |

- Constraints: PK on `id`. FK `api_request_logs_client_id_fkey` (ON DELETE SET NULL).
- Indexes: none beyond PK in the event log.
- RLS: **enabled**. Policies: `Admins can view API logs` (SELECT), `Service role manages logs` (FOR ALL TO service_role).
- Triggers: none.
- types.ts cross-check (`src/integrations/supabase/types.ts:174-217`): consistent. No discrepancy.
- Not affected by tier-2 SQL.

---

## auth_events

**Purpose.** POPIA §16/§24 auth audit trail (login/logout/password/MFA/account events); written by service-role only. Call site: `supabase/functions/invite-user/index.ts:258` (`supabase.from('auth_events').insert({...})`); client helper `src/lib/auth-audit.ts`. Created `20260525120000_auth_events_audit.sql`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| user_id | uuid | yes | — | none (intentionally NO FK to auth.users — audit rows survive user deletion) |
| event_type | text | no | — | |
| ip_address | inet | yes | — | |
| user_agent | text | yes | — | |
| metadata | jsonb | no | '{}' | |
| occurred_at | timestamptz | no | NOW() | |

- Constraints: PK on `id`; CHECK `auth_events_event_type_check` restricting `event_type` to the 11-value whitelist: `'login','logout','password_changed','password_reset_requested','magic_link_requested','lockout','mfa_enrolled','mfa_unenrolled','account_deleted','account_email_changed','user_created'` (`20260525120000_auth_events_audit.sql:21-34`).
- Indexes: `idx_auth_events_user_id` (user_id), `idx_auth_events_event_type` (event_type), `idx_auth_events_occurred_at` (occurred_at DESC).
- RLS: **enabled**. Single policy: `auth_events: user reads own` (FOR SELECT TO authenticated, `user_id = auth.uid()`). NO INSERT/UPDATE/DELETE policy by design — only service-role (which bypasses RLS) can write.
- Triggers: none.
- Migration emits `NOTIFY pgrst, 'reload schema'` at end.
- types.ts cross-check: **⚠️ DISCREPANCY (types.ts vs migrations)** — `auth_events` is ABSENT from `src/integrations/supabase/types.ts` entirely (grep returns 0 matches). The generated types predate the `20260525120000` migration and have not been regenerated. The `INET` type also has no representation in types.ts.
- Not affected by tier-2 SQL.

---

## calendar_events

**Purpose.** Calendar/scheduling entries shown on the dashboard and client portal calendar; joined to sites by `site_name` string (not by id). Call sites: `src/views/Dashboard.tsx:119`, `src/views/ClientPortalCalendar.tsx:65` (`.from("calendar_events")`). Created `20251014132137`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| title | text | no | — | |
| site_name | text | no | — | |
| start_date | date | no | — | |
| end_date | date | yes | — | |
| status | text | yes | 'Scheduled' | |
| priority | text | yes | 'High' | |
| event_type | text | yes | — | |
| created_at | timestamptz | yes | now() | |
| updated_at | timestamptz | yes | now() | |

- Constraints: PK on `id`. No FK (site linkage is by `site_name` text).
- Indexes: none beyond PK in the event log.
- RLS: **enabled**. Effective policies (after the `20251119090707` contractor-restriction rewrite): `Admins can view all calendar events` (SELECT), `Contractors can view calendar events for their sites` (SELECT), `Clients can view their calendar events` (SELECT, `20251017054255`), `Admins can manage calendar events` (FOR ALL). The original four `Authenticated users can view/create/update/delete calendar events` policies were dropped `20251119090707`.
- Triggers: `update_calendar_events_updated_at` (BEFORE UPDATE → `update_updated_at_column()`).
- types.ts cross-check (`src/integrations/supabase/types.ts:218-256`): consistent. No discrepancy.
- Not affected by tier-2 SQL.

---

## client_access_links

**Purpose.** Shareable magic links (token-scoped) for client/site/subsection public review portals; validated by the `validate_access_link(text)` SECURITY DEFINER RPC and the `_share_link(text)` helper used by `get_public_*` RPCs. Call site: `src/components/client-portal/AccessLinkGenerator.tsx:101` (`.from("client_access_links")`). Created `20260122090622_9c76c44a-8b4a-4666-807a-e523b21acfea.sql`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| access_token | text | no | encode(gen_random_bytes(32),'hex') | UNIQUE |
| client_id | uuid | yes | — | → clients(id) ON DELETE CASCADE |
| site_id | uuid | yes | — | → sites(id) ON DELETE CASCADE |
| link_type | text | no | 'site' | |
| subsection_id | uuid | yes | — | → subsections(id) ON DELETE CASCADE |
| label | text | yes | — | |
| is_active | boolean | no | true | |
| expires_at | timestamptz | yes | — | |
| created_by | uuid | yes | — | → auth.users(id) |
| created_at | timestamptz | no | now() | |
| last_accessed_at | timestamptz | yes | — | |
| access_count | integer | no | 0 | |

- Constraints: PK on `id`; UNIQUE on `access_token`; CHECK `link_type IN ('client','site','subsection')`. FKs `client_access_links_client_id_fkey`, `_site_id_fkey`, `_subsection_id_fkey`, plus `created_by` → auth.users(id).
- Indexes: `idx_client_access_links_token` (access_token), `idx_client_access_links_client` (client_id), `idx_client_access_links_site` (site_id).
- RLS: **enabled**. Effective policy NAMES:
  - `Admins can manage access links` (FOR ALL, `20260122090622`).
  - `auth_read_client_access_links` — created by the tier-2 prod SQL, which dropped `Public can select access_links for validation` (FOR SELECT USING(true), public, `20260123052614`) and replaced it with `FOR SELECT TO authenticated USING (true)`. (The earlier `Allow tracking updates via token` UPDATE policy from `20260123052554` was already dropped in `20260123052614`.)
- Triggers: none. Tracking fields (`last_accessed_at`, `access_count`) are mutated by the `validate_access_link` RPC, not a trigger.
- types.ts cross-check (`src/integrations/supabase/types.ts:257-326`): consistent. No discrepancy. (types.ts predates tier-2; policy change does not affect column shape.)

---

## clients

**Purpose.** Core tenant/customer record (Client → Site → Subsection → Inspection hierarchy root). Call sites: `src/views/Clients.tsx:326`, `src/lib/pdfBranding.ts:186` (`.from('clients')`). Created `20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| name | text | no | — | |
| contact_person | text | yes | — | |
| email | text | yes | — | |
| phone | text | yes | — | |
| created_by | uuid | yes | — | → auth.users(id) |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| logo_url | text | yes | — | (`20251014132137`) |
| company_name | text | yes | — | (`20251014132137`) |
| primary_contact_email | text | yes | — | (`20251014132137`) |
| firebase_id | text | yes | — | UNIQUE (`20251014142244`) |

- Constraints: PK on `id`; UNIQUE on `firebase_id` (`20251014142244`). FK on `created_by` → auth.users(id).
- Indexes: `idx_clients_firebase_id` (firebase_id) — `20251014142244`. (UNIQUE on firebase_id also implies a unique index.)
- RLS: **enabled**. Effective policy NAMES (the access model churned heavily — see history):
  - `Admins can view all clients` (SELECT, `20251119090707`).
  - `Contractors can view clients for their sites` (SELECT, `20251119090707`).
  - `Staff manage clients` (FOR ALL TO authenticated; "staff" = authenticated AND NOT Contractor AND NOT Client), created `20260610120000_phase1_write_lockdown.sql`, replacing the prior `All authenticated users full access to clients`.
  - `auth_read_clients` — created by tier-2 prod SQL, which dropped the anon `Public QR code access to client info` (FOR SELECT TO public USING(true), `20251020065437`) that phase-1 lockdown intentionally left in place, replacing it with `FOR SELECT TO authenticated USING (true)`.
- Triggers: `update_clients_updated_at` (BEFORE UPDATE → `update_updated_at_column()`).
- types.ts cross-check (`src/integrations/supabase/types.ts:327-371`): consistent — all 12 columns present with matching nullability. No discrepancy.
- History highlights: anon read added/removed repeatedly (`20251015102828` add → `20251016035546` drop → `20251016104322` add → `20251017094000` drop → `20251020065437` add → tier-2 demote to authenticated). Write policies tightened from blanket authenticated → Admin-only (`20251119090707` `Admins can manage clients`) → `Staff manage clients` (`20260610120000`).

---

## coc_compliance_photos

**Purpose.** Geotagged compliance/COC photos captured against a subsection (and optionally a coc_validation); files live in the public `coc-photos` storage bucket. Call site: `src/hooks/useOfflinePhotos.ts:237` (`.from('coc_compliance_photos')`). Created `20260310083442_1b964afb-fbe3-4c55-9ad2-531d76c72522.sql`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| subsection_id | uuid | no | — | → subsections(id) ON DELETE CASCADE |
| coc_validation_id | uuid | yes | — | → coc_validations(id) ON DELETE SET NULL |
| photo_type | text | no | — | |
| storage_path | text | no | — | |
| file_name | text | no | — | |
| file_size | bigint | no | — | |
| mime_type | text | no | — | |
| captured_at | timestamptz | no | now() | |
| captured_by | uuid | no | — | → auth.users(id) |
| latitude | numeric | yes | — | |
| longitude | numeric | yes | — | |
| notes | text | yes | — | |
| created_at | timestamptz | no | now() | |

- Constraints: PK on `id`. FKs `coc_compliance_photos_subsection_id_fkey`, `coc_compliance_photos_coc_validation_id_fkey`, plus `captured_by` → auth.users(id) (NOT NULL).
- Indexes: `idx_coc_photos_subsection` (subsection_id), `idx_coc_photos_validation` (coc_validation_id), `idx_coc_photos_captured_by` (captured_by).
- RLS: **enabled**. Effective single policy: `All authenticated users full access (coc_compliance_photos)` (FOR ALL TO authenticated, USING true / WITH CHECK true), created `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql`, which dropped the four original role-scoped policies (`Admins can manage all COC photos`, `Users can manage all COC photos`, `Contractors can view COC photos for assigned sites`, `Users can manage their own COC photos`). Original policies in `20260310083442` passed bare-text role literals (`'Admin'`/`'User'`/`'Contractor'`) without `::app_role` cast — now moot since all were dropped.
- Triggers: none in the event log.
- types.ts cross-check (`src/integrations/supabase/types.ts:372-437`): consistent. No discrepancy. NOTE: types.ts also defines a separate snapshot table `coc_compliance_photos_snap_20260421` (`:438-488`) — a point-in-time copy, not in this batch's migration event log and not a target table.
- Not affected by tier-2 SQL (its SELECT path is via the FOR ALL authenticated policy, not a public `USING(true)` SELECT-only policy).

---

## coc_extractions

**Purpose.** Stores AI (Gemini) COC document-extraction results, one per document. Call site: `src/views/subsection-detail/useSubsectionDetail.ts:234` (`.from('coc_extractions')`). Created `20260113062616_960f2100-566c-454c-9738-b22646ec4836.sql`.

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| document_id | uuid | no | — | → subsection_documents(id) ON DELETE CASCADE |
| subsection_id | uuid | no | — | → subsections(id) ON DELETE CASCADE |
| extracted_data | jsonb | no | '{}' | |
| confidence | text | yes | — | CHECK IN ('high','medium','low') |
| extraction_method | text | yes | 'gemini-full' | |
| extraction_notes | text | yes | — | |
| extracted_at | timestamptz | no | now() | |
| extracted_by | uuid | yes | — | → auth.users(id) |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

- Constraints: PK on `id`; CHECK on `confidence` ∈ ('high','medium','low'). UNIQUE INDEX `coc_extractions_document_id_unique` (document_id) — one extraction per document. FKs `coc_extractions_document_id_fkey`, `coc_extractions_subsection_id_fkey`.
- Indexes: `coc_extractions_document_id_unique` (unique, document_id), `coc_extractions_subsection_id_idx` (subsection_id), `coc_extractions_extracted_at_idx` (extracted_at DESC).
- RLS: **enabled**. Effective policy NAMES:
  - `Staff manage coc_extractions` (FOR ALL TO authenticated; staff = authenticated AND NOT Contractor AND NOT Client), created `20260610120000_phase1_write_lockdown.sql`, replacing the per-user `Users can create/update/delete extractions` policies (dropped same migration).
  - `auth_read_coc_extractions` — created by tier-2 prod SQL, which dropped `Users can view their own organization extractions` (FOR SELECT USING(true), public despite the name, `20260113062616`) and replaced it with `FOR SELECT TO authenticated USING (true)`.
  - (Edge function `extract-coc` writes via service_role, bypassing RLS.)
- Triggers: `update_coc_extractions_updated_at` (BEFORE UPDATE → `update_updated_at_column()`).
- types.ts cross-check (`src/integrations/supabase/types.ts:489-545`): consistent. No discrepancy.

---

## coc_local_validations

**Purpose.** Locally-computed (non-AI) COC certificate validation records capturing full electrical test data and SANS/Annexure-1 form fields; pass/fail and fraud-risk scoring. No `from('coc_local_validations')` call site was found in `src` or `supabase/functions` (grep returned no matches) — ⚠️ UNVERIFIED whether/where it is read at runtime. Created `20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql`; extended with 33 Annexure-1 columns in `20260310075810_564cfaa3-71b1-47c0-9b8f-e0dc9457d00d.sql`.

Base columns (`20260309172544`):

| column | type | null | default | FK |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| site_id | uuid | yes | — | → sites(id) ON DELETE CASCADE |
| coc_reference_number | text | no | — | |
| certificate_type | text | no | — | |
| installation_address | text | no | — | |
| registered_person_name | text | no | — | |
| registration_number | text | no | — | |
| registration_category | text | no | — | |
| date_of_issue | date | no | — | |
| installation_type | text | no | — | |
| phase_configuration | text | no | — | |
| supply_voltage | numeric | no | 230 | |
| supply_frequency | numeric | no | 50 | |
| insulation_resistance | numeric | yes | — | |
| earth_loop_impedance | numeric | yes | — | |
| rcd_trip_time | numeric | yes | — | |
| rcd_rated_current | numeric | no | 30 | |
| pscc | numeric | yes | — | |
| earth_continuity | numeric | yes | — | |
| voltage_at_main_db | numeric | yes | — | |
| polarity_correct | boolean | no | false | |
| has_signature | boolean | no | false | |
| signature_date | date | yes | — | |
| has_solar_pv | boolean | no | false | |
| has_bess | boolean | no | false | |
| solar_grounding_verified | boolean | yes | — | |
| inverter_sync_verified | boolean | yes | — | |
| bess_fire_protection | boolean | yes | — | |
| spd_operational | boolean | yes | — | |
| afdd_installed | boolean | yes | — | |
| validation_status | text | no | 'INVALID' | |
| fraud_risk_score | text | no | 'LOW' | |
| validation_results_json | jsonb | yes | '{}' | |
| created_by | uuid | yes | — | → auth.users(id) ON DELETE SET NULL |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

Annexure-1 columns added `20260310075810` (all additive; only `form_type` is NOT NULL):

| column | type | null | default |
|---|---|---|---|
| form_type | text | no | 'annexure1' |
| form_data_json | jsonb | yes | '{}' |
| building_name | text | yes | — |
| gps_coordinates | text | yes | — |
| suburb_township | text | yes | — |
| district_town_city | text | yes | — |
| erf_lot_no | text | yes | — |
| registered_person_id_number | text | yes | — |
| regulation_type | text | yes | — |
| registered_person_reg_date | text | yes | — |
| supply_system_type | text | yes | 'TN-S' |
| installation_permanent | boolean | yes | true |
| phase_rotation | text | yes | — |
| main_switch_type | text | yes | — |
| number_of_poles | integer | yes | — |
| current_rating_a | numeric | yes | — |
| short_circuit_withstand_ka | numeric | yes | — |
| neutral_loop_impedance_ohm | numeric | yes | — |
| elevated_voltage_v | numeric | yes | — |
| voltage_no_load_r | numeric | yes | — |
| voltage_no_load_y | numeric | yes | — |
| voltage_no_load_b | numeric | yes | — |
| voltage_full_load_r | numeric | yes | — |
| voltage_full_load_y | numeric | yes | — |
| voltage_full_load_b | numeric | yes | — |
| continuity_of_bonding | text | yes | — |
| continuity_ring_circuits | text | yes | — |
| earth_leakage_test_button | boolean | yes | — |
| phase_rotation_correct | boolean | yes | — |
| switching_devices_correct | boolean | yes | — |
| comments | text | yes | — |
| db_supply_name | text | yes | — |

- Constraints: PK on `id`. FKs on `site_id` (ON DELETE CASCADE) and `created_by` (ON DELETE SET NULL). No CHECK constraints recorded.
- Indexes: none beyond PK in the event log.
- RLS: **enabled**. Policies (`20260309172544`): `Admins can manage all COC local validations` (FOR ALL), `Users can manage all COC local validations` (FOR ALL, `has_role(...,'User')`), `Contractors can view COC local validations for assigned sites` (SELECT), `Users can view own COC local validations` (SELECT, `created_by = auth.uid()`).
- Triggers: `update_coc_local_validations_updated_at` (BEFORE UPDATE → `update_updated_at_column()`).
- types.ts cross-check (`src/integrations/supabase/types.ts:546-616+`): consistent — base + all 33 Annexure columns present with matching types/nullability/defaults. No discrepancy.
- Not affected by tier-2 SQL (no anon/public `USING(true)` SELECT policy).
