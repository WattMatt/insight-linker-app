# Effective RLS Policy Reference — Batch 04

Tables: `inspection_relink_audit`, `inspection_signatures`, `inspections`, `offline_photos`, `qr_codes`, `qr_scans`, `schematic_blocks`, `settings`, `site_assets`, `site_document_categories`, `site_documents`, `site_marking_checklist`, `site_schematics`.

**Method.** Effective state = replay all DDL events in chronological order (migration-events-01.json … -10.json), then apply `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` LAST (applied to prod 2026-06-11 via dashboard, outside `supabase/migrations/`). Later events override earlier ones; dropped objects are gone.

**Tier-2 lockdown mechanics** (`APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:18-41`). A `DO` block scans `pg_policies` for every `public`-schema policy with `cmd='SELECT'` AND `qual='true'` AND (`roles='{public}'` OR `'anon'=ANY(roles)`), excluding table `settings`. For each such table it (a) DROPs every matching anon/public SELECT-true policy, then (b) creates `CREATE POLICY "auth_read_<table>" ON public.<table> FOR SELECT TO authenticated USING (true)`. Net effect: every former anon/public full-read SELECT policy becomes authenticated-only, named `auth_read_<table>`. Policies whose `qual` is anything other than the literal `true` (e.g. `auth.uid() IS NOT NULL`, role-scoped) are NOT touched, even if `FOR ALL`.

**Note on `TO` defaults.** A policy with no `TO` clause applies to PUBLIC (all roles incl. `anon`). For SELECT this matters; for write commands gated by `auth.uid() IS NOT NULL` / `has_role(...)`, anon fails the expression so the practical grantee is authenticated. `has_role()` is `STABLE SECURITY DEFINER` reading `public.user_roles` (events-01 `20251014120311`).

---

## public.inspection_relink_audit

- Created `20260519045946_ff0d3334-68ec-431a-b213-6a5bc51b25f1.sql`. RLS **ENABLED**; not FORCED. No FK constraints on any column.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins view relink audit | SELECT | PUBLIC (no `TO`) | `public.has_role(auth.uid(), 'Admin'::app_role)` | — | `20260519045946_…` |
| Service inserts relink audit | INSERT | PUBLIC (no `TO`) | — | `true` | `20260519045946_…` |

- Both policies created via `DROP POLICY IF EXISTS` then `CREATE` (idempotent).
- Not affected by tier-2: the SELECT policy's `qual` is the `has_role(...)` expression, not `true`.
- No UPDATE/DELETE policy → those commands denied for all non-service callers.

