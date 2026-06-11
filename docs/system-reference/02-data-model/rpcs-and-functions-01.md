# Database functions & RPCs (effective state)

Scope: the functions assigned to this doc. Effective state = replay of all migrations in
chronological order (the `_work/migration-events-*.json` event log), then the
out-of-band production SQL applied 2026-06-11
(`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`). Where a function has
multiple `CREATE OR REPLACE`, the latest wins and is documented as "effective"; earlier
forms are noted under each function's history line.

Conventions used below:
- **SECURITY** = `DEFINER` or `INVOKER` (INVOKER is the default when no `SECURITY` clause is present).
- **search_path** = value of `SET search_path = …` attached to the function, or "(none)" if absent.
- **Grants in effect** reflect explicit `GRANT`/`REVOKE` from migrations. The tier-2 file
  (2026-06-11) only touches RLS SELECT policies — it does **not** alter any function
  grant — so it changes none of the grants below. ⚠️ UNVERIFIED: PostgreSQL's default for
  a newly created function is `EXECUTE TO PUBLIC`; functions with no explicit GRANT/REVOKE
  in any migration are assumed to retain that default unless a migration revoked it.
- **CALLERS** = results of grepping `src/` for `.rpc('<name>'` and `supabase/functions/`
  for the function name. RLS-helper and trigger functions are normally invoked by the
  database (policy expressions / triggers), not by app code.

---

## Summary table

| Function | Lang | Security | search_path | Effective grants | App callers |
|---|---|---|---|---|---|
| `_share_link(p_token text)` | sql | DEFINER | `public` | `REVOKE ALL FROM PUBLIC` (no grant) | none (internal helper) |
| `cleanup_activity_logs()` | plpgsql | DEFINER | `'public'` | ⚠️ default (no explicit grant) | no app callers found (trigger fn) |
| `cleanup_old_pending_invites()` | plpgsql | DEFINER | `public` | `GRANT EXECUTE TO authenticated` | no app callers found |
| `contractor_has_site_access(_user_id uuid, _site_id uuid)` | sql | DEFINER | `public` | ⚠️ default (no explicit grant) | edge fns extract-coc, validate-coc |
| `get_pending_verifications(user_uuid uuid)` | plpgsql | DEFINER | `public` | `GRANT EXECUTE TO authenticated` | VerificationListener, usePendingVerifications |
| `get_public_portfolio(p_token text)` | plpgsql | DEFINER | `public` | `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO anon, authenticated` | PublicClientPortfolio |
| `get_public_site_review(p_token text, p_site_id uuid)` | plpgsql | DEFINER | `public` | `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO anon, authenticated` | PublicSiteReview |
| `get_public_subsection(p_subsection_id uuid)` | sql | DEFINER | `public` | `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO anon, authenticated` | PublicSubsection |
| `get_public_subsection_review(p_token text, p_subsection_id uuid)` | plpgsql | DEFINER | `public` | `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO anon, authenticated` | PublicSubsectionReview |
| `get_rls_policies_for_role(role_name text)` | sql | DEFINER | `public, pg_catalog` | ⚠️ default (no explicit grant) | UserRLSPolicies |
| `get_user_client_id()` | sql | DEFINER | `public` | ⚠️ default (no explicit grant) | none (RLS helper) |
| `handle_new_user()` | plpgsql | DEFINER | `'public'` | ⚠️ default (no explicit grant) | none (auth.users trigger) |
| `has_role(_user_id uuid, _role app_role)` | sql | DEFINER | `public` | ⚠️ default (no explicit grant) | none (RLS helper) |
| `inspections_auto_link_subsection()` | plpgsql | INVOKER | `public` | ⚠️ default (no explicit grant) | none (inspections trigger) |
| `log_user_site_assignment()` | plpgsql | DEFINER | `public` | ⚠️ default (no explicit grant) | none (user_sites trigger) |
| `normalize_shop_key(_input text)` | sql | INVOKER | **(none)** | ⚠️ default (no explicit grant) | none |
| `normalize_inspection_json_data()` | plpgsql | INVOKER | (none) | — | **DROPPED** (see Dropped section) |

---

## `_share_link(p_token text)`

