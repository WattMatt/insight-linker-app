# Effective RLS Policy Reference — Batch 02

Tables covered: `contractor_coc_uploads`, `document_categories`, `file_sync_logs`, `floor_plan_pin_comments`, `floor_plan_pins`, `inspection_items`, `inspection_relink_audit`, `inspection_signatures`, `inspection_subsections`, `inspection_templates`, `inspections`, `issue_reports`, `notifications`, `offline_photos`.

**Method.** State = replay of all 117 DDL events across the 14 migration files (work log `migration-events-01.json` … `-10.json`, chronological) **then** the dashboard-applied `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` ("tier-2 file"), which is applied LAST. Later events override earlier ones; dropped policies are gone.

**Global facts (verified):**
- No `FORCE ROW LEVEL SECURITY` event appears in any migration batch (grep across all 10 work files: zero matches). Every table below is **RLS ENABLED, NOT FORCED** — table owner / service-role (`postgres`) bypasses RLS entirely.
- Policies with **no `TO` clause default to PostgreSQL role `public`**, which includes `anon` and `authenticated`. This is called out per policy below.
- `service_role` bypasses RLS on every table (not forced), so the per-table "service_role" summary line = full unrestricted access unless noted.
- **Tier-2 file matching rule** (verbatim predicate): it drops any policy where `cmd='SELECT' AND qual='true' AND (roles='{public}' OR 'anon'=ANY(roles))` and `tablename NOT IN ('settings')`, then creates `auth_read_<table>` = `FOR SELECT TO authenticated USING (true)`. A `FOR ALL ... USING(true)` policy has `cmd='ALL'`, **not** `'SELECT'`, so blanket FOR-ALL policies are **not** matched by tier-2. (`APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:22-39`.)

---

## contractor_coc_uploads

RLS: **ENABLED**, not forced (`20260410013045_e3990969-d3ba-4378-94ca-bfa2e8d541b3.sql`; no FORCE event).

Created (table + 3 policies) in `20260410013045`. Tier-2 file drops the SELECT/`true`/public policy `allow read` and substitutes `auth_read_contractor_coc_uploads`.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `auth_read_contractor_coc_uploads` | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:37-38` |
| `allow insert` | INSERT | public (no TO clause → anon + authenticated) | — | `true` | `20260410013045_…edab.sql` |
| `allow update` | UPDATE | public (no TO clause → anon + authenticated) | `true` | — (no WITH CHECK) | `20260410013045_…edab.sql` |

Superseded/dropped: `allow read` (FOR SELECT, public, `USING (true)`; created `20260410013045`) — dropped by the tier-2 file and replaced with `auth_read_contractor_coc_uploads`.

**Access summary**
- **anon:** can INSERT (`allow insert`) and UPDATE (`allow update`) any row; **cannot** SELECT (read policy now authenticated-only). UPDATE has no WITH CHECK → may rewrite a row into any shape.
- **authenticated:** SELECT all rows (`auth_read_…`), plus INSERT/UPDATE all rows.
- **service_role:** full unrestricted access (RLS bypass).

---

## document_categories

RLS: **ENABLED**, not forced (`20251014140001_3adc740c-7446-410a-a427-957d649c4e3c.sql`; no FORCE event).

Long policy history: manage-all (140001) → public anon read added (20251015102828) then dropped (20251016035546) → public read re-added (20251020065547) → role-split Admin/Contractor (20251119090820) dropping the manage-all → those + public dropped, blanket added (20251120080517) → role-split Admin/Client/Contractor + public re-added (20251120110544) → User manage-all added (20251120111033) → public re-added (20260108071956) → all role policies dropped & collapsed to blanket FOR-ALL (20260406131029, public SELECT intentionally retained per comment) → tier-2 demotes the public SELECT.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `All authenticated users full access (document_categories)` | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |
| `auth_read_document_categories` | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:37-38` |

