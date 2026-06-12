# Effective RLS Policy Reference — Part 05

Tables: `sites`, `snags`, `storage.objects`, `subsection_documents`, `subsection_floor_plans`, `subsections`, `suggestions`, `temp_import`, `user_clients`, `user_policy_overrides`, `user_roles`, `user_sites`, `user_sites_history`, `user_storage_connections`.

Effective state = chronological replay of all migrations, then the dashboard-applied tier-2 lockdown `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` (applied LAST). Citations are `migration-filename` or `APPLIED-tier2`.

## Conventions / cross-cutting facts

- **"no TO clause" defaults to PUBLIC** — a policy with no `TO` role applies to every role including `anon`. Many policies in this set gate access only by an expression (`auth.uid() IS NOT NULL`, `has_role(...)`, etc.) rather than by a `TO authenticated` role list.
- **`FORCE ROW LEVEL SECURITY` is never issued** in any migration for these tables. RLS is `ENABLE`d only ⇒ table owner / `service_role` (BYPASSRLS) bypass policies. Every table below has RLS **enabled, not forced**.
- **`has_role(uid, role)`** is `public.has_role` (`20251014120311`), `SECURITY DEFINER` against `user_roles`. `get_user_client_id()` returns the caller's mapped `client_id` (`20251017054255`).
- **Tier-2 lockdown** (`APPLIED-tier2`) scans `pg_policies WHERE schemaname='public' AND cmd='SELECT' AND qual='true' AND (roles='{public}' OR 'anon'=ANY(roles)) AND tablename NOT IN ('settings')`. For each match it `DROP`s the matched policy and `CREATE`s `auth_read_<table>` = `FOR SELECT TO authenticated USING (true)`. It only touches the **`public` schema**, so `storage.objects` (schema `storage`) is untouched.

---

## sites

RLS: **enabled** (`20251014114352`), not forced.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage all sites | ALL | PUBLIC (no TO) | `has_role(auth.uid(), 'Admin'::app_role)` | `has_role(auth.uid(), 'Admin'::app_role)` | `20251120110544` |
| Clients can view their sites | SELECT | PUBLIC (no TO) | `has_role(auth.uid(), 'Client'::app_role) AND client_id = get_user_client_id()` | — | `20251120110544` |
| Contractors can view assigned sites | SELECT | PUBLIC (no TO) | `has_role(auth.uid(), 'Contractor'::app_role) AND id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())` | — | `20251120110544` |
| Users can manage all sites | ALL | PUBLIC (no TO) | `has_role(auth.uid(), 'User'::app_role)` | `has_role(auth.uid(), 'User'::app_role)` | `20251120111033` |
| auth_read_sites | SELECT | authenticated | `true` | — | `APPLIED-tier2` |

Superseded/dropped: original blanket `Authenticated users can view/create/update/delete sites` (`20251014114352`) dropped by `20251119090707`; QR anon policies `Public users can view sites`→`Public users can view basic site info for QR codes`→`Public QR code access - minimal data only` churned and finally dropped by `20251120080517`; `Admins can view all sites` / `Admins can manage sites` / `Clients can view their own sites` / `Contractors can view their assigned sites` / `All authenticated users full access to sites` all dropped by `20251120080517` / `20251120110544`. The anon `Public can view sites` (FOR SELECT, no TO, `USING (true)`, `20260108071956`) was **dropped by tier-2** and replaced by `auth_read_sites`.

Access summary:
- **anon**: no access (the `Public can view sites` anon read was removed by tier-2).
- **authenticated**: SELECT all rows (`auth_read_sites`); Admin/User additionally full write; Client/Contractor reads are redundant under `auth_read_sites` but harmless.
- **service_role**: full (bypasses RLS).

---

## snags

RLS: **enabled** (`20251016084545`), not forced.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage all snags | ALL | PUBLIC (no TO) | `has_role(auth.uid(), 'Admin'::app_role)` | `has_role(auth.uid(), 'Admin'::app_role)` | `20251120110544` |
| Clients can view snags for their sites | SELECT | PUBLIC (no TO) | `has_role(auth.uid(), 'Client'::app_role) AND subsection_id IN (SELECT s.id FROM subsections s JOIN sites st ON st.id = s.site_id WHERE st.client_id = get_user_client_id())` | — | `20251120110544` |
| Contractors can view snags for assigned sites | SELECT | PUBLIC (no TO) | `has_role(auth.uid(), 'Contractor'::app_role) AND subsection_id IN (SELECT s.id FROM subsections s WHERE s.site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid()))` | — | `20251120110544` |
| Users can manage all snags | ALL | PUBLIC (no TO) | `has_role(auth.uid(), 'User'::app_role)` | `has_role(auth.uid(), 'User'::app_role)` | `20251120111033` |
| auth_read_snags | SELECT | authenticated | `true` | — | `APPLIED-tier2` |