**Access summary** — anon: no access (SELECT needs `has_role` which is false for anon; INSERT WITH CHECK `true` technically passes but the table is written by the auto-relink trigger/backfill running as the row's owner). authenticated: Admins read; any authenticated can INSERT (`WITH CHECK true`); no UPDATE/DELETE. service_role: full (bypasses RLS).

---

## public.inspection_signatures

- Created `20260108042823_c7515df1-fcdf-4adc-ae75-55420c305177.sql`. RLS **ENABLED**; not FORCED. `UNIQUE(inspection_id, signer_type)`.
- The 4 original role/ownership policies (view-by-inspection-access, create, update-own, admin-delete) were ALL **dropped** in `20260406131029_84479c75-…sql` and replaced by a single blanket policy.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access (inspection_signatures) | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-…sql` |

- Not affected by tier-2: roles is `{authenticated}`, not `{public}`/anon.
- Superseded/dropped (no longer effective): `Users can view signatures for inspections they have access to` (SELECT, EXISTS-on-inspections), `Authenticated users can create signatures` (INSERT, `auth.uid() IS NOT NULL`), `Users can update their own signatures` (UPDATE, `auth.uid() IS NOT NULL`), `Admins can delete signatures` (DELETE, EXISTS in user_roles) — all dropped `20260406131029`.

**Access summary** — anon: no access (`TO authenticated`). authenticated: full read/insert/update/delete on all rows. service_role: full.

---

## public.inspections

- Created `20251014114352_f0238ce6-…sql`. RLS **ENABLED**; not FORCED. Heavily churned (the original blanket `auth.role()='authenticated'` CRUD, then Client/Contractor scoping, then a `USING(true) WITH CHECK(true)` blanket, then role-scoped lockdown).
- The `20251120080517` blanket `All authenticated users full access to inspections` was **dropped** in `20251120110544`, replaced by the Admin-manage + Client/Contractor-view set below. `Users can manage all inspections` (`User` role) added `20251120111033`. Public read added `20260123052442`. Contractor write policies added `20260219090420`. Tier-2 then demoted the public-read policy.

Currently-effective policies:

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage all inspections | ALL | PUBLIC (no `TO`) | `has_role(auth.uid(), 'Admin'::app_role)` | `has_role(auth.uid(), 'Admin'::app_role)` | `20251120110544_4e89ad10-…sql` |
| Users can manage all inspections | ALL | PUBLIC (no `TO`) | `has_role(auth.uid(), 'User'::app_role)` | `has_role(auth.uid(), 'User'::app_role)` | `20251120111033_1e66f4c9-…sql` |
| Clients can view inspections for their sites | SELECT | PUBLIC (no `TO`) | `has_role(auth.uid(), 'Client'::app_role) AND site_id IN (SELECT id FROM sites WHERE client_id = get_user_client_id())` | — | `20251120110544_4e89ad10-…sql` |
| Contractors can view inspections for assigned sites | SELECT | PUBLIC (no `TO`) | `has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())` | — | `20251120110544_4e89ad10-…sql` |
| Contractors can update inspections for assigned sites | UPDATE | PUBLIC (no `TO`) | `has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT site_id FROM public.user_sites WHERE user_id = auth.uid())` | `has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT site_id FROM public.user_sites WHERE user_id = auth.uid())` | `20260219090420_f8f55711-…sql` |
| Contractors can insert inspections for assigned sites | INSERT | PUBLIC (no `TO`) | — | `has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT site_id FROM public.user_sites WHERE user_id = auth.uid())` | `20260219090420_f8f55711-…sql` |
| auth_read_inspections | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

- **Tier-2 action:** `Public can view inspections` (`FOR SELECT USING(true)`, no `TO` → public; added `20260123052442`) matched the scan (qual `true`, roles `{public}`) and was **dropped**, replaced by `auth_read_inspections` (authenticated-only). Anon QR/public read of `inspections` now goes only through the SECURITY DEFINER RPCs `get_public_site_review` / `get_public_subsection_review` (`20260610130000`).
- Dropped/superseded (no longer effective): original `Authenticated users can view/create/update/delete inspections` (`20251014114352`, dropped `20251120080517`); `Clients can view their inspections` & `Contractors can view/update inspections for their sites` (`20251017…`/`20251017061634`, dropped `20251120080517`); `All authenticated users full access to inspections` (`20251120080517`, dropped `20251120110544`); `Public can view inspections` (`20260123052442`, dropped by tier-2).

**Access summary** — anon: **no table access** (public-read demoted by tier-2; only the token-scoped RPCs expose inspection data). authenticated: Admins & `User`-role have full CRUD; any authenticated reads all rows via `auth_read_inspections`; Clients/Contractors additionally satisfy their scoped SELECT; Contractors may insert/update for assigned sites. service_role: full.

---

## public.offline_photos

- Created `20260310085611_954679cb-…sql`. RLS **ENABLED**; not FORCED. `captured_by uuid NOT NULL` (no FK). No FK on `context_id`/`context_type`.
- The 4 original role/ownership policies were ALL **dropped** in `20260406131029_84479c75-…sql` and replaced by a single blanket policy.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access (offline_photos) | ALL | authenticated | `true` | `true` | `20260406131029_84479c75-…sql` |

- Not affected by tier-2 (roles `{authenticated}`).
- Dropped/superseded: `Admins can manage all offline photos` (`has_role …'Admin'`), `Users can manage all offline photos` (`has_role …'User'`), `Users can manage their own offline photos` (`captured_by = auth.uid()`), `Contractors can view offline photos for assigned sites` (SELECT, context_id IN subsections/sites/inspections of assigned sites) — all created `20260310085611`, all dropped `20260406131029`.

**Access summary** — anon: no access. authenticated: full read/insert/update/delete on all rows. service_role: full.

---

## public.qr_codes

- Created `20251020070753_59422a85-…sql`. RLS **ENABLED**; not FORCED.
- All 4 original policies (Admin-manage, Client-view, Contractor-view, `Public can view QR codes`) were **dropped** in `20251120080517_643a23ca-…sql` and replaced by one blanket policy.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access to qr_codes | ALL | PUBLIC (no `TO`) | `auth.uid() IS NOT NULL` | `auth.uid() IS NOT NULL` | `20251120080517_643a23ca-…sql` |

- **Not affected by tier-2:** the surviving policy's `qual` is `auth.uid() IS NOT NULL`, not the literal `true`, so the scan skips it. (The anon `Public can view QR codes USING(true)` policy that *would* have matched was already dropped in `20251120080517`, well before tier-2.)
- Dropped/superseded: `Admins can manage all QR codes`, `Clients can view their QR codes`, `Contractors can view QR codes for their sites`, `Public can view QR codes` (all `20251020070753`, all dropped `20251120080517`).

**Access summary** — anon: no access (`auth.uid()` is NULL → expression false; no `TO public USING(true)` policy remains). authenticated: full CRUD on all rows. service_role: full.

---

## qr_scans

- **No such table exists** anywhere in the chronological event log (-01 … -10) or in the tier-2 file. No CREATE TABLE, no `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, no policy ever references `qr_scans`. ⚠️ UNVERIFIED whether it exists outside the captured migrations (e.g. created directly in the dashboard); within ground-truth DDL it is absent.

