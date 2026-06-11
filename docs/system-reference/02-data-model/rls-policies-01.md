# Effective RLS Policy Reference — Part 1 (A–C tables)

Scope: `access_link_visitors`, `activity_logs`, `api_access_tokens`, `api_clients`, `api_request_logs`, `auth_events`, `calendar_events`, `client_access_links`, `clients`, `coc_compliance_photos`, `coc_extractions`, `coc_local_validations`, `coc_validation_settings`, `coc_validations`.

Method: effective state = replay of all migration DDL events in chronological order (migration filename order across `_work/migration-events-01.json` … `-10.json`), then the out-of-band production SQL `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` applied LAST.

Conventions used below:
- "TO PUBLIC" = policy created with **no `TO` clause**; in Postgres this applies to **every** role including `anon`. Where the USING/WITH CHECK expression contains `auth.uid() IS NOT NULL` / `auth.role() = 'authenticated'` / `has_role(...)`, anon is gated out by the expression even though the policy nominally targets PUBLIC.
- All policies are PERMISSIVE (none were created `AS RESTRICTIVE` anywhere in the log).
- `has_role(uid, role)` is the SECURITY DEFINER helper over `user_roles` (defined `20251014120311`).
- service_role bypasses RLS entirely; it is only ever *named* in a `TO service_role` policy on the `api_*` tables. Everywhere else service_role still has full access via bypass.
- The tier-2 lockdown (`APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`) scans **all** public tables and, for any table with a `cmd=SELECT AND qual='true' AND roles ∈ {public}|contains anon` policy (except `settings`), drops those policies and creates `auth_read_<table>` = `FOR SELECT TO authenticated USING (true)`. Tables affected within this file's scope: **clients**, **coc_extractions**, **coc_validations**, **client_access_links**.

---

## access_link_visitors

RLS: **ENABLED** (`20260217082506_a2247d71-37f4-49d4-bb28-fbb9724692fd.sql`). Not FORCED.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Anyone can register as visitor | INSERT | PUBLIC (no TO; incl. anon) | — | `true` | `20260217082506_a2247d71-37f4-49d4-bb28-fbb9724692fd.sql` |
| Admins can view visitors | SELECT | PUBLIC (no TO; gated by expr) | `public.has_role(auth.uid(), 'Admin')` | — | `20260217082506_a2247d71-37f4-49d4-bb28-fbb9724692fd.sql` |

Notes: role literal `'Admin'` is passed without `::app_role` cast. No UPDATE/DELETE policy → only service_role can update/delete. Not touched by tier-2 (no `qual='true'` SELECT policy).

Access summary:
- **anon**: may INSERT visitor rows (register); cannot SELECT/UPDATE/DELETE.
- **authenticated**: may INSERT; may SELECT only if Admin role; no UPDATE/DELETE.
- **service_role**: full access (RLS bypass).

---

## activity_logs

RLS: **ENABLED** (`20251014132137_627a24bc-ffbf-499d-bd22-96df6a7f3bfc.sql`). Not FORCED.

Superseded: the original `20251014132137` SELECT "Authenticated users can view activity logs" and INSERT "Authenticated users can insert activity logs" were both **dropped** in `20251016035250_e064da77-54b8-4ded-809b-a6681d97c458.sql` and replaced with per-user policies.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Users can view their own activity logs | SELECT | authenticated | `auth.uid() = user_id` | — | `20251016035250_e064da77-54b8-4ded-809b-a6681d97c458.sql` |
| Admins can view all activity logs | SELECT | authenticated | `public.has_role(auth.uid(), 'Admin'::app_role)` | — | `20251016035250_e064da77-54b8-4ded-809b-a6681d97c458.sql` |
| Users can insert their own activity logs | INSERT | authenticated | — | `auth.uid() = user_id` | `20251016035250_e064da77-54b8-4ded-809b-a6681d97c458.sql` |
| Contractors can view their own activity logs | SELECT | PUBLIC (no TO; gated by expr) | `has_role(auth.uid(), 'Contractor'::app_role) AND user_id = auth.uid()` | — | `20251119090820_296d33c0-ea98-46ca-84c8-c43f543484d9.sql` |

Notes: no UPDATE/DELETE policy → no role can UPDATE/DELETE except service_role. The `AFTER INSERT` statement trigger `trigger_cleanup_activity_logs` (`20251020070622`) trims the table to the latest 20 rows on every insert. Not touched by tier-2.