Superseded/dropped: original `Authenticated users can view/create/update their own/delete their own snags` (`20251016084545`) + `Clients can view their snags` (`20251017054255`) + `Admins can view all snags` / `Contractors can view snags for their sites` (`20251119090820`) all dropped by `20251120080517`; `All authenticated users full access to snags` (`20251120080517`) dropped by `20251120110544`. The anon `Public can view snags via subsection ID` (FOR SELECT, no TO, `USING (true)` — despite name, exposes ALL snags; `20260109084016`) was **dropped by tier-2** and replaced by `auth_read_snags`.

Access summary:
- **anon**: no access (anon read removed by tier-2).
- **authenticated**: SELECT all rows (`auth_read_snags`); only Admin and User can write (no INSERT/UPDATE/DELETE path for Client/Contractor).
- **service_role**: full.

---

## storage.objects

RLS: enabled by Supabase platform (no `ENABLE` statement in these migrations); not forced. **Not affected by tier-2** (schema `storage`, not `public`).

Effective policies are the result of `20251120083932` (which dropped ALL prior storage.objects policies via a `DO` loop and recreated four blanket policies) plus the later additive `coc-photos` policies (`20260310083442`, `20260310085611`).

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Anyone can view all storage | SELECT | PUBLIC (no TO) | `true` | — | `20251120083932` |
| Anyone can upload to all storage | INSERT | PUBLIC (no TO) | — | `true` | `20251120083932` |
| Anyone can update all storage | UPDATE | PUBLIC (no TO) | `true` | — (no WITH CHECK) | `20251120083932` |
| Anyone can delete from all storage | DELETE | PUBLIC (no TO) | `true` | — | `20251120083932` |
| Authenticated users can upload COC photos | INSERT | authenticated | — | `bucket_id = 'coc-photos'` | `20260310083442` |
| Anyone can view COC photos | SELECT | public (TO public) | `bucket_id = 'coc-photos'` | — | `20260310083442` |
| Authenticated users can delete own coc-photos | DELETE | authenticated | `bucket_id = 'coc-photos' AND (has_role(auth.uid(), 'Admin'::app_role) OR has_role(auth.uid(), 'User'::app_role) OR auth.uid()::text = owner::text)` | — | `20260310085611` |

Superseded/dropped (all earlier storage.objects policies are gone): the `20251120083541` "full access to all buckets" set and the `20251120081347` documents set were dropped by the `20251120083932` blanket-drop loop; the `20260310083442` `Users can delete their own COC photos` (foldername-based) was dropped by `20260310085611`. Buckets were set `public = true` globally by `UPDATE storage.buckets SET public = true` (no WHERE) in `20251120083541`.

Access summary:
- **anon**: SELECT/INSERT/UPDATE/DELETE on **every object in every bucket** (`Anyone can …` policies, all `USING/WITH CHECK true`). Plus an explicit anon SELECT on `coc-photos`. Effectively wide-open storage.
- **authenticated**: same blanket `Anyone can …` access (PUBLIC includes authenticated); the coc-photos-specific policies are additive (OR-combined) and add nothing beyond the blanket grants.
- **service_role**: full (bypasses RLS).
- ⚠️ This is the most permissive surface in the schema: any anon caller can read, overwrite, and delete arbitrary storage objects.

---

## subsection_documents