**Access summary** — N/A (table not present in tracked schema).

---

## public.schematic_blocks

- Created `20260120132425_dd27775f-…sql`. RLS **ENABLED**; not FORCED. FK `schematic_id → site_schematics ON DELETE CASCADE`; `subsection_id → subsections ON DELETE SET NULL`.
- Original write policies were re-targeted at `authenticated` in `20260313070142` (drop+create of INSERT/UPDATE/DELETE). `20260313095510` re-applied only the INSERT policy (idempotent) — UPDATE/DELETE from `20260313070142` remain as-is.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Authenticated users can insert schematic blocks | INSERT | authenticated | — | `true` | `20260313095510_cbed8b59-…sql` (re-applied; orig `20260313070142`) |
| Authenticated users can update schematic blocks | UPDATE | authenticated | `true` | `true` | `20260313070142_6cd46c5f-…sql` |
| Authenticated users can delete schematic blocks | DELETE | authenticated | `true` | — | `20260313070142_6cd46c5f-…sql` |
| auth_read_schematic_blocks | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

- **Tier-2 action:** `Anyone can view schematic blocks` (`FOR SELECT USING(true)`, no `TO` → public; `20260120132425`) matched the scan (qual `true`, roles `{public}`) and was **dropped**, replaced by `auth_read_schematic_blocks`.
- Dropped/superseded: original `Authenticated users can insert/update/delete schematic blocks` (no-`TO`/public versions, `20260120132425`) replaced by the `TO authenticated` versions in `20260313070142`; `Anyone can view schematic blocks` dropped by tier-2.

**Access summary** — anon: **no access** (public read removed by tier-2; no anon write policy). authenticated: read all + insert/update/delete all. service_role: full.

---

## public.settings