Access summary:
- **anon**: no access.
- **authenticated**: INSERT only rows where `user_id = auth.uid()`; SELECT own rows (and all rows if Admin; Contractors' own-row SELECT is redundant with the per-user policy). No UPDATE/DELETE.
- **service_role**: full access (RLS bypass).

---

## api_access_tokens

RLS: **ENABLED** (`20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql`). Not FORCED.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Service role manages tokens | ALL | service_role | `true` | `true` | `20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql` |

Notes: the only policy. Reads/writes by app code go through the SECURITY DEFINER `validate_api_token(text)` RPC (`20260110172925`), which runs as owner and bypasses RLS. Token secrets default-generated via `encode(gen_random_bytes(...), 'hex')`. Not touched by tier-2.

Access summary:
- **anon**: no access.
- **authenticated**: no access (no policy targets it).
- **service_role**: full access (explicit policy + RLS bypass).

---

## api_clients

RLS: **ENABLED** (`20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql`). Not FORCED.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage API clients | ALL | authenticated | `public.has_role(auth.uid(), 'Admin')` | `public.has_role(auth.uid(), 'Admin')` | `20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql` |

Notes: role literal `'Admin'` is bare text (no `::app_role` cast). No service_role policy, but service_role bypasses RLS. Not touched by tier-2.

Access summary:
- **anon**: no access.
- **authenticated**: full CRUD only if Admin role; otherwise no access.
- **service_role**: full access (RLS bypass).

---

## api_request_logs

RLS: **ENABLED** (`20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql`). Not FORCED.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can view API logs | SELECT | authenticated | `public.has_role(auth.uid(), 'Admin')` | — | `20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql` |
| Service role manages logs | ALL | service_role | `true` | `true` | `20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql` |

Notes: `'Admin'` bare-text literal. Authenticated non-Admins have no access. Not touched by tier-2.

Access summary:
- **anon**: no access.
- **authenticated**: SELECT only if Admin role; no write.
- **service_role**: full access (explicit policy + RLS bypass).

---

## auth_events

RLS: **ENABLED** (`20260525120000_auth_events_audit.sql`). Not FORCED.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| auth_events: user reads own | SELECT | authenticated | `user_id = auth.uid()` | — | `20260525120000_auth_events_audit.sql` |

Notes: **By design there is NO INSERT/UPDATE/DELETE policy** — writes are service-role only (RLS bypass); POPIA §16/§24 audit trail. `user_id` has **no FK** to `auth.users`, so rows survive user deletion. `event_type` carries an 11-value CHECK: `login, logout, password_changed, password_reset_requested, magic_link_requested, lockout, mfa_enrolled, mfa_unenrolled, account_deleted, account_email_changed, user_created`. Migration also emits `NOTIFY pgrst, 'reload schema'`. Not touched by tier-2 (SELECT policy qual is `user_id = auth.uid()`, not `true`).

Access summary:
- **anon**: no access.
- **authenticated**: SELECT only own rows (`user_id = auth.uid()`); cannot write.
- **service_role**: full access (RLS bypass) — the only writer.

---

## calendar_events

RLS: **ENABLED** (`20251014132137_627a24bc-ffbf-499d-bd22-96df6a7f3bfc.sql`). Not FORCED.

History: original `20251014132137` per-command authenticated policies (view/create/update/delete via `auth.role() = 'authenticated'`) were partly replaced in `20251119090707` (SELECT split into Admin/Contractor + role-scoped writes), then **all of those were dropped** in `20251120080517` and replaced by a single blanket policy.

Currently effective:

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access to calendar_events | ALL | PUBLIC (no TO; gated by expr) | `auth.uid() IS NOT NULL` | `auth.uid() IS NOT NULL` | `20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql` |

Notes: the `20251119090707` Admin/Contractor SELECT policies and the original authenticated CRUD policies were all dropped in `20251120080517`; this blanket policy is the sole survivor. No later migration in scope re-scoped calendar_events. Not touched by tier-2 (no `qual='true'` SELECT policy; the blanket policy is `cmd=ALL` with qual `auth.uid() IS NOT NULL`). Anon excluded by the expression.

Access summary:
- **anon**: no access.
- **authenticated**: full CRUD on all rows (any logged-in user, no role/site scoping).
- **service_role**: full access (RLS bypass).

---

## client_access_links

RLS: **ENABLED** (`20260122090622_9c76c44a-8b4a-4666-807a-e523b21acfea.sql`). Not FORCED.

History: a permissive `FOR UPDATE USING(true) WITH CHECK(true)` policy "Allow tracking updates via token" was created in `20260123052554` and **dropped** in `20260123052614`, which instead created the public SELECT policy below. The token-tracking UPDATE is now performed inside the SECURITY DEFINER `validate_access_link(text)` RPC (final version `20260123052657`, granted to anon + authenticated) and the `_share_link(p_token)` helper (`20260610113000`, REVOKE ALL FROM PUBLIC — never granted to anon/authenticated).

Effective policies **before** tier-2:
- "Admins can manage access links" — FOR ALL, PUBLIC, USING `EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')`, no WITH CHECK (`20260122090622`).
- "Public can select access_links for validation" — FOR SELECT, PUBLIC (incl. anon), USING `true` (`20260123052614`).

**Tier-2 applies last:** "Public can select access_links for validation" matches the drop criterion (`cmd=SELECT, qual='true', roles={public}`) → dropped and replaced by `auth_read_client_access_links`.

Currently effective:

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage access links | ALL | PUBLIC (no TO; gated by expr) | `EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')` | — (FOR ALL w/o WITH CHECK reuses USING) | `20260122090622_9c76c44a-8b4a-4666-807a-e523b21acfea.sql` |
| auth_read_client_access_links | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

Notes: role check queries `user_roles` directly (not via `has_role`). After tier-2, anon can no longer SELECT rows directly — but the anon-granted `validate_access_link` RPC still resolves a token (runs as definer, bypassing RLS), so QR/magic-link validation continues to work. `_share_link` is **not** anon-callable.

Access summary:
- **anon**: no table SELECT; no write. Can resolve a token only via the SECURITY DEFINER `validate_access_link(text)` RPC.
- **authenticated**: SELECT all rows (`auth_read_…`); full CRUD only if Admin.
- **service_role**: full access (RLS bypass).

---

## clients

RLS: **ENABLED** (`20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql`). Not FORCED.

History (write side, heavily churned):
- Original `20251014114352` authenticated per-command CRUD (`auth.role() = 'authenticated'`); re-scoped with explicit `TO authenticated` in `20251016064350`.
- `20251119090707` dropped the authenticated view/create/update/delete set; added Admin/Contractor SELECT + "Admins can manage clients" (FOR ALL).
- `20251120080517` dropped all of those (incl. anon "Public QR code access to client info") and created blanket "All authenticated users full access to clients".
- `20260610120000_phase1_write_lockdown.sql` dropped the blanket policy and created "Staff manage clients".

Anon SELECT history: multiple anon `USING(true)` SELECT policies created/dropped over time (`20251015102828`→dropped `20251016035546`; `20251016035546`/`20251016104322`/`20251020065437` variants dropped by `20251017094000`/`20251119090707`/`20251120080517`). The **last** anon SELECT created was "Public can view clients" `FOR SELECT USING (true)` (PUBLIC, incl. anon) in `20260108071956`; it survived the write-only `20260610120000` lockdown and is removed only by tier-2.

**Tier-2 applies last:** "Public can view clients" matches the drop criterion → dropped, replaced by `auth_read_clients`.

Currently effective:

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Staff manage clients | ALL | authenticated | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `20260610120000_phase1_write_lockdown.sql` |
| auth_read_clients | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

Notes: "Staff" = any authenticated user that is **not** Contractor and **not** Client. Read access is broader than write: `auth_read_clients` lets any authenticated user SELECT, while only Staff may write. Public RPCs (`get_public_portfolio`, `get_public_site_review`) expose client fields to anon **only** for a valid token, via SECURITY DEFINER — not via these table policies.

Access summary:
- **anon**: no table access (tier-2 closed the last anon read). Client data reaches anon only through token-scoped SECURITY DEFINER RPCs.
- **authenticated**: SELECT all rows; INSERT/UPDATE/DELETE only if Staff (not Contractor, not Client). (Contractor/Client read-scoping policies were dropped in `20251120080517` and never restored — they now read all rows via `auth_read_clients`.)
- **service_role**: full access (RLS bypass).

---

## coc_compliance_photos

RLS: **ENABLED** (`20260310083442_1b964afb-fbe3-4c55-9ad2-531d76c72522.sql`). Not FORCED.

History: created `20260310083442` with four role-scoped policies (Admins manage all / Users manage all / Contractors view assigned / Users manage own — all using **bare-text** role literals `'Admin'`/`'User'`/`'Contractor'` without `::app_role` cast). All four were **dropped** in `20260406131029` and replaced by one blanket policy.

Currently effective:

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access (coc_compliance_photos) | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql` |

Notes: the policy's literal name in the migration is "All authenticated users full access (coc_compliance_photos)". Not touched by tier-2 (no `qual='true'` SELECT policy; the surviving policy is `cmd=ALL`). The bucket `coc-photos` is `public=true` with a `TO public` storage SELECT policy → object **files** are anon-readable via storage even though this table is not.

Access summary:
- **anon**: no table access. (Underlying photo files in the `coc-photos` bucket are anon-readable via storage.)
- **authenticated**: full CRUD on all rows (any logged-in user).
- **service_role**: full access (RLS bypass).

---

## coc_extractions

RLS: **ENABLED** (`20260113062616_960f2100-566c-454c-9738-b22646ec4836.sql`). Not FORCED.

History:
- Created `20260113062616` with SELECT "Users can view their own organization extractions" `USING(true)` (no TO → PUBLIC, incl. anon — despite the name) plus authenticated INSERT/UPDATE/DELETE (`auth.uid() IS NOT NULL`).
- `20260113062636` dropped those three write policies and created "Users can create their own extractions" (INSERT, `auth.uid() = extracted_by OR extracted_by IS NULL`), "Users can update extractions" / "Users can delete extractions" (existence-only `EXISTS(...document chain...)`).
- `20260610120000_phase1_write_lockdown.sql` dropped all three of those and created "Staff manage coc_extractions". The SELECT `USING(true)` policy was left in place at that point.

**Tier-2 applies last:** "Users can view their own organization extractions" (SELECT, PUBLIC, `qual='true'`) matches the drop criterion → dropped, replaced by `auth_read_coc_extractions`.

Currently effective:

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Staff manage coc_extractions | ALL | authenticated | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `20260610120000_phase1_write_lockdown.sql` |
| auth_read_coc_extractions | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

Notes: the edge function `extract-coc` writes via service_role (RLS bypass); the Staff policy admits only staff for manual correction. One extraction per document (UNIQUE index on `document_id`).

Access summary:
- **anon**: no access (tier-2 closed the last anon read).
- **authenticated**: SELECT all rows; INSERT/UPDATE/DELETE only if Staff (not Contractor, not Client).
- **service_role**: full access (RLS bypass) — the extraction writer.

---

## coc_local_validations

RLS: **ENABLED** (`20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql`). Not FORCED.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage all COC local validations | ALL | authenticated | `public.has_role(auth.uid(), 'Admin'::app_role)` | `public.has_role(auth.uid(), 'Admin'::app_role)` | `20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql` |
| Users can manage all COC local validations | ALL | authenticated | `public.has_role(auth.uid(), 'User'::app_role)` | `public.has_role(auth.uid(), 'User'::app_role)` | `20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql` |
| Contractors can view COC local validations for assigned sites | SELECT | authenticated | `public.has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT us.site_id FROM public.user_sites us WHERE us.user_id = auth.uid())` | — | `20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql` |
| Users can view own COC local validations | SELECT | authenticated | `created_by = auth.uid()` | — | `20260309172544_38b551b2-3b98-4cc4-ba4c-0877f2bb8156.sql` |

Notes: no anon policy; not touched by tier-2. Properly role-scoped (one of the few tables that kept granular scoping). `'User'`/`'Admin'`/`'Contractor'` carry `::app_role` casts here.

Access summary:
- **anon**: no access.
- **authenticated**: Admins → full CRUD all rows; Users (`'User'` role) → full CRUD all rows; Contractors → SELECT only for their assigned sites; any user → SELECT own rows (`created_by = auth.uid()`). No INSERT/UPDATE/DELETE for plain Contractors or non-User/non-Admin creators beyond their own-row reads.
- **service_role**: full access (RLS bypass).

---

## coc_validation_settings

RLS: **ENABLED** (`20260116052034_3ec8c385-2428-402e-9763-a9871451eb55.sql`). Not FORCED.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage COC validation settings | ALL | PUBLIC (no TO; gated by expr) | `public.has_role(auth.uid(), 'Admin')` | `public.has_role(auth.uid(), 'Admin')` | `20260116052034_3ec8c385-2428-402e-9763-a9871451eb55.sql` |
| Authenticated users can read COC validation settings | SELECT | PUBLIC (no TO; gated by expr) | `auth.uid() IS NOT NULL` | — | `20260116052034_3ec8c385-2428-402e-9763-a9871451eb55.sql` |

Notes: `'Admin'` bare-text literal. Both policies have no `TO` clause but the expressions exclude anon. Not touched by tier-2 (the SELECT qual is `auth.uid() IS NOT NULL`, not `true`). A single default settings row is seeded at migration time.

Access summary:
- **anon**: no access.
- **authenticated**: SELECT all rows (any logged-in user); INSERT/UPDATE/DELETE only if Admin.
- **service_role**: full access (RLS bypass).

---

## coc_validations

RLS: **ENABLED** (`20251016111626_9fa96ad4-bc65-4ec9-b54f-41023f815b12.sql`). Not FORCED.

History (write side churned):
- Original `20251016111626` SELECT/INSERT/UPDATE policies (`auth.role() = 'authenticated'`, no TO clause).
- `20251119090820` dropped those three and created "Admins can manage COC validations" (FOR ALL) + "Contractors can view COC validations for their sites" (SELECT).
- `20251120080517` dropped those two and created blanket "All authenticated users full access to coc_validations".
- `20260610120000_phase1_write_lockdown.sql` dropped the blanket policy and created "Staff manage coc_validations".

Anon SELECT: "Public can view coc_validations" `FOR SELECT USING(true)` (PUBLIC, incl. anon) created `20260123052442`; survived the write-only `20260610120000` lockdown.

**Tier-2 applies last:** "Public can view coc_validations" matches the drop criterion → dropped, replaced by `auth_read_coc_validations`.

Currently effective:

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Staff manage coc_validations | ALL | authenticated | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'Contractor'::app_role) AND NOT public.has_role(auth.uid(), 'Client'::app_role)` | `20260610120000_phase1_write_lockdown.sql` |
| auth_read_coc_validations | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