RLS: **enabled** (`20251014140001`), not forced.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage subsection documents | ALL | PUBLIC (no TO) | `has_role(auth.uid(), 'Admin'::app_role)` | `has_role(auth.uid(), 'Admin'::app_role)` | `20251119090820` |
| Contractors can view subsection documents for their sites | SELECT | PUBLIC (no TO) | `has_role(auth.uid(), 'Contractor'::app_role) AND subsection_id IN (SELECT s.id FROM subsections s INNER JOIN user_sites us ON us.site_id = s.site_id WHERE us.user_id = auth.uid())` | — | `20251119090820` |
| Clients can view their subsection documents | SELECT | authenticated | `has_role(auth.uid(), 'Client'::app_role) AND subsection_id IN (SELECT id FROM subsections WHERE site_id IN (SELECT id FROM sites WHERE client_id = get_user_client_id()))` | — | `20251017054255` |
| Any authenticated user can upload documents | INSERT | PUBLIC (no TO) | — | `auth.uid() IS NOT NULL` | `20251120080137` |
| Authenticated users can delete documents | DELETE | PUBLIC (no TO) | `auth.uid() IS NOT NULL AND (has_role(auth.uid(), 'Admin'::app_role) OR uploaded_by = auth.uid())` | — | `20251120080137` |
| auth_read_subsection_documents | SELECT | authenticated | `true` | — | `APPLIED-tier2` |

Superseded/dropped: `Authenticated users can manage subsection documents` (`20251014140001`) dropped `20251016064723`; per-command `insert/update/delete` (`20251016064723`) dropped by `20251119090820` (update never re-added at all afterward — **there is no effective UPDATE policy**, so non-Admin updates are blocked); `Contractors/Clients can upload/delete … for their sites` (`20251120045331`) and the interim `Authenticated users can upload subsection documents` / `Users can delete their uploaded documents` (`20251120074459`) all dropped by `20251120080137`. The anon `Public can view subsection documents` (FOR SELECT, no TO, `USING (true)`, `20251016064723`) was **dropped by tier-2** → replaced by `auth_read_subsection_documents`. (The conditional `Public can view subsection_documents` in `20260123052442` was a no-op — its `IF NOT EXISTS` guard saw the existing `qual='true'` SELECT policy and skipped creation.)

Access summary:
- **anon**: no access (the public `USING(true)` SELECT was removed by tier-2).
- **authenticated**: SELECT all (`auth_read_subsection_documents`); INSERT allowed for any authenticated user; DELETE only by Admin or the original uploader; UPDATE only by Admin (`Admins can manage`). Client/Contractor SELECT policies are redundant under `auth_read_…`.
- **service_role**: full.

---

## subsection_floor_plans

RLS: **enabled** (`20251027115044`), not forced.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage all subsection floor plans | ALL | PUBLIC (no TO) | `has_role(auth.uid(), 'Admin'::app_role)` | `has_role(auth.uid(), 'Admin'::app_role)` | `20251120110544` |
| Clients can view subsection floor plans for their sites | SELECT | PUBLIC (no TO) | `has_role(auth.uid(), 'Client'::app_role) AND subsection_id IN (SELECT s.id FROM subsections s JOIN sites st ON st.id = s.site_id WHERE st.client_id = get_user_client_id())` | — | `20251120110544` |
| Contractors can view subsection floor plans for assigned sites | SELECT | PUBLIC (no TO) | `has_role(auth.uid(), 'Contractor'::app_role) AND subsection_id IN (SELECT s.id FROM subsections s WHERE s.site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid()))` | — | `20251120110544` |
| Users can manage all subsection floor plans | ALL | PUBLIC (no TO) | `has_role(auth.uid(), 'User'::app_role)` | `has_role(auth.uid(), 'User'::app_role)` | `20251120111033` |
| auth_read_subsection_floor_plans | SELECT | authenticated | `true` | — | `APPLIED-tier2` |

Superseded/dropped: original `Users can view floor plans … / Authenticated users can insert / Users can update their / Users can delete their` (`20251027115044`) dropped by `20251120080517`; `All authenticated users full access to subsection_floor_plans` (`20251120080517`) dropped by `20251120110544`. The anon `Public can view subsection_floor_plans` (FOR SELECT, no TO, `USING (true)`, `20260123052442`) was **dropped by tier-2** → replaced by `auth_read_subsection_floor_plans`.

Access summary:
- **anon**: no access (anon read removed by tier-2).
- **authenticated**: SELECT all (`auth_read_…`); only Admin and User can write; Client/Contractor SELECT policies redundant.
- **service_role**: full.

---

## subsections