Superseded/dropped (most recent first): `Public can view document categories` (FOR SELECT TO public USING `true`, last re-created `20260108071956`) — **dropped by tier-2 file**, replaced by `auth_read_document_categories`. Earlier, all role-scoped policies (`Admins can manage all document categories`, `Clients can view document categories for their sites`, `Contractors can view document categories for assigned sites`, `Users can manage all document categories`) were dropped in `20260406131029` and collapsed into the blanket FOR-ALL policy. The original `Authenticated users can manage document categories` (140001) and the Admin/Contractor split (20251119090820) are long gone.

**Access summary**
- **anon:** no access (the only anon-reaching policy, the public SELECT, was demoted by tier-2).
- **authenticated:** full CRUD via blanket FOR-ALL `USING true / WITH CHECK true`; SELECT also covered by `auth_read_…`.
- **service_role:** full unrestricted access.

---

## file_sync_logs

RLS: **ENABLED**, not forced (`20251027075744_d0a3d62f-05ac-43a0-acd4-363ae5890a1a.sql`; no FORCE event).

Two policies created in `20251027075744`; never altered afterward. Not matched by tier-2 (predicates use `auth.role() = 'authenticated'`, not bare `qual='true'`).

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `Authenticated users can view sync logs` | SELECT | public (no TO clause → anon + authenticated) | `(auth.role() = 'authenticated')` | — | `20251027075744_…a078.sql` |
| `Authenticated users can create sync logs` | INSERT | public (no TO clause → anon + authenticated) | — | `(auth.role() = 'authenticated')` | `20251027075744_…a078.sql` |

No UPDATE or DELETE policy exists → no one (except service-role bypass) can update or delete rows.

**Access summary**
- **anon:** `auth.role()` is `'anon'`, so both predicates are false → no read, no insert.
- **authenticated:** SELECT all rows; INSERT any row. Cannot UPDATE/DELETE (no policy).
- **service_role:** full unrestricted access (also bypasses the missing UPDATE/DELETE policies).

---

## floor_plan_pin_comments

RLS: **ENABLED**, not forced (`20251120102352_9e71ab8f-203e-4876-9207-b010022c3232.sql`; no FORCE event).

Four owner/role policies created in `20251120102352`; all dropped and collapsed into a single blanket FOR-ALL in `20260406131029`. Not matched by tier-2 (the surviving policy is `cmd='ALL'`, not SELECT).

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `All authenticated users full access (floor_plan_pin_comments)` | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |

Superseded/dropped (all in `20260406131029`): `Authenticated users can view comments` (SELECT, public, `auth.uid() IS NOT NULL`), `Authenticated users can create comments` (INSERT, public, `auth.uid() IS NOT NULL`), `Users can update their own comments` (UPDATE, public, `auth.uid() = user_id`, no WITH CHECK), `Users can delete their own comments` (DELETE, public, `auth.uid() = user_id`).

**Access summary**
- **anon:** no access (only policy is `TO authenticated`).
- **authenticated:** full CRUD on all comment rows (ownership no longer enforced after the 20260406131029 collapse).
- **service_role:** full unrestricted access.

---

## floor_plan_pins

RLS: **ENABLED**, not forced (`20251027115044_3a5a0a85-6c4a-4c4e-8d8d-e2e91cf6a078.sql`; no FORCE event).