- Created `20251014132137_627a24bc-…sql`. RLS **ENABLED**; not FORCED. App branding/config (single-row pattern).
- **Explicitly EXCLUDED from tier-2** (`…tier2-anon-read-lockdown.sql:14,26` — `tablename NOT IN ('settings')`), to preserve login-page branding read for anon.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Public can view branding only | SELECT | PUBLIC (no `TO`) | `true` | — | `20251016064350_7ace660c-…sql` |
| Authenticated users can view all settings | SELECT | authenticated | `auth.role() = 'authenticated'` | — | `20251016064350_7ace660c-…sql` |
| Authenticated users can update settings | UPDATE | PUBLIC (no `TO`) | `auth.role() = 'authenticated'` | — | `20251014132137_627a24bc-…sql` |
| Authenticated users can insert settings | INSERT | PUBLIC (no `TO`) | — | `auth.role() = 'authenticated'` | `20251014132137_627a24bc-…sql` |

- `Public can view branding only` despite its name exposes ALL columns/rows to all roles incl. anon (expression is bare `true`); the migration comment intends the frontend to fetch only `company_name`, `company_logo_url`, `primary_color`. It survives tier-2 because `settings` is in the exclusion list.
- Dropped/superseded: `Anyone can view settings` (`20251014132137`, dropped `20251016064350` and replaced by `Public can view branding only`).
- No DELETE policy → DELETE denied for all non-service callers.

**Access summary** — anon: **reads all settings rows/columns** (`Public can view branding only`, USING `true`); no write. authenticated: reads all; INSERT/UPDATE allowed (`auth.role()='authenticated'`); no DELETE. service_role: full.

---

## public.site_assets

- Created `20260109105319_51c4643e-…sql`. RLS **ENABLED**; not FORCED. `site_id → sites ON DELETE CASCADE`.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage all assets | ALL | PUBLIC (no `TO`) | `public.has_role(auth.uid(), 'Admin')` | `public.has_role(auth.uid(), 'Admin')` | `20260109105319_51c4643e-…sql` |
| Users can view assets | SELECT | PUBLIC (no `TO`) | `public.has_role(auth.uid(), 'User') OR public.has_role(auth.uid(), 'Moderator')` | — | `20260109105319_51c4643e-…sql` |
| Contractors can view assets for assigned sites | SELECT | PUBLIC (no `TO`) | `public.has_role(auth.uid(), 'Contractor') AND EXISTS (SELECT 1 FROM public.user_sites WHERE user_sites.user_id = auth.uid() AND user_sites.site_id = site_assets.site_id)` | — | `20260109105319_51c4643e-…sql` |
| Clients can view assets for their sites | SELECT | PUBLIC (no `TO`) | `public.has_role(auth.uid(), 'Client') AND EXISTS (SELECT 1 FROM public.sites s JOIN public.user_clients uc ON uc.client_id = s.client_id WHERE s.id = site_assets.site_id AND uc.user_id = auth.uid())` | — | `20260109105319_51c4643e-…sql` |
| Authenticated users can view assets | SELECT | authenticated | `true` | — | `20260216054714_fd97a029-…sql` |
| Authenticated users can insert assets | INSERT | authenticated | — | `true` | `20260216054714_fd97a029-…sql` |
| Authenticated users can update assets | UPDATE | authenticated | `true` | `true` | `20260216054714_fd97a029-…sql` |
| Authenticated users can delete assets | DELETE | authenticated | `true` | — | `20260216054714_fd97a029-…sql` |
| auth_read_site_assets | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

- Role literals on the original four policies are **bare text** `'Admin'`/`'User'`/`'Moderator'`/`'Contractor'`/`'Client'` (no `::app_role` cast). `'Moderator'` is not a known `app_role` enum value (enum is Admin/User/Contractor/Client) → that disjunct never matches. ⚠️ UNVERIFIED whether `has_role(...,'Moderator')` raises or silently returns false at runtime; either way it grants nothing.
- **Tier-2 action:** `Public can view site assets` (`FOR SELECT TO anon USING(true)`; `20260217085025`) matched the scan (`'anon'=ANY(roles)`, qual `true`) and was **dropped**, replaced by `auth_read_site_assets` (in table above). That replacement is functionally redundant with the pre-existing `Authenticated users can view assets` (both authenticated SELECT-true) but is created regardless.