RLS: **enabled** (`20251014123510`), not forced.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage all subsections | ALL | PUBLIC (no TO) | `has_role(auth.uid(), 'Admin'::app_role)` | `has_role(auth.uid(), 'Admin'::app_role)` | `20251120110544` |
| Clients can view subsections for their sites | SELECT | PUBLIC (no TO) | `has_role(auth.uid(), 'Client'::app_role) AND site_id IN (SELECT id FROM sites WHERE client_id = get_user_client_id())` | — | `20251120110544` |
| Contractors can view subsections for assigned sites | SELECT | PUBLIC (no TO) | `has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())` | — | `20251120110544` |
| Users can manage all subsections | ALL | PUBLIC (no TO) | `has_role(auth.uid(), 'User'::app_role)` | `has_role(auth.uid(), 'User'::app_role)` | `20251120111033` |
| auth_read_subsections | SELECT | authenticated | `true` | — | `APPLIED-tier2` |

Superseded/dropped: original `Authenticated users can view/create/update/delete subsections` (`20251014123510`, `auth.role()='authenticated'`), `Clients can view their subsections` (`20251017054255`), `Contractors can view subsections for their sites` (`20251017061634`), and the QR anon chain `Public users can view subsections`→`… basic subsection info for QR codes`→`Public QR code access - subsection name and ID only` all dropped by `20251120080517`; `All authenticated users full access to subsections` (`20251120080517`) dropped by `20251120110544`. The anon `Public can view subsections` (FOR SELECT, no TO, `USING (true)`, `20260108071956`) was **dropped by tier-2** → replaced by `auth_read_subsections`.

Note: a `BEFORE INSERT OR UPDATE` trigger `trg_sync_coc_compliance` (`20260201151127`) maintains `is_compliant`; it is orthogonal to RLS.

Access summary:
- **anon**: no access (anon read removed by tier-2).
- **authenticated**: SELECT all (`auth_read_subsections`); only Admin and User can write; Client/Contractor SELECT policies redundant.
- **service_role**: full.

---

## suggestions

RLS: **enabled** (`20251028165823`), not forced. No later migration touched these policies; tier-2 does not match (no anon/public `USING(true)` SELECT).

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Users can create their own suggestions | INSERT | PUBLIC (no TO) | — | `auth.uid() = reported_by` | `20251028165823` |
| Users can view their own suggestions | SELECT | PUBLIC (no TO) | `auth.uid() = reported_by` | — | `20251028165823` |
| Admins can view all suggestions | SELECT | PUBLIC (no TO) | `has_role(auth.uid(), 'Admin'::app_role)` | — | `20251028165823` |
| Admins can update suggestions | UPDATE | PUBLIC (no TO) | `has_role(auth.uid(), 'Admin'::app_role)` | — (no WITH CHECK) | `20251028165823` |
| Admins can delete suggestions | DELETE | PUBLIC (no TO) | `has_role(auth.uid(), 'Admin'::app_role)` | — | `20251028165823` |

Access summary:
- **anon**: no access — all policies gate on `auth.uid()` (NULL for anon ⇒ no match).
- **authenticated**: insert own rows; read own rows; Admins read/update/delete all.
- **service_role**: full.

---

## temp_import

RLS: **enabled** (`20251014120224`), not forced. Tier-2 no match.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Only admins can manage import data | ALL | authenticated | `has_role(auth.uid(), 'Admin'::app_role)` | `has_role(auth.uid(), 'Admin'::app_role)` | `20251016064350` |

Superseded/dropped: `Authenticated users can insert/view import data` (`20251014120224`, both `TO authenticated`) dropped by `20251016064350`.

Access summary:
- **anon**: no access (not in `authenticated` role list; expression also fails).
- **authenticated**: full access only for Admins; all other authenticated users blocked.
- **service_role**: full.

---

## user_clients

RLS: **enabled** (`20251017054255`), not forced. Tier-2 no match.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage user-client mappings | ALL | authenticated | `has_role(auth.uid(), 'Admin'::app_role)` | — (no WITH CHECK) | `20251017054255` |
| Users can view their own client mapping | SELECT | authenticated | `auth.uid() = user_id` | — | `20251017054255` |
| All authenticated users full access to user_clients | ALL | PUBLIC (no TO) | `auth.uid() IS NOT NULL` | `auth.uid() IS NOT NULL` | `20251120080517` |

Note: `All authenticated users full access to user_clients` (`20251120080517`) makes the table fully readable/writable by **any** authenticated user — it supersedes the intent of the two earlier scoped policies (RLS is permissive/OR-combined, so the broadest grant wins). The earlier policies were not dropped, but are subsumed.

Access summary:
- **anon**: no access (`auth.uid()` NULL fails every expression).
- **authenticated**: any authenticated user has full ALL access (via the blanket policy); Admin/own-mapping policies add nothing.
- **service_role**: full.