History: 4 owner policies (20251027115044) → dropped, blanket (20251120080517) → dropped, role-split Admin/Client/Contractor (20251120110544) → User manage-all (20251120111033) → public SELECT added (20260123052442) → all role policies dropped & collapsed to blanket FOR-ALL (20260406131029, with the public SELECT **intentionally retained** per migration comment) → tier-2 demotes the public SELECT.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `All authenticated users full access (floor_plan_pins)` | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |
| `auth_read_floor_plan_pins` | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:37-38` |

Superseded/dropped (most recent first): `Public can view floor_plan_pins` (FOR SELECT, public, `USING (true)`; created `20260123052442`) — **dropped by tier-2 file**, replaced by `auth_read_floor_plan_pins`. Earlier role policies `Admins can manage all floor plan pins`, `Clients can view floor plan pins for their sites`, `Contractors can view floor plan pins for assigned sites`, `Users can manage all floor plan pins` were dropped in `20260406131029`.

**Access summary**
- **anon:** no access (public SELECT demoted by tier-2).
- **authenticated:** full CRUD on all pins (blanket FOR-ALL); SELECT also via `auth_read_…`.
- **service_role:** full unrestricted access.

---

## inspection_items

RLS: **ENABLED**, not forced (`20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`; no FORCE event).

History: 4 authenticated policies (20251014114352) → dropped, Admin manage + Contractor SELECT (20251119090820) → dropped, blanket (20251120080517) → dropped, Admin manage + Contractor SELECT (20251120110544) → User manage-all (20251120111033) → all dropped & collapsed to blanket FOR-ALL (20260406131029). No public/anon SELECT policy ever added → tier-2 does NOT touch this table.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `All authenticated users full access (inspection_items)` | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |

Superseded/dropped (most recent first, all in `20260406131029`): `Admins can manage all inspection items` (ALL, `has_role(auth.uid(),'Admin')`), `Contractors can view inspection items for assigned sites` (SELECT, `has_role(…,'Contractor') AND subsection_id IN (…inspection_subsections JOIN inspections WHERE i.site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid()))`), `Users can manage all inspection items` (ALL, `has_role(…,'User')`). Note: a Client SELECT policy was **never** created for inspection_items (unlike sibling tables in `20251120110544`).

**Access summary**
- **anon:** no access (only policy is `TO authenticated`).
- **authenticated:** full CRUD on all items.
- **service_role:** full unrestricted access.

---

## inspection_relink_audit

RLS: **ENABLED**, not forced (`20260519045946_ff0d3334-68ec-431a-b213-6a5bc51b25f1.sql`; no FORCE event).

Table + 2 policies created in `20260519045946` (same migration that runs the one-time orphan-relink backfill DO-block). Both policies use `DROP POLICY IF EXISTS … then CREATE` (idempotent replace). No public SELECT/`true` policy → tier-2 does NOT touch this table.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `Admins view relink audit` | SELECT | public (no TO clause → anon + authenticated) | `public.has_role(auth.uid(), 'Admin'::app_role)` | — | `20260519045946_…b25f1.sql` |
| `Service inserts relink audit` | INSERT | public (no TO clause → anon + authenticated) | — | `true` | `20260519045946_…b25f1.sql` |

No UPDATE/DELETE policy → only service-role (bypass) can mutate existing rows.

**Access summary**
- **anon:** SELECT predicate `has_role(NULL,'Admin')` is false → no read. INSERT WITH CHECK `true` → **anon CAN insert audit rows** (policy is public, not service-restricted despite its name).
- **authenticated:** SELECT only if the caller holds the `Admin` role; INSERT any row.
- **service_role:** full unrestricted access (bypass); intended writer of audit rows via the backfill DO-block and `resolve_inspection_subsection`.

---

## inspection_signatures

RLS: **ENABLED**, not forced (`20260108042823_c7515df1-fcdf-4adc-ae75-55420c305177.sql`; no FORCE event).

Table + 4 policies created in `20260108042823`; all dropped and collapsed into a blanket FOR-ALL in `20260406131029`. No public/anon SELECT/`true` policy → tier-2 does NOT touch this table.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `All authenticated users full access (inspection_signatures)` | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |

Superseded/dropped (all in `20260406131029`): `Users can view signatures for inspections they have access to` (SELECT, public, `EXISTS (SELECT 1 FROM inspections i JOIN sites s ON i.site_id = s.id WHERE i.id = inspection_signatures.inspection_id)` — no direct `auth.uid()` check ⚠️ UNVERIFIED whether transitive RLS gating was intended), `Authenticated users can create signatures` (INSERT, public, `auth.uid() IS NOT NULL`), `Users can update their own signatures` (UPDATE, public, `auth.uid() IS NOT NULL` — permitted ANY authenticated user despite the name), `Admins can delete signatures` (DELETE, public, `EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'Admin')`).

**Access summary**
- **anon:** no access (only policy is `TO authenticated`).
- **authenticated:** full CRUD on all signature rows (ownership / signer checks removed in the 20260406131029 collapse).
- **service_role:** full unrestricted access.

---

## inspection_subsections

RLS: **ENABLED**, not forced (`20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`; no FORCE event).

History: 4 authenticated policies (20251014114352) → dropped, Admin manage + Contractor SELECT (20251119090820) → dropped & collapsed to blanket FOR-ALL (20251120080517). **Not** included in the later `20260406131029` collapse and never received a public SELECT policy → tier-2 does NOT touch this table. Effective state is the single blanket policy from `20251120080517`.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `All authenticated users full access to inspection_subsections` | ALL | public (no TO clause → anon + authenticated) | `(auth.uid() IS NOT NULL)` | `(auth.uid() IS NOT NULL)` | `20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql` |

Superseded/dropped: `Admins can manage inspection subsections` and `Contractors can view inspection subsections for their sites` (both `20251119090820`, dropped in `20251120080517`); original 4 `Authenticated users can {view,create,update,delete} subsections` (`20251014114352`, dropped in `20251119090820`).

**Note on roles:** this policy has **no `TO` clause** → role `public`. But its predicate is `auth.uid() IS NOT NULL`, which is false for anon, so the effect is authenticated-only despite the public role binding. (This differs from the sibling tables that were rewritten `TO authenticated` in `20260406131029`.)

**Access summary**
- **anon:** no access (`auth.uid() IS NOT NULL` is false).
- **authenticated:** full CRUD on all subsection rows.
- **service_role:** full unrestricted access.

---

## inspection_templates

RLS: **ENABLED**, not forced (`20251014140001_3adc740c-7446-410a-a427-957d649c4e3c.sql`; no FORCE event).

History: 4 authenticated policies (20251014140001) → dropped, Admin manage + Contractor SELECT (20251119090820) → dropped, blanket (20251120080517) → public SELECT added conditionally (20260123052442) → tier-2 demotes the public SELECT. The blanket policy from `20251120080517` was **not** touched by `20260406131029`.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `All authenticated users full access to inspection_templates` | ALL | public (no TO clause → anon + authenticated) | `(auth.uid() IS NOT NULL)` | `(auth.uid() IS NOT NULL)` | `20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql` |
| `auth_read_inspection_templates` | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:37-38` |

