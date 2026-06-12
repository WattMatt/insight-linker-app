# Effective RLS Policy Reference — Part 3

Scope (14 tables): `pdf_report_templates`, `pending_user_invites`, `profiles`, `public.auth_events`, `public.clients`, `public.coc_compliance_photos`, `public.coc_extractions`, `public.coc_local_validations`, `public.coc_validations`, `public.contractor_coc_uploads`, `public.document_categories`, `public.floor_plan_pin_comments`, `public.floor_plan_pins`, `public.inspection_items`.

Method: effective state = replay of all migration DDL events in chronological order (migration filename order across `_work/migration-events-01.json` … `-10.json`), then the out-of-band production SQL `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` applied **LAST**.

Conventions:
- **"TO PUBLIC"** = policy created with **no `TO` clause**; in Postgres this applies to **every** role including `anon`. Where the USING/WITH CHECK expression contains `auth.uid() IS NOT NULL`, `auth.role() = 'authenticated'`, or `has_role(...)`, anon is gated out by the expression even though the policy nominally targets PUBLIC.
- All policies are PERMISSIVE (none created `AS RESTRICTIVE` anywhere in the log).
- `has_role(uid, role)` is the SECURITY DEFINER helper over `user_roles` (defined `20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql`). `get_user_client_id()` is a helper referenced by Client-scoped policies (defined elsewhere; ⚠️ UNVERIFIED in this batch).
- `app_role` enum = `('Admin','User','Contractor','Moderator')` + `'Client'` (Admin/User/Contractor defined `20251014120311`; Moderator added `20251014172237_cf2b6c0e-4e10-4df0-abc2-8a96d54ef0ab.sql`; `'Client'` is referenced in later policies — ⚠️ enum value add not located in this batch).
- service_role bypasses RLS entirely; it is never named in a `TO service_role` policy on any table in this file. It always has full access via bypass.
- RLS is **ENABLED** (never `FORCE`d) on every table below — no `FORCE ROW LEVEL SECURITY` event exists in the log for any of these tables. No table-level `GRANT`/`REVOKE` events exist in the log for these tables (table privileges are Supabase defaults; not modified by migration).
- **Tier-2 lockdown** (`APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`, applied LAST): scans **all** public tables and, for any policy with `cmd='SELECT' AND qual='true' AND (roles='{public}' OR 'anon'=ANY(roles))` (except table `settings`), DROPs those policies and creates `auth_read_<table>` = `FOR SELECT TO authenticated USING (true)`. It does **not** touch `FOR ALL` (`cmd='ALL'`) policies even when their USING is `true`. Tables affected within this file's scope: **clients**, **coc_extractions**, **coc_validations**, **contractor_coc_uploads**, **document_categories**, **floor_plan_pins**.

---

## pdf_report_templates

RLS: **ENABLED** (`20260110132516_9c4acf95-e674-4d32-a18d-668b0add0770.sql`). Not FORCED.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage PDF templates | ALL | PUBLIC (no TO; gated by expr) | `public.has_role(auth.uid(), 'Admin')` | — (FOR ALL w/o WITH CHECK → USING reused for writes) | `20260110132516_9c4acf95-e674-4d32-a18d-668b0add0770.sql` |
| Authenticated users can view PDF templates | SELECT | PUBLIC (no TO; gated by expr) | `auth.uid() IS NOT NULL` | — | `20260110132516_9c4acf95-e674-4d32-a18d-668b0add0770.sql` |