---

## user_policy_overrides

RLS: **enabled** (`20251120061340`), not forced. Tier-2 no match.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage policy overrides | ALL | authenticated | `has_role(auth.uid(), 'Admin'::app_role)` | `has_role(auth.uid(), 'Admin'::app_role)` | `20251120061340` |

Access summary:
- **anon**: no access.
- **authenticated**: full access for Admins only; all other authenticated users blocked (no non-Admin policy exists).
- **service_role**: full.

---

## user_roles

RLS: **enabled** (`20251014120311`), not forced. Tier-2 no match. Note `has_role()` is `SECURITY DEFINER` and reads this table, so policies here do not cause recursive RLS.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Users can view their own roles | SELECT | authenticated | `auth.uid() = user_id` | — | `20251014120311` |
| Admins can view all roles | SELECT | authenticated | `public.has_role(auth.uid(), 'Admin')` | — | `20251014120311` |
| Admins can insert roles | INSERT | authenticated | — | `public.has_role(auth.uid(), 'Admin')` | `20251014120311` |
| Admins can update roles | UPDATE | authenticated | `public.has_role(auth.uid(), 'Admin')` | — (no WITH CHECK) | `20251014120311` |
| Admins can delete roles | DELETE | authenticated | `public.has_role(auth.uid(), 'Admin')` | — | `20251014120311` |

Access summary:
- **anon**: no access.
- **authenticated**: read own role rows; Admins read all + insert/update/delete all roles. (Role assignment for new signups happens via `handle_new_user` SECURITY DEFINER trigger, bypassing these policies.)
- **service_role**: full.

---

## user_sites

RLS: **enabled** (`20251017061634`), not forced. Tier-2 no match. Triggers `log_user_site_insert`/`log_user_site_delete` (`20251119091647`, SECURITY DEFINER) write to `user_sites_history` on row changes.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage user-site mappings | ALL | authenticated | `has_role(auth.uid(), 'Admin'::app_role)` | — (no WITH CHECK) | `20251017061634` |
| Users can view their own site assignments | SELECT | authenticated | `auth.uid() = user_id` | — | `20251017061634` |
| All authenticated users full access to user_sites | ALL | PUBLIC (no TO) | `auth.uid() IS NOT NULL` | `auth.uid() IS NOT NULL` | `20251120080517` |

Note: as with `user_clients`, the blanket `All authenticated users full access to user_sites` (`20251120080517`) grants full ALL access to **any** authenticated user, subsuming the two earlier scoped policies (not dropped).

Access summary:
- **anon**: no access.
- **authenticated**: any authenticated user has full ALL access (blanket policy); Admin/own-assignment policies add nothing.
- **service_role**: full.

---

## user_sites_history

RLS: **enabled** (`20251119091647`), not forced. Tier-2 no match.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can view assignment history | SELECT | authenticated | `has_role(auth.uid(), 'Admin'::app_role)` | — | `20251119091647` |
| System can insert assignment history | INSERT | authenticated | — | `true` | `20251119091647` |

Note: rows are normally written by the SECURITY DEFINER trigger `log_user_site_assignment`; the INSERT policy additionally lets **any** authenticated user insert arbitrary history rows (`WITH CHECK (true)`). There is no UPDATE or DELETE policy ⇒ those commands are blocked for all non-bypass roles.

Access summary:
- **anon**: no access.
- **authenticated**: only Admins can read; any authenticated user can insert; no one can update/delete.
- **service_role**: full.

---

## user_storage_connections

RLS: **enabled** (`20251027081639`), not forced. Tier-2 no match. (Stores OAuth `access_token`/`refresh_token` in plaintext.)

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Users can view their own storage connections | SELECT | PUBLIC (no TO) | `auth.uid() = user_id` | — | `20251027081639` |
| Users can insert their own storage connections | INSERT | PUBLIC (no TO) | — | `auth.uid() = user_id` | `20251027081639` |
| Users can update their own storage connections | UPDATE | PUBLIC (no TO) | `auth.uid() = user_id` | — (no WITH CHECK) | `20251027081639` |
| Users can delete their own storage connections | DELETE | PUBLIC (no TO) | `auth.uid() = user_id` | — | `20251027081639` |

Access summary:
- **anon**: no access (`auth.uid()` NULL fails `= user_id`).
- **authenticated**: each user reads/inserts/updates/deletes only their own connection rows.
- **service_role**: full.