Superseded/dropped (most recent first): `Public can view inspection_templates` (FOR SELECT, public, `USING (true)`, conditionally created `20260123052442` only if no SELECT/`true` policy already existed) — **dropped by tier-2 file**, replaced by `auth_read_inspection_templates`. Earlier `Admins can manage inspection templates` + `Contractors can view inspection templates` (`20251119090820`, dropped in `20251120080517`); original 4 `Authenticated users can {view,create,update,delete} templates` (`20251014140001`, dropped in `20251119090820`).

**Access summary**
- **anon:** no access (public SELECT demoted by tier-2; blanket policy requires `auth.uid() IS NOT NULL`).
- **authenticated:** full CRUD on all templates (blanket policy); SELECT also via `auth_read_…`.
- **service_role:** full unrestricted access.

---

## inspections

RLS: **ENABLED**, not forced (`20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`; no FORCE event).

Most-churned table. History: 4 authenticated policies (20251014114352) → Client SELECT (20251017054255) → Contractor view+update (20251017061634) → all dropped & blanket (20251120080517) → blanket dropped, Admin/Client/Contractor SELECT split (20251120110544) → User manage-all (20251120111033) → public SELECT added (20260123052442) → Contractor UPDATE + Contractor INSERT added (20260219090420) → tier-2 demotes the public SELECT.