Notes: role literal `'Admin'` passed without `::app_role` cast. Not touched by tier-2 (the SELECT policy's qual is `auth.uid() IS NOT NULL`, not `true`).

Access summary:
- **anon**: no access (both policies gate via `auth.uid()`/`has_role`).
- **authenticated**: SELECT all rows; INSERT/UPDATE/DELETE only if Admin role.
- **service_role**: full access (RLS bypass).

---

## pending_user_invites

RLS: **ENABLED** (`20251014164357_37295947-5f1a-4fb6-aa2f-b81d8cf4144d.sql`). Not FORCED.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can view pending invites | SELECT | authenticated | `has_role(auth.uid(), 'Admin')` | — | `20251014164357_37295947-5f1a-4fb6-aa2f-b81d8cf4144d.sql` |
| Admins can insert pending invites | INSERT | authenticated | — | `has_role(auth.uid(), 'Admin')` | `20251014164357_37295947-5f1a-4fb6-aa2f-b81d8cf4144d.sql` |
| Admins can update pending invites | UPDATE | authenticated | `has_role(auth.uid(), 'Admin')` | — | `20251014164357_37295947-5f1a-4fb6-aa2f-b81d8cf4144d.sql` |
| Admins can delete pending invites | DELETE | authenticated | `has_role(auth.uid(), 'Admin')` | — | `20251014164357_37295947-5f1a-4fb6-aa2f-b81d8cf4144d.sql` |

Notes: role literal `'Admin'` passed without `::app_role` cast. No policy is `USING(true)` → not touched by tier-2. Never modified after creation.

Access summary:
- **anon**: no access.
- **authenticated**: full CRUD only if Admin role; non-Admins have no access.
- **service_role**: full access (RLS bypass).

---

## profiles

RLS: **ENABLED** (`20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`). Not FORCED.

Superseded history (SELECT only): original `Users can view all profiles` (SELECT, PUBLIC, `USING(true)`) **dropped** `20251016035546_4ea02c08-d2af-456a-a2e2-cacd46327e5d.sql`; its replacement `Authenticated users can view profiles` (SELECT, authenticated, `USING(true)`) **dropped** one migration later `20251016064350_7ace660c-3ad8-402b-84db-2739d3e6fb38.sql`. The write policies from the original migration were never dropped and remain effective.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Users can update their own profile | UPDATE | PUBLIC (no TO; gated by expr) | `auth.uid() = id` | — | `20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql` |
| Users can insert their own profile | INSERT | PUBLIC (no TO; gated by expr) | — | `auth.uid() = id` | `20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql` |
| Users can view their own profile | SELECT | authenticated | `auth.uid() = id` | — | `20251016064350_7ace660c-3ad8-402b-84db-2739d3e6fb38.sql` |
| Admins can view all profiles | SELECT | authenticated | `has_role(auth.uid(), 'Admin'::app_role)` | — | `20251016064350_7ace660c-3ad8-402b-84db-2739d3e6fb38.sql` |
| Contractors can view their own profile | SELECT | PUBLIC (no TO; gated by expr) | `has_role(auth.uid(), 'Contractor'::app_role) AND id = auth.uid()` | — | `20251119090820_296d33c0-ea98-46ca-84c8-c43f543484d9.sql` |

Notes: row auto-created on signup by `handle_new_user()` trigger (service-role context, bypasses RLS). No DELETE policy → no role can DELETE except service_role. The "Contractors can view their own profile" SELECT is functionally redundant with "Users can view their own profile" (both reduce to own-row). Not touched by tier-2 (no `qual='true'` SELECT policy survives).

Access summary:
- **anon**: no access (every effective policy gates via `auth.uid()`/`has_role`).
- **authenticated**: SELECT own row (all rows if Admin); UPDATE own row; INSERT own row; no DELETE.
- **service_role**: full access (RLS bypass); used by the signup trigger to create rows.

---

## public.auth_events

RLS: **ENABLED** (`20260525120000_auth_events_audit.sql`). Not FORCED. (Migration ends with `NOTIFY pgrst, 'reload schema'`.)

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| auth_events: user reads own | SELECT | authenticated | `user_id = auth.uid()` | — | `20260525120000_auth_events_audit.sql` |

Notes: this is the only policy. **No INSERT/UPDATE/DELETE policy by design** — only service_role (RLS bypass) can write audit rows. Table has **no FK to `auth.users`** (rows survive user deletion); `event_type` carries an 11-value CHECK constraint (see tables reference). Not touched by tier-2 (qual is `user_id = auth.uid()`, not `true`).

Access summary:
- **anon**: no access.
- **authenticated**: SELECT only own audit rows; cannot write.
- **service_role**: full access (RLS bypass); sole writer of audit rows.

---

## public.clients

RLS: **ENABLED** (`20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`). Not FORCED.

Heavily churned history. Superseded/dropped policies (chronological): the four original `auth.role()='authenticated'` CRUD policies (`20251014114352`, re-scoped to `TO authenticated` in `20251016064350`) and several anon QR-read policies were all **dropped** by `20251119090707_b34c56a3-76db-41b6-8553-9c2ab1c86cc8.sql` and `20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql`. Anon-read policies that came and went: `Public users can view clients` (anon, created `20251015102828`, dropped `20251016035546`); `Public can view client basic info` (PUBLIC, created `20251016104322`, dropped `20251017094000`); `Public QR code access to client info` (PUBLIC, created `20251020065437`, dropped `20251120080517`). Role-scoped set from `20251119090707` (`Admins can view all clients`, `Contractors can view clients for their sites`, `Admins can manage clients`) was **dropped** `20251120080517`, replaced by a single blanket `All authenticated users full access to clients` (`FOR ALL`, `auth.uid() IS NOT NULL`), which was itself **dropped** `20260610120000_phase1_write_lockdown.sql`.

Effective policies:

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Staff manage clients | ALL | authenticated | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `20260610120000_phase1_write_lockdown.sql` |
| auth_read_clients | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

Tier-2 rewrite: at end of migrations the effective anon-read policy was `Public can view clients` (SELECT, PUBLIC, `USING(true)`, created `20260108071956_61a3cdd4-0e0d-414e-a0aa-db2c0a258935.sql`). Tier-2 matched it (`cmd=SELECT, qual='true', roles={public}`), **dropped** it, and created `auth_read_clients` above. The `Staff manage clients` FOR-ALL policy is untouched by tier-2.

Notes: "Staff" = any authenticated user that is neither Contractor nor Client. Before tier-2, anon could read all clients via `Public can view clients`; after tier-2, anon read is closed.

Access summary:
- **anon**: **no access** (post tier-2; previously full SELECT).
- **authenticated**: SELECT all rows (`auth_read_clients`); INSERT/UPDATE/DELETE only as Staff (not Contractor, not Client). Contractors/Clients get SELECT (via `auth_read_clients`) but no write.
- **service_role**: full access (RLS bypass).

---

## public.coc_compliance_photos

RLS: **ENABLED** (`20260310083442_1b964afb-fbe3-4c55-9ad2-531d76c72522.sql`). Not FORCED.

Superseded: the four role-scoped policies from `20260310083442` (`Admins can manage all COC photos`, `Users can manage all COC photos`, `Contractors can view COC photos for assigned sites`, `Users can manage their own COC photos`) were all **dropped** `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` and collapsed to a single blanket policy.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access (coc_compliance_photos) | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |

Notes: the dropped `20260310083442` policies passed role literals as **bare text** (`'Admin'`, `'User'`, `'Contractor'`) without `::app_role` cast — irrelevant now (all dropped). Not touched by tier-2: the surviving policy is `FOR ALL` (`cmd='ALL'`), not a `cmd='SELECT'` policy, so the tier-2 scan does not match it.

Access summary:
- **anon**: no access (policy is `TO authenticated`).
- **authenticated**: full CRUD on all rows (blanket access; no role/site scoping).
- **service_role**: full access (RLS bypass).

---

## public.coc_extractions

RLS: **ENABLED** (`20260113062616_960f2100-566c-454c-9738-b22646ec4836.sql`). Not FORCED.

Superseded: original write policies `Authenticated users can create/update/delete extractions` (`20260113062616`) → dropped/replaced one migration later by `Users can create their own extractions` / `Users can update extractions` / `Users can delete extractions` (`20260113062636_77327e63-3e41-4a7f-a70f-87a2706690ab.sql`), which were themselves **dropped** by `20260610120000_phase1_write_lockdown.sql` and replaced with `Staff manage coc_extractions`. The original SELECT policy `Users can view their own organization extractions` (SELECT, PUBLIC, `USING(true)`; despite its name it was unrestricted) was never dropped by migration but is rewritten by tier-2.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Staff manage coc_extractions | ALL | authenticated | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `20260610120000_phase1_write_lockdown.sql` |
| auth_read_coc_extractions | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

Tier-2 rewrite: `Users can view their own organization extractions` had `qual='true'` and PUBLIC roles → tier-2 **dropped** it and created `auth_read_coc_extractions`.

Notes: the edge function `extract-coc` writes via service_role (bypasses RLS); `Staff manage coc_extractions` admits only Staff (non-Contractor, non-Client) for manual correction.

Access summary:
- **anon**: **no access** (post tier-2; previously full SELECT via the unrestricted-named policy).
- **authenticated**: SELECT all rows (`auth_read_coc_extractions`); write only as Staff.
- **service_role**: full access (RLS bypass); primary writer via `extract-coc`.

---

## public.coc_local_validations

RLS: **ENABLED** (`20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql`). Not FORCED. No policy ever dropped/superseded.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage all COC local validations | ALL | authenticated | `public.has_role(auth.uid(), 'Admin'::app_role)` | `public.has_role(auth.uid(), 'Admin'::app_role)` | `20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql` |
| Users can manage all COC local validations | ALL | authenticated | `public.has_role(auth.uid(), 'User'::app_role)` | `public.has_role(auth.uid(), 'User'::app_role)` | `20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql` |
| Contractors can view COC local validations for assigned sites | SELECT | authenticated | `public.has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT us.site_id FROM public.user_sites us WHERE us.user_id = auth.uid())` | — | `20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql` |
| Users can view own COC local validations | SELECT | authenticated | `created_by = auth.uid()` | — | `20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql` |

Notes: not touched by tier-2 (no `qual='true'` SELECT policy). Role literals use the `::app_role` cast.

Access summary:
- **anon**: no access (all policies `TO authenticated`).
- **authenticated**: Admin/User roles get full CRUD on all rows; Contractors SELECT only rows for their assigned sites; any user SELECTs rows they created (`created_by = auth.uid()`). A user with neither Admin nor User role and no matching site/created_by sees nothing and cannot write.
- **service_role**: full access (RLS bypass).

---

## public.coc_validations

RLS: **ENABLED** (`20251016111626_9fa96ad4-bc65-4ec9-b54f-41023f815b12.sql`). Not FORCED.

Superseded: original `Authenticated users can view/create/update COC validations` (`auth.role()='authenticated'`, `20251016111626`) **dropped** `20251119090820_296d33c0-ea98-46ca-84c8-c43f543484d9.sql`, replaced by `Admins can manage COC validations` + `Contractors can view COC validations for their sites`; those **dropped** `20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql`, replaced by blanket `All authenticated users full access to coc_validations` (`FOR ALL`, `auth.uid() IS NOT NULL`); that **dropped** `20260610120000_phase1_write_lockdown.sql`, replaced by `Staff manage coc_validations`.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Staff manage coc_validations | ALL | authenticated | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `20260610120000_phase1_write_lockdown.sql` |
| auth_read_coc_validations | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

Tier-2 rewrite: `Public can view coc_validations` (SELECT, PUBLIC, `USING(true)`, created `20260123052442_27d0f826-373b-45e8-b6a3-bb0a40fe67f3.sql` for public review pages) matched tier-2 → **dropped**, replaced by `auth_read_coc_validations`.

Access summary:
- **anon**: **no access** (post tier-2; previously full SELECT via `Public can view coc_validations`).
- **authenticated**: SELECT all rows (`auth_read_coc_validations`); write only as Staff (non-Contractor, non-Client).
- **service_role**: full access (RLS bypass).

---

## public.contractor_coc_uploads

RLS: **ENABLED** (`20260410013045_e3990969-d3ba-4378-94ca-bfa2e8d541b3.sql`). Not FORCED.

Policies as created (none use a `TO` role → all default to PUBLIC, including anon):

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| allow insert | INSERT | PUBLIC (no TO; **incl. anon**) | — | `true` | `20260410013045_e3990969-d3ba-4378-94ca-bfa2e8d541b3.sql` |
| allow update | UPDATE | PUBLIC (no TO; **incl. anon**) | `true` | — (**no WITH CHECK**) | `20260410013045_e3990969-d3ba-4378-94ca-bfa2e8d541b3.sql` |
| auth_read_contractor_coc_uploads | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

Tier-2 rewrite: the original `allow read` (SELECT, PUBLIC, `USING(true)`) matched tier-2 (`cmd=SELECT, qual='true', roles={public}`) → **dropped** and replaced by `auth_read_contractor_coc_uploads`. The `allow insert` and `allow update` PUBLIC write policies are `cmd=INSERT`/`cmd=UPDATE`, so tier-2 does **not** touch them.

Notes: **no DELETE policy** → only service_role can delete. The `allow update` policy has **no WITH CHECK** → updated rows are not re-validated. ⚠️ Anon retains unrestricted INSERT and UPDATE on this table even after tier-2 (tier-2 only closes anon *read*).

Access summary:
- **anon**: **INSERT and UPDATE any row** (unrestricted); **no SELECT** (post tier-2); no DELETE.
- **authenticated**: SELECT all rows (`auth_read_contractor_coc_uploads`); INSERT/UPDATE any row; no DELETE.
- **service_role**: full access (RLS bypass).

---

## public.document_categories

RLS: **ENABLED** (`20251014140001_3adc740c-7446-410a-a427-957d649c4e3c.sql`). Not FORCED.

Heavily churned. Superseded chain: original `Authenticated users can manage document categories` (`FOR ALL`, `auth.role()='authenticated'`, `20251014140001`) **dropped** `20251119090820`, replaced by `Admins can manage` + `Contractors can view ... for their sites`; those **dropped** `20251120080517`, replaced by blanket `All authenticated users full access to document_categories`; that **dropped** `20251120110544_4e89ad10-205d-44f0-9308-05167a2a3326.sql`, replaced by role-scoped `Admins can manage all` + `Clients can view ... for their sites` + `Contractors can view ... for assigned sites` (+ `Users can manage all` added `20251120111033`); those four **dropped** `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql`, replaced by blanket `All authenticated users full access (document_categories)`. Anon-read policies came and went: `Public users can view document categories` (anon, `20251015102828` → dropped `20251016035546`); `Public can view document categories` (PUBLIC, `20251020065547` → dropped `20251120080517`).

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access (document_categories) | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |
| auth_read_document_categories | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

Tier-2 rewrite: the surviving anon-read policy `Public can view document categories` (SELECT, PUBLIC, `USING(true)`, re-created `20260108071956_61a3cdd4-0e0d-414e-a0aa-db2c0a258935.sql`; the `20260406131029` migration comment notes it was intentionally retained) matched tier-2 → **dropped**, replaced by `auth_read_document_categories`. The `FOR ALL` blanket policy is untouched.

Notes: two `USING(true)` policies now coexist for authenticated SELECT (the `FOR ALL` one and `auth_read_document_categories`); both being permissive, the effective grant is unchanged (authenticated reads all).

Access summary:
- **anon**: **no access** (post tier-2; previously full SELECT via `Public can view document categories`).
- **authenticated**: full CRUD on all rows (blanket `FOR ALL`); SELECT also via `auth_read_document_categories`. No role/site scoping survives.
- **service_role**: full access (RLS bypass).

---

## public.floor_plan_pin_comments

RLS: **ENABLED** (`20251120102352_9e71ab8f-203e-4876-9207-b010022c3232.sql`). Not FORCED.

Superseded: the four original per-user policies (`Authenticated users can view comments`, `Authenticated users can create comments`, `Users can update their own comments`, `Users can delete their own comments`, all `20251120102352`) were **dropped** `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` and collapsed to a single blanket policy.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access (floor_plan_pin_comments) | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |

Notes: not touched by tier-2 (surviving policy is `FOR ALL`, not `cmd='SELECT'`). The dropped per-user UPDATE/DELETE scoping (`auth.uid() = user_id`) is gone — any authenticated user may now edit/delete any comment.

Access summary:
- **anon**: no access (policy is `TO authenticated`).
- **authenticated**: full CRUD on all rows (blanket access; no ownership scoping).
- **service_role**: full access (RLS bypass).

---

## public.floor_plan_pins

RLS: **ENABLED** (`20251027115044_3a5a0a85-6c4a-4c4e-8d8d-e2e91cf6a078.sql`). Not FORCED.

Heavily churned. Superseded chain: original four policies (`Users can view pins for accessible floor plans`, `Authenticated users can insert pins`, `Users can update pins`, `Users can delete pins`, `20251027115044`) **dropped** `20251120080517`, replaced by blanket `All authenticated users full access to floor_plan_pins`; that **dropped** `20251120110544_4e89ad10-205d-44f0-9308-05167a2a3326.sql`, replaced by role-scoped `Admins can manage all` + `Clients can view ... for their sites` + `Contractors can view ... for assigned sites` (+ `Users can manage all` added `20251120111033`); those four **dropped** `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql`, replaced by blanket `All authenticated users full access (floor_plan_pins)`.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access (floor_plan_pins) | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |
| auth_read_floor_plan_pins | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

Tier-2 rewrite: `Public can view floor_plan_pins` (SELECT, PUBLIC, `USING(true)`, created `20260123052442_27d0f826-373b-45e8-b6a3-bb0a40fe67f3.sql` for public review pages; the `20260406131029` migration comment notes it was intentionally retained) matched tier-2 → **dropped**, replaced by `auth_read_floor_plan_pins`. The `FOR ALL` blanket policy is untouched.

Access summary:
- **anon**: **no access** (post tier-2; previously full SELECT via `Public can view floor_plan_pins`).
- **authenticated**: full CRUD on all rows (blanket `FOR ALL`); SELECT also via `auth_read_floor_plan_pins`. No role/site scoping survives.
- **service_role**: full access (RLS bypass).

---

## public.inspection_items

RLS: **ENABLED** (`20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`). Not FORCED.

Heavily churned. Superseded chain: original four `auth.role()='authenticated'` policies (view/create/update/delete items, `20251014114352`) **dropped** `20251119090820_296d33c0-ea98-46ca-84c8-c43f543484d9.sql`, replaced by `Admins can manage inspection items` + `Contractors can view ... for their sites`; those **dropped** `20251120080517`, replaced by blanket `All authenticated users full access to inspection_items`; that **dropped** `20251120110544`, replaced by `Admins can manage all` + `Contractors can view ... for assigned sites` (+ `Users can manage all` added `20251120111033`; **no Client SELECT policy** was created here, unlike the sibling tables); those three **dropped** `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql`, replaced by blanket `All authenticated users full access (inspection_items)`.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access (inspection_items) | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |

Notes: **not touched by tier-2** — `inspection_items` never had a surviving anon/PUBLIC `cmd='SELECT' qual='true'` policy (no `Public can view inspection_items` was ever created), and the final policy is `FOR ALL`. So no `auth_read_inspection_items` policy was added.

Access summary:
- **anon**: no access (policy is `TO authenticated`).
- **authenticated**: full CRUD on all rows (blanket access; no role/site scoping).
- **service_role**: full access (RLS bypass).