- **Source:** `supabase/migrations/20260610113000_public_rpcs_phase1.sql:9` (event log: `migration-events-10.json`).
- **Signature:** `public._share_link(p_token text) RETURNS public.client_access_links`
- **Language:** sql, `STABLE`, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** `REVOKE ALL ON FUNCTION public._share_link(text) FROM PUBLIC` (`…phase1.sql:19`). No subsequent `GRANT` — **not** callable by `anon` or `authenticated`. Only the other SECURITY DEFINER RPCs in this doc invoke it (they run as definer, bypassing the function-level privilege check).
- **Behavior:** resolves an access token to a `client_access_links` row.
  ```sql
  SELECT * FROM public.client_access_links
  WHERE access_token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1
  ```
  Reads: `public.client_access_links`. No writes. No `auth.uid()` check (token-based).
- **CALLERS:** no `.rpc('_share_link'` anywhere (intentional; leading underscore + revoked). Invoked internally by `get_public_portfolio`, `get_public_site_review`, `get_public_subsection_review`.

## `cleanup_activity_logs()`

- **Source (effective):** `20251020070622_59d3cf0b-7767-4fa6-adfe-ce7cdcc11d6a.sql` (`migration-events-04.json`).
- **Signature:** `public.cleanup_activity_logs() RETURNS trigger`
- **Language:** plpgsql, **SECURITY DEFINER**, `SET search_path = 'public'`.
- **Grants in effect:** no explicit GRANT/REVOKE in any migration. ⚠️ default EXECUTE-to-PUBLIC assumed; irrelevant in practice (it is a statement-level trigger function).
- **Behavior:** trims `activity_logs` to the 20 most-recent rows, then `RETURN NEW`.
  ```sql
  DELETE FROM public.activity_logs
  WHERE id NOT IN (SELECT id FROM public.activity_logs ORDER BY created_at DESC LIMIT 20);
  ```
  Reads + writes (DELETE): `public.activity_logs`. No `auth` check.
- **Trigger wiring:** `trigger_cleanup_activity_logs AFTER INSERT ON public.activity_logs FOR EACH STATEMENT` (same migration).
- **CALLERS:** no app callers found. Fired by the trigger above.

## `cleanup_old_pending_invites()`

- **Source (effective):** `20251017095131_9a8ba3df-3011-4282-a18e-42ecf40feb00.sql` (`migration-events-04.json`).
- **Signature:** `public.cleanup_old_pending_invites() RETURNS INTEGER`
- **Language:** plpgsql, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** `GRANT EXECUTE ON FUNCTION public.cleanup_old_pending_invites() TO authenticated` (same migration). Note: granted to **all** authenticated users, not just admins, despite the migration comment.
- **Behavior:**
  ```sql
  DELETE FROM public.pending_user_invites WHERE created_at < NOW() - INTERVAL '30 days';
  -- GET DIAGNOSTICS deleted_count = ROW_COUNT;
  INSERT INTO public.activity_logs (action, details, user_email)
  VALUES ('cleanup_pending_invites',
          format('Automatically cleaned up %s old pending invites', deleted_count),
          'system');
  -- RETURN deleted_count;
  ```
  Reads + writes (DELETE): `public.pending_user_invites`; writes (INSERT): `public.activity_logs`. No `auth` check inside (relies on the EXECUTE grant). Intended for manual admin run or pg_cron.
- **CALLERS:** no `.rpc('cleanup_old_pending_invites'` in `src/` (only a generated type entry at `src/integrations/supabase/types.ts:3589`) and none in `supabase/functions/`. **No app callers found.**

## `contractor_has_site_access(_user_id uuid, _site_id uuid)`

- **Source:** `20251120110544_4e89ad10-205d-44f0-9308-05167a2a3326.sql` (`migration-events-07.json`).
- **Signature:** `public.contractor_has_site_access(_user_id uuid, _site_id uuid) RETURNS boolean`
- **Language:** sql, `STABLE`, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** no explicit GRANT/REVOKE in any migration. ⚠️ default EXECUTE-to-PUBLIC assumed (the two callers run with the service-role / edge-function client, for which the default suffices).
- **Behavior:**
  ```sql
  SELECT EXISTS (SELECT 1 FROM public.user_sites
                 WHERE user_id = _user_id AND site_id = _site_id)
  ```
  Reads: `public.user_sites`. No writes. Note (per event log): defined as a helper but **not referenced by any RLS policy** created in its migration — those policies inline the `user_sites` subquery instead.
- **CALLERS (edge functions, both pass `{ _user_id: userId, _site_id: subsectionRow.site_id }`):**
  - `supabase/functions/extract-coc/index.ts:1001`
  - `supabase/functions/validate-coc/index.ts:991`

## `get_pending_verifications(user_uuid uuid)`