**Access summary** — anon: **no access** (anon SELECT-true removed by tier-2). authenticated: any authenticated reads/inserts/updates/deletes all rows (`20260216054714` blanket policies); role-scoped SELECTs are now redundant. service_role: full.

---

## public.site_document_categories

- Created `20251016021558_9338f335-…sql`. RLS **ENABLED**; not FORCED. `site_id → sites ON DELETE CASCADE`.
- The role-scoped Admin/Contractor policies from `20251119090820` were **dropped** in `20251120080517` and replaced by a single blanket policy.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access to site_document_categories | ALL | PUBLIC (no `TO`) | `auth.uid() IS NOT NULL` | `auth.uid() IS NOT NULL` | `20251120080517_643a23ca-…sql` |

- **Not affected by tier-2:** `qual` is `auth.uid() IS NOT NULL`, not `true`. No anon/public SELECT-true policy currently exists on this table.
- Dropped/superseded: `Public users can view site document categories` (USING `true`, anon-readable, `20251016021558`, dropped `20251016035546`); `Authenticated users can manage site document categories` (`auth.role()='authenticated'`, `20251016021558`, dropped `20251119090820`); `Admins can manage site document categories` & `Contractors can view site document categories for their sites` (`20251119090820`, both dropped `20251120080517`).

**Access summary** — anon: no access (`auth.uid()` NULL). authenticated: full CRUD on all rows. service_role: full.

---

## public.site_documents

- Created earlier (FK `category_id → site_document_categories` added `20251016021558`; table itself referenced from `20251015103303`). RLS **ENABLED**; not FORCED. Very heavily churned.
- The `20251120080517` blanket `All authenticated users full access to site_documents` was **dropped** in `20251120110544`, replaced by the Admin-manage + Client/Contractor-view set. `Users can manage all site documents` (`User` role) added `20251120111033`. A public read was (re)added `20260123052442`, then demoted by tier-2.

Currently-effective policies:

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Admins can manage all site documents | ALL | PUBLIC (no `TO`) | `has_role(auth.uid(), 'Admin'::app_role)` | `has_role(auth.uid(), 'Admin'::app_role)` | `20251120110544_4e89ad10-…sql` |
| Users can manage all site documents | ALL | PUBLIC (no `TO`) | `has_role(auth.uid(), 'User'::app_role)` | `has_role(auth.uid(), 'User'::app_role)` | `20251120111033_1e66f4c9-…sql` |
| Clients can view site documents for their sites | SELECT | PUBLIC (no `TO`) | `has_role(auth.uid(), 'Client'::app_role) AND site_id IN (SELECT id FROM sites WHERE client_id = get_user_client_id())` | — | `20251120110544_4e89ad10-…sql` |
| Contractors can view site documents for assigned sites | SELECT | PUBLIC (no `TO`) | `has_role(auth.uid(), 'Contractor'::app_role) AND site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())` | — | `20251120110544_4e89ad10-…sql` |
| auth_read_site_documents | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

- **Tier-2 action:** `Public can view site_documents` (`FOR SELECT USING(true)`, no `TO` → public; conditionally added `20260123052442`) matched the scan and was **dropped**, replaced by `auth_read_site_documents`. (The legacy `Public can view site documents` from `20251016064723`/`20260108071956` had already been dropped by `20251120080517` / `20251120110544` lineage; whichever public SELECT-true policy was live at tier-2 time was removed.)
- Dropped/superseded (long list): `Public users can view site documents` (`20251015103303`, dropped `20251016035546`); `Authenticated users can manage site documents` (`20251016064723`, dropped `20251119090820`); `Public can view site documents` + per-command `Authenticated users can insert/update/delete site documents` (`20251016064723`, dropped `20251119090820`/`20251120080517`); `Clients can view their site documents` (`20251017054255`, dropped `20251120080517`); `Admins can manage site documents` + `Contractors can view site documents for their sites` (`20251119090820`, dropped `20251120080517`); `All authenticated users full access to site_documents` (`20251120080517`, dropped `20251120110544`); the `20260123052442` public read (dropped by tier-2).