Notes: COC validation status reaches anon public review pages only via the token-scoped SECURITY DEFINER RPCs (`get_public_subsection`, `get_public_site_review`, `get_public_subsection_review`), not via these table policies. UNIQUE(`document_id`); `status` CHECK widened to `Pass/Fail/Pending/Error/Incomplete` (`20251016113423`).

Access summary:
- **anon**: no table access (tier-2 closed the last anon read). Reaches anon only through token-scoped SECURITY DEFINER RPCs.
- **authenticated**: SELECT all rows; INSERT/UPDATE/DELETE only if Staff (not Contractor, not Client). The Contractor site-scoped SELECT policy from `20251119090820` was dropped in `20251120080517` and never restored — contractors now read all rows via `auth_read_coc_validations`.
- **service_role**: full access (RLS bypass).

---

## Cross-table observations (in scope)

- **Tier-2 net effect within scope**: exactly four tables had a live anon/public `USING(true)` SELECT policy at the moment tier-2 ran — `clients`, `coc_extractions`, `coc_validations`, `client_access_links` — each now carries `auth_read_<table>` (SELECT, authenticated, true) instead. Anon table reads on these are closed; anon data access survives only through explicitly anon-granted SECURITY DEFINER RPCs.
- **"Staff" boundary** (`auth.uid() IS NOT NULL AND NOT Contractor AND NOT Client`) governs the **write** side of `clients`, `coc_validations`, `coc_extractions` (all from `20260610120000`). It is asymmetric with the read side, which is open to all authenticated users via the tier-2 `auth_read_*` policies.
- **Blanket authenticated-full-access** (`auth.uid() IS NOT NULL`, FOR ALL, PUBLIC-targeted) is the sole policy on `calendar_events` (and on `coc_compliance_photos` via the `true`/`true` variant) — no role/site scoping survives for those.
- **Role-literal casting inconsistency**: `api_clients`, `api_request_logs`, `coc_validation_settings`, `access_link_visitors`, and the (now-dropped) original `coc_compliance_photos` policies use bare-text `'Admin'`/`'User'`/`'Contractor'` without `::app_role`; `coc_local_validations`, `activity_logs`, and the Staff policies use `::app_role` casts. Both forms resolve because `app_role` has a text-coercion path, but the inconsistency is verbatim from the source.
- **Service-role-only-write tables**: `auth_events` (no write policy at all), `api_access_tokens` (only `TO service_role`), `activity_logs` (no UPDATE/DELETE policy).