- **Source (effective):** `20251107084924_7b603496-c362-4353-abc9-589c617582cc.sql` (`migration-events-05.json`).
- **Signature:** `get_pending_verifications(user_uuid uuid) RETURNS TABLE (id uuid, type text, title text, description text, resolved_at timestamp with time zone)`
- **Language:** plpgsql, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** `GRANT EXECUTE ON FUNCTION get_pending_verifications TO authenticated` (re-granted in the same migration after the drop/recreate).
- **History:** first created in `20251107084904_f848b2f4-…sql` **without** `search_path`; immediately dropped and recreated in `20251107084924_…sql` with `SET search_path = public` (only change). Body identical across versions.
- **Behavior:** `UNION ALL` of pending-verification rows the caller owns:
  - from `issue_reports` → `type='issue'`, `title='Issue Report'`, `ir.description`, `ir.resolved_at`, where `reported_by = user_uuid AND needs_user_verification = true AND verification_status = 'pending'`;
  - from `suggestions` → `type='suggestion'`, `s.title`, `s.description`, `s.resolved_at`, same predicate.

  Reads: `issue_reports`, `suggestions`. No writes. Scopes by the passed `user_uuid` argument (the app passes the current user's id; the function does not itself enforce `auth.uid() = user_uuid`).
- **CALLERS (both pass `{ user_uuid: <current user id> }`):**
  - `src/components/VerificationListener.tsx:27` (`user.id`)
  - `src/hooks/usePendingVerifications.ts:19` (`userId`)

## `get_public_portfolio(p_token text)`

- **Source:** `supabase/migrations/20260610113000_public_rpcs_phase1.sql:53` (`migration-events-10.json`).
- **Signature:** `public.get_public_portfolio(p_token text) RETURNS jsonb`
- **Language:** plpgsql, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO anon, authenticated` (`…phase1.sql:76-77`).
- **Behavior:** resolves `v_link := public._share_link(p_token)`; returns `NULL` if `v_link.id IS NULL` (invalid/expired) **or** `v_link.client_id IS NULL` (link not client-scoped). Otherwise returns a `jsonb` object with:
  - `settings` (company_name, company_logo_url from `settings ORDER BY created_at LIMIT 1`),
  - `client` (id, name, company_name, logo_url from `clients WHERE id = v_link.client_id`),
  - `sites` array for `sites WHERE client_id = v_link.client_id`, each with id/name/address/site_type/site_image_url plus `total_subsections` count and `open_snags` count (`status NOT IN ('rectified','closed')`).

  Reads: `client_access_links` (via `_share_link`), `settings`, `clients`, `sites`, `subsections`, `snags`. No writes. Auth = token scope only (no `auth.uid()`).
- **CALLERS:** `src/views/PublicClientPortfolio.tsx:108` — `.rpc("get_public_portfolio", { p_token: token })`.

## `get_public_site_review(p_token text, p_site_id uuid)`

- **Source:** `supabase/migrations/20260610130000_public_drilldown_rpcs.sql:12` (`migration-events-10.json`).
- **Signature:** `public.get_public_site_review(p_token text, p_site_id uuid) RETURNS jsonb`
- **Language:** plpgsql, `STABLE`, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO anon, authenticated` (`…drilldown_rpcs.sql:82-83`).
- **Behavior:** resolves `v_link` via `_share_link(p_token)`; returns `NULL` on invalid/expired token, non-existent site, or failed **token-scope check** (labelled "Vuln 7"):
  - if `link.client_id` set → `site.client_id` must equal it;
  - elsif `link.site_id` set → `p_site_id` must equal it;
  - else → `NULL`.

  On success returns `jsonb` with `settings`, `site` (id, name, address, site_type, site_image_url, supply_authority, nominated_max_demand), `client`, `subsections`, `snags` (joined via subsections), `site_documents`, `site_document_categories`, `inspections` (by site_id), and `subsection_documents` (joined, `category_name` COALESCEd to `'Uncategorized'`).

  Reads: `client_access_links`, `settings`, `sites`, `clients`, `subsections`, `snags`, `site_documents`, `site_document_categories`, `inspections`, `subsection_documents`, `document_categories`. No writes. Auth = token scope only.
- **CALLERS:** `src/views/PublicSiteReview.tsx:184` — `.rpc('get_public_site_review', { p_token: token, p_site_id: targetSiteId })`.

## `get_public_subsection(p_subsection_id uuid)`

- **Source:** `supabase/migrations/20260610113000_public_rpcs_phase1.sql:22` (`migration-events-10.json`).
- **Signature:** `public.get_public_subsection(p_subsection_id uuid) RETURNS jsonb`
- **Language:** sql, `STABLE`, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO anon, authenticated` (`…phase1.sql:49-50`).
- **Behavior:** returns `NULL` when no subsection with `p_subsection_id` exists; otherwise a `jsonb` object with:
  - `settings` (company_name, company_logo_url from `settings ORDER BY created_at LIMIT 1`),
  - `subsection` (id, name, tenant_name),
  - `site` (id, name via `subsections JOIN sites`),
  - `categories` (`document_categories` with nested `subsection_documents`, ordered by order_index / uploaded_at),
  - `snags` (id, title, description, status, risk_level, created_at).

  **No token required** — this is the QR-landing path. Reads: `settings`, `subsections`, `sites`, `document_categories`, `subsection_documents`, `snags`. No writes.
- **Tier-2 relationship:** this RPC is the named prerequisite in `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` — that file demotes the anon `USING(true)` SELECT policies that the old direct-read QR page relied on, so the public subsection page must go through this RPC instead.
- **CALLERS:** `src/views/PublicSubsection.tsx:83` — `.rpc('get_public_subsection', { p_subsection_id: subsectionId })`. (⚠️ The tier-2 SQL comment references `src/pages/PublicSubsection.tsx`; the actual file lives at `src/views/PublicSubsection.tsx` — the comment path is stale.)

## `get_public_subsection_review(p_token text, p_subsection_id uuid)`

- **Source:** `supabase/migrations/20260610130000_public_drilldown_rpcs.sql:86` (`migration-events-10.json`).
- **Signature:** `public.get_public_subsection_review(p_token text, p_subsection_id uuid) RETURNS jsonb`
- **Language:** plpgsql, `STABLE`, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO anon, authenticated` (`…drilldown_rpcs.sql:163-164`).
- **Behavior:** resolves `v_link` via `_share_link(p_token)`; looks up the subsection's `site_id` and that site's `client_id`; returns `NULL` on invalid token, non-existent subsection, or failed **scope check** (labelled "Vuln 6"):
  - if `link.client_id` set → `site.client_id` must match;
  - elsif `link.site_id` set → the subsection's `site_id` must match;
  - elsif `link.subsection_id` set → `p_subsection_id` must match;
  - else → `NULL`.

  On success returns `jsonb` with `settings`, `subsection` (id, name, tenant_name, description, category, is_coc_required, metering_status, meter_serial_number, ct_ratio), `site`, `client`, `documents` (`subsection_documents LEFT JOIN document_categories`), `snags`, `inspections` (`LEFT JOIN inspection_templates` for template_name/sections, with nested `signatures` from `inspection_signatures`), and `floor_plans` (`subsection_floor_plans` with `pins_count` from `floor_plan_pins`).

  Reads: `client_access_links`, `settings`, `subsections`, `sites`, `clients`, `subsection_documents`, `document_categories`, `snags`, `inspections`, `inspection_templates`, `inspection_signatures`, `subsection_floor_plans`, `floor_plan_pins`. No writes. Auth = token scope only.
- **CALLERS:** `src/views/PublicSubsectionReview.tsx:169` — `.rpc('get_public_subsection_review', { p_token: token, p_subsection_id: subsectionId })`.

## `get_rls_policies_for_role(role_name text)`

- **Source:** `20251120051830_0f728c09-ca3c-4f83-9cb1-6cb15188ab4b.sql` (`migration-events-06.json`).
- **Signature:** `public.get_rls_policies_for_role(role_name text) RETURNS TABLE(table_name text, policy_name text, command text, using_expression text, with_check_expression text)`
- **Language:** sql, **SECURITY DEFINER**, `SET search_path = public, pg_catalog`.
- **Grants in effect:** no `GRANT`/`REVOKE` in the migration. ⚠️ default EXECUTE-to-PUBLIC assumed.
- **Behavior:** introspection over `pg_policies`:
  ```sql
  SELECT tablename, policyname, cmd,
         COALESCE(qual::text,''), COALESCE(with_check::text,'')
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (policyname ILIKE '%' || role_name || '%'
         OR policyname ILIKE '%authenticated%'
         OR (role_name = 'Admin'      AND policyname ILIKE '%admin%')
         OR (role_name = 'Client'     AND policyname ILIKE '%client%')
         OR (role_name = 'Contractor' AND policyname ILIKE '%contractor%'))
  ORDER BY tablename, cmd, policyname;
  ```
  Matching is **policy-name-pattern based, not role-membership based**. Reads: `pg_catalog.pg_policies`. No writes. No `auth` check inside.
- **CALLERS:** `src/components/UserRLSPolicies.tsx:194` — `.rpc('get_rls_policies_for_role', { role_name: selectedRole })`.

## `get_user_client_id()`

- **Source:** `20251017054255_cd78a557-c3ab-4a9b-b95c-d8da8696f61c.sql` (`migration-events-03.json`).
- **Signature:** `public.get_user_client_id() RETURNS UUID`
- **Language:** sql, `STABLE`, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** no explicit GRANT/REVOKE in any migration. ⚠️ default EXECUTE-to-PUBLIC assumed.
- **Behavior:**
  ```sql
  SELECT client_id FROM public.user_clients WHERE user_id = auth.uid() LIMIT 1
  ```
  Reads: `public.user_clients`. No writes. Uses `auth.uid()` internally. Used by Client-role RLS policies (and several storage policies) to avoid recursive RLS.
- **CALLERS:** no `.rpc('get_user_client_id'` (only a generated type entry at `src/integrations/supabase/types.ts:3642`); referenced extensively inside RLS/storage policy expressions. **No app callers found** (RLS helper).

## `handle_new_user()`

- **Source (effective):** `20260214023114_a056bc18-90e7-4e5b-9b06-b7b6443a3ce7.sql` (`migration-events-09.json`).
- **Signature:** `public.handle_new_user() RETURNS trigger`
- **Language:** plpgsql, **SECURITY DEFINER**, `SET search_path = 'public'`.
- **Grants in effect:** no explicit GRANT/REVOKE. ⚠️ default assumed; runs as the `auth.users` AFTER-INSERT trigger.
- **Behavior (effective version):**
  ```sql
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id,
          CASE WHEN (SELECT COUNT(*) FROM auth.users) = 1
               THEN 'Admin'::app_role
               ELSE 'User'::app_role END);
  RETURN NEW;
  ```
  Writes: `public.profiles`, `public.user_roles`. Reads: `auth.users` (count). New signups get `'User'` by default; only the very first `auth.users` row gets `'Admin'`.
- **History:**
  1. `20251014114352_…sql` (`migration-events-01.json`): inserted only into `profiles` (`full_name = NEW.raw_user_meta_data->>'full_name'`); no `user_roles` insert.
  2. `20251020093607_…sql` (`migration-events-04.json`): added the `user_roles` insert, but **both** CASE branches yielded `'Admin'` — every signup became Admin.
  3. `20260214023114_…sql` (effective): ELSE branch changed to `'User'` (the bug fix).
- **Trigger wiring:** `on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()` (recreated in `20251020093607_…sql`).
- **CALLERS:** no app callers found. Fired by the `auth.users` trigger.

## `has_role(_user_id uuid, _role app_role)`

- **Source:** `20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql` (`migration-events-01.json`). Never replaced.
- **Signature:** `public.has_role(_user_id uuid, _role app_role) RETURNS boolean`
- **Language:** sql, `STABLE`, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** no explicit GRANT/REVOKE. ⚠️ default EXECUTE-to-PUBLIC assumed.
- **Behavior:**
  ```sql
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id AND role = _role)
  ```
  Reads: `public.user_roles`. No writes. The central RLS helper: referenced by virtually every role-scoped policy across the schema (Admin/Contractor/Client checks) to avoid recursive policy evaluation. (`app_role` enum: `'Admin'`, `'User'`, `'Contractor'`, `'Client'`; defined/extended in `20251014120311_…` and `20251017054230_…`.)
- **CALLERS:** no `.rpc('has_role'` (only a generated type entry at `src/integrations/supabase/types.ts:3643`); used inside RLS-policy expressions. **No app callers found** (RLS helper).

## `inspections_auto_link_subsection()`

- **Source (effective):** `supabase/migrations/20260519045946_ff0d3334-68ec-431a-b213-6a5bc51b25f1.sql:73` (`migration-events-10.json`).
- **Signature:** `public.inspections_auto_link_subsection() RETURNS TRIGGER`
- **Language:** plpgsql, **SECURITY INVOKER** (no `SECURITY` clause), `SET search_path = public`.
- **Grants in effect:** no explicit GRANT/REVOKE. ⚠️ default assumed; runs as the `inspections` trigger.
- **Behavior:** when `NEW.subsection_id IS NULL AND NEW.json_data IS NOT NULL AND NEW.site_id IS NOT NULL`, calls `resolve_inspection_subsection(NEW.site_id, NEW.json_data)`; if exactly one match resolves, sets `NEW.subsection_id := <resolved id>`. Returns `NEW`.
  Reads (via the helper it calls): `subsections` etc.; writes only the in-flight `NEW` row (BEFORE-trigger field assignment, no separate DML here).
- **Trigger wiring:** `trg_inspections_auto_link_subsection` (`…20260519045946…sql:87`).
- **Related helpers in the same migration (not in this doc's scope):**
  `resolve_inspection_subsection(_site_id uuid, _json jsonb) RETURNS TABLE(resolved_id uuid, match_count int, shop_number text, firebase_key text)` — plpgsql, STABLE, INVOKER, `SET search_path = public` — does the actual matching.
- **CALLERS:** no app callers found. Fired by the `inspections` trigger.

## `log_user_site_assignment()`

- **Source:** `20251119091647_56f5417f-d8fc-439c-b8ee-87aa78e81070.sql` (`migration-events-06.json`).
- **Signature:** `public.log_user_site_assignment() RETURNS TRIGGER`
- **Language:** plpgsql, **SECURITY DEFINER**, `SET search_path = public`.
- **Grants in effect:** no explicit GRANT/REVOKE. ⚠️ default assumed; runs as the `user_sites` trigger.
- **Behavior:**
  - `TG_OP = 'INSERT'` → `INSERT INTO public.user_sites_history(user_id, site_id, action, performed_by) VALUES (NEW.user_id, NEW.site_id, 'assigned', auth.uid())`; `RETURN NEW`.
  - `TG_OP = 'DELETE'` → same insert with `OLD.*` and `action = 'removed'`; `RETURN OLD`.
  - otherwise → `RETURN NULL`.

  Writes: `public.user_sites_history`. Uses `auth.uid()` for `performed_by`.
- **Trigger wiring:** `log_user_site_insert AFTER INSERT` and `log_user_site_delete AFTER DELETE` on `public.user_sites` (same migration).
- **CALLERS:** no app callers found. Fired by the two `user_sites` triggers.

## `normalize_shop_key(_input text)`

- **Source (effective):** `supabase/migrations/20260519045946_ff0d3334-68ec-431a-b213-6a5bc51b25f1.sql:28` (`migration-events-10.json`).
- **Signature:** `public.normalize_shop_key(_input text) RETURNS text`
- **Language:** sql, `IMMUTABLE`, **SECURITY INVOKER** (no `SECURITY` clause), **`search_path` = (none)** — this function has **no** `SET search_path` (verified at `…20260519045946…sql:29`, which is `RETURNS text LANGUAGE sql IMMUTABLE AS $$`). Notable: it is the one function in this set lacking a pinned search_path.
- **Grants in effect:** no explicit GRANT/REVOKE. ⚠️ default EXECUTE-to-PUBLIC assumed.
- **Behavior:**
  ```sql
  SELECT regexp_replace(upper(coalesce(_input, '')), '[^A-Z0-9]', '', 'g')
  ```
  Pure function — uppercases and strips all non-alphanumerics, for fuzzy shop-number matching. No table access.
- **CALLERS:** no `.rpc('normalize_shop_key'` (only a generated type entry at `src/integrations/supabase/types.ts:3650`); used inside `resolve_inspection_subsection` for key matching. **No app callers found.**

---

## Dropped

### `normalize_inspection_json_data()` — DROPPED

- **Created and dropped within** `20251112021952_4c1c7d0c-9fae-41f2-b1cc-e0ec2656a9bf.sql` (`migration-events-05.json`).
- `CREATE OR REPLACE FUNCTION normalize_inspection_json_data() RETURNS void`, plpgsql, **SECURITY INVOKER** (no `SECURITY` clause), no `search_path`.
- A one-off data-migration function: iterated `inspections` with `json_data IS NOT NULL AND template_id IS NOT NULL`, detected numeric-array-index keys, and rebuilt `json_data` keyed by template section/item `id` strings (preserving top-level `tenants`, `observations`, `siteDrawingPdf`, `siteDrawingPins`, `siteDrawingCanvas`), then `UPDATE inspections SET json_data = …`. Run once via `SELECT normalize_inspection_json_data();` in the same migration, then `DROP FUNCTION IF EXISTS normalize_inspection_json_data();`.
- **Does not exist in the effective schema.** No app callers (and none possible — dropped).