Effective policy set:

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `Admins can manage all inspections` | ALL | public (no TO clause → anon + authenticated) | `has_role(auth.uid(), 'Admin'::app_role)` | `has_role(auth.uid(), 'Admin'::app_role)` | `20251120110544_4e89ad10-205d-44f0-9308-05167a2a3326.sql` |
| `Users can manage all inspections` | ALL | public (no TO clause → anon + authenticated) | `has_role(auth.uid(), 'User'::app_role)` | `has_role(auth.uid(), 'User'::app_role)` | `20251120111033_1e66f4c9-8418-4d98-9333-8331b5c0aa7a.sql` |
| `Clients can view inspections for their sites` | SELECT | public (no TO clause → anon + authenticated) | `has_role(auth.uid(), 'Client'::app_role) AND site_id IN (SELECT id FROM sites WHERE client_id = get_user_client_id())` | — | `20251120110544_4e89ad10-205d-44f0-9308-05167a2a3326.sql` |
| `Contractors can view inspections for assigned sites` | SELECT | public (no TO clause → anon + authenticated) | `has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())` | — | `20251120110544_4e89ad10-205d-44f0-9308-05167a2a3326.sql` |
| `Contractors can update inspections for assigned sites` | UPDATE | public (no TO clause → anon + authenticated) | `has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT site_id FROM public.user_sites WHERE user_id = auth.uid())` | `has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT site_id FROM public.user_sites WHERE user_id = auth.uid())` | `20260219090420_f8f55711-3403-4e75-90cc-fbb90366a038.sql` |
| `Contractors can insert inspections for assigned sites` | INSERT | public (no TO clause → anon + authenticated) | — | `has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT site_id FROM public.user_sites WHERE user_id = auth.uid())` | `20260219090420_f8f55711-3403-4e75-90cc-fbb90366a038.sql` |
| `auth_read_inspections` | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:37-38` |

Superseded/dropped (most recent first): `Public can view inspections` (FOR SELECT, public, `USING (true)`; created `20260123052442`) — **dropped by tier-2 file**, replaced by `auth_read_inspections`. Earlier drops: the 20251017 Client/Contractor view+update policies and the original 4 authenticated policies were dropped in `20251120080517` (in favour of a blanket FOR-ALL), which was itself dropped in `20251120110544`.

**Note:** after tier-2, `auth_read_inspections` grants every authenticated user SELECT on ALL inspection rows via `USING (true)` — this is permissive and OR-combines with (i.e. supersedes the row-narrowing intent of) the Client/Contractor SELECT policies. The role-scoped SELECT policies are now effectively redundant for read.

**Access summary**
- **anon:** no access (public SELECT demoted by tier-2; every remaining policy predicate references `auth.uid()`/`has_role`, false for anon).
- **authenticated:** SELECT all rows (`auth_read_inspections`). Write: Admin role → full CRUD; User role → full CRUD; Contractor role → INSERT/UPDATE limited to assigned sites; a plain authenticated user with none of Admin/User/Contractor roles can read but **cannot write**.
- **service_role:** full unrestricted access.

---

## issue_reports

RLS: **ENABLED**, not forced (`20251018005315_1d30c9c7-745a-4860-b1b1-f281dc276ae7.sql`; no FORCE event).

Six policies created in `20251018005315`; never altered. Not matched by tier-2 (no SELECT/`true`/public policy).

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `Users can view their own issue reports` | SELECT | authenticated | `(auth.uid() = reported_by)` | — | `20251018005315_…ae7.sql` |
| `Admins can view all issue reports` | SELECT | authenticated | `has_role(auth.uid(), 'Admin'::app_role)` | — | `20251018005315_…ae7.sql` |
| `Users can create their own issue reports` | INSERT | authenticated | — | `(auth.uid() = reported_by)` | `20251018005315_…ae7.sql` |
| `Admins can update issue reports` | UPDATE | authenticated | `has_role(auth.uid(), 'Admin'::app_role)` | — (no WITH CHECK) | `20251018005315_…ae7.sql` |
| `Admins can delete issue reports` | DELETE | authenticated | `has_role(auth.uid(), 'Admin'::app_role)` | — | `20251018005315_…ae7.sql` |

**Access summary**
- **anon:** no access (all policies `TO authenticated`).
- **authenticated:** SELECT own reports (`reported_by = auth.uid()`), plus all reports if Admin; INSERT only with `reported_by = self`; UPDATE/DELETE only if Admin.
- **service_role:** full unrestricted access.

---

## notifications

RLS: **ENABLED**, not forced (`20251030071546_f84d79c3-3466-4537-9303-247210557c2a.sql`; no FORCE event).

Three policies created in `20251030071546`; never altered. Not matched by tier-2.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `Users can view their own notifications` | SELECT | authenticated | `(auth.uid() = user_id)` | — | `20251030071546_…7c2a.sql` |
| `Users can update their own notifications` | UPDATE | authenticated | `(auth.uid() = user_id)` | — (no WITH CHECK) | `20251030071546_…7c2a.sql` |
| `Authenticated users can insert notifications` | INSERT | authenticated | — | `true` | `20251030071546_…7c2a.sql` |

No DELETE policy → only service-role (bypass) can delete.

**Access summary**
- **anon:** no access (all policies `TO authenticated`).
- **authenticated:** SELECT/UPDATE only own rows (`user_id = auth.uid()`); INSERT **any** row for **any** `user_id` (WITH CHECK `true` — the migration comment said "Admins can insert" but no role check exists). Cannot DELETE.
- **service_role:** full unrestricted access.

---

## offline_photos

RLS: **ENABLED**, not forced (`20260310085611_954679cb-a199-4078-b21b-79f70f49edfa.sql`; no FORCE event).

Table + 4 role policies created in `20260310085611`; all dropped and collapsed into a blanket FOR-ALL in `20260406131029`. No public/anon SELECT/`true` policy → tier-2 does NOT touch this table.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| `All authenticated users full access (offline_photos)` | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |

Superseded/dropped (all in `20260406131029`): `Admins can manage all offline photos` (ALL, `has_role(auth.uid(),'Admin')`), `Users can manage all offline photos` (ALL, `has_role(auth.uid(),'User')`), `Users can manage their own offline photos` (ALL, `captured_by = auth.uid()`), `Contractors can view offline photos for assigned sites` (SELECT, `has_role(…,'Contractor') AND context_id IN (subsections/sites/inspections of assigned sites via user_sites UNION)`).

**Access summary**
- **anon:** no access (only policy is `TO authenticated`).
- **authenticated:** full CRUD on all photo rows (per-user `captured_by` ownership and role scoping removed in the 20260406131029 collapse).
- **service_role:** full unrestricted access.

---

## Cross-table notes

- **Tier-2 file affected (of these 14):** `contractor_coc_uploads`, `document_categories`, `floor_plan_pins`, `inspection_templates`, `inspections` — each had a `FOR SELECT … USING(true)` public/anon policy dropped and replaced with `auth_read_<table>`. The other 9 tables were untouched by tier-2 (their permissive SELECTs were either absent or expressed as `FOR ALL`, which the tier-2 predicate `cmd='SELECT'` does not match). (`APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:22-39`.)
- **Anon write still open after tier-2:** `contractor_coc_uploads` (INSERT/UPDATE via no-TO `public` policies) and `inspection_relink_audit` (INSERT via `Service inserts relink audit`, WITH CHECK `true`, role `public`). Tier-2 only closed anon *reads*; it did not revoke these anon *writes*.
- **"public" role vs predicate:** several surviving policies bind role `public` (no `TO` clause) but gate with `auth.uid() IS NOT NULL` / `has_role(...)` / `auth.role() = 'authenticated'`, which evaluate false for anon — effectively authenticated-only despite the broad role binding. Distinguish these from the genuinely anon-reachable `USING(true)` writes above.
- **Missing DELETE/UPDATE policies (service-role-only mutation):** `file_sync_logs` (no UPDATE/DELETE), `notifications` (no DELETE), `inspection_relink_audit` (no UPDATE/DELETE).