**Access summary** — anon: **no access** (public read demoted by tier-2; anon document review goes via `get_public_site_review` RPC, `20260610130000`). authenticated: Admins & `User` full CRUD; any authenticated reads all via `auth_read_site_documents`; Clients/Contractors additionally satisfy scoped SELECT. service_role: full.

---

## public.site_marking_checklist

- Created `20251027105104_aadc2c43-…sql`. RLS **ENABLED**; not FORCED. `site_id → sites ON DELETE CASCADE`; `UNIQUE(site_id, item_id)`.
- The role-scoped Admin/Contractor policies from `20251119090820` were **dropped** in `20251120080517` and replaced by a single blanket policy.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| All authenticated users full access to site_marking_checklist | ALL | PUBLIC (no `TO`) | `auth.uid() IS NOT NULL` | `auth.uid() IS NOT NULL` | `20251120080517_643a23ca-…sql` |

- **Not affected by tier-2:** `qual` is `auth.uid() IS NOT NULL`, not `true`. No anon/public SELECT-true policy exists on this table.
- Dropped/superseded: original `Authenticated users can view/create/update/delete marking checklists` (`auth.role()='authenticated'`, `20251027105104`, dropped `20251119090820`); `Admins can manage marking checklists`, `Contractors can view/update marking checklists for their sites` (`20251119090820`, all dropped `20251120080517`).

**Access summary** — anon: no access (`auth.uid()` NULL). authenticated: full CRUD on all rows. service_role: full.

---

## public.site_schematics

- Created `20260120132425_dd27775f-…sql`. RLS **ENABLED**; not FORCED. `site_id → sites ON DELETE CASCADE`; `UNIQUE(site_id)`.

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Authenticated users can insert site schematics | INSERT | PUBLIC (no `TO`) | — | `auth.uid() IS NOT NULL` | `20260120132425_dd27775f-…sql` |
| Authenticated users can update site schematics | UPDATE | PUBLIC (no `TO`) | `auth.uid() IS NOT NULL` | — | `20260120132425_dd27775f-…sql` |
| Authenticated users can delete site schematics | DELETE | PUBLIC (no `TO`) | `auth.uid() IS NOT NULL` | — | `20260120132425_dd27775f-…sql` |
| auth_read_site_schematics | SELECT | authenticated | `true` | — | `APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` |

- **Tier-2 action:** `Anyone can view site schematics` (`FOR SELECT USING(true)`, no `TO` → public; `20260120132425`) matched the scan and was **dropped**, replaced by `auth_read_site_schematics`.
- Write policies have no `TO` clause but are gated by `auth.uid() IS NOT NULL`, so anon cannot write; the `UPDATE` policy has no `WITH CHECK` (USING reused for the check on existing-row visibility; new column values unconstrained).
- Dropped/superseded: `Anyone can view site schematics` (dropped by tier-2).

**Access summary** — anon: **no access** (public read removed by tier-2; no anon write — all writes need `auth.uid()`). authenticated: read all (`auth_read_site_schematics`) + insert/update/delete all. service_role: full.

---

### Cross-table notes

- **Anon read now gated by RPC, not policy.** For `inspections`, `site_documents`, `site_schematics`, `schematic_blocks`, `site_assets`, the only effective anon-readable path post-tier-2 is the token-scoped SECURITY DEFINER RPCs (`get_public_subsection`, `get_public_portfolio`, `get_public_site_review`, `get_public_subsection_review`; `20260610113000`/`20260610130000`, `GRANT EXECUTE … TO anon, authenticated`). `settings` remains anon-readable directly (tier-2 exclusion).
- **`qr_scans` does not exist** in the tracked schema (see section above).
- **No table in this batch is RLS-FORCED.** All show only `ENABLE ROW LEVEL SECURITY`; no `FORCE ROW LEVEL SECURITY` event appears for any of them. Table owners / `service_role` bypass RLS.
