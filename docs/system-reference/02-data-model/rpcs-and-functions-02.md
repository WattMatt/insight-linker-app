# RPCs & Functions — Batch 02 (effective state)

Effective state = replay of all migrations in chronological order, then the dashboard-applied
`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` on top.

Scope of this file (15 routines, including the private helper `_share_link`):
`get_public_portfolio`, `get_public_site_review`, `get_public_subsection`,
`get_public_subsection_review`, `inspections_auto_link_subsection`, `normalize_shop_key`,
`resolve_inspection_subsection`, `sync_coc_compliance_status`, `temp_reset_password` (dropped),
`track_floor_plan_pin_changes`, `update_updated_at_column`, `validate_access_link`,
`validate_api_token`, `validate_inspection_templates`, plus `_share_link` (internal helper).

> Tier-2 file impact on these routines: **none directly.** The 2026-06-11 lockdown only
> DROP/CREATEs *table* SELECT policies (`pg_policies … cmd='SELECT'`); it touches no function
> grants. It is the upstream prerequisite for the `get_public_*` RPCs (it closes the anon table
> reads those RPCs replace) — see `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:1-50`.

---

## Summary table

| Function | Latest-def migration | Lang | Security | search_path | Effective EXECUTE grant | App / edge callers |
|---|---|---|---|---|---|---|
| `_share_link(text)` | `20260610113000_public_rpcs_phase1.sql` | sql | DEFINER | `public` | `REVOKE ALL FROM PUBLIC`; **never granted** to anon/authenticated | internal-only (called by 3 RPCs below) |
| `get_public_subsection(uuid)` | `20260610113000_public_rpcs_phase1.sql` | sql | DEFINER | `public` | `anon, authenticated` | `src/views/PublicSubsection.tsx:83` |
| `get_public_portfolio(text)` | `20260610113000_public_rpcs_phase1.sql` | plpgsql | DEFINER | `public` | `anon, authenticated` | `src/views/PublicClientPortfolio.tsx:108` |
| `get_public_site_review(text, uuid)` | `20260610130000_public_drilldown_rpcs.sql` | plpgsql | DEFINER | `public` | `anon, authenticated` | `src/views/PublicSiteReview.tsx:184` |
| `get_public_subsection_review(text, uuid)` | `20260610130000_public_drilldown_rpcs.sql` | plpgsql | DEFINER | `public` | `anon, authenticated` | `src/views/PublicSubsectionReview.tsx:169` |
| `normalize_shop_key(text)` | `20260519045946_ff0d3334-….sql` | sql | INVOKER (default) | **not set** | none explicit → PG default (PUBLIC) | no app callers found (DB-internal) |
| `resolve_inspection_subsection(uuid, jsonb)` | `20260519045946_ff0d3334-….sql` | plpgsql | INVOKER (default) | `public` | none explicit → PG default (PUBLIC) | no app callers found (DB-internal) |
| `inspections_auto_link_subsection()` | `20260519045946_ff0d3334-….sql` | plpgsql | INVOKER (default) | `public` | trigger fn (not directly callable in practice) | no app callers found (trigger) |
| `sync_coc_compliance_status()` | `20260201151127_01cd682f-….sql` | plpgsql | DEFINER | `public` | none explicit → PG default (PUBLIC) | no app callers found (trigger) |
| `track_floor_plan_pin_changes()` | `20251120102409_a7bc6b71-….sql` | plpgsql | DEFINER | `public` | none explicit → PG default (PUBLIC) | no app callers found (trigger) |
| `update_updated_at_column()` | `20251014114445_1195edac-….sql` | plpgsql | DEFINER | `public` | none explicit → PG default (PUBLIC) | no app callers found (trigger) |
| `validate_access_link(text)` | `20260123052657_71a9512e-….sql` | plpgsql | DEFINER | `public` | `anon, authenticated` | `PublicClientPortfolio.tsx:71`, `PublicSiteReview.tsx:148`, `PublicSubsectionReview.tsx:144` |
| `validate_api_token(text)` | `20260110172925_a9616e50-….sql` | plpgsql | DEFINER | `public` | none explicit → PG default (PUBLIC) | **no app callers found** (see note) |
| `validate_inspection_templates()` | `20251120045114_44ed9877-….sql` | plpgsql | DEFINER | `public` | `authenticated` | `src/views/TemplateValidator.tsx:32` |
| `temp_reset_password()` | `20260212144831_85c05452-….sql` | — | — | — | **DROPPED in same migration** | n/a — see Dropped section |

> ⚠️ UNVERIFIED — "PG default (PUBLIC)": where a migration creates a function and issues **no**
> `GRANT`/`REVOKE`, PostgreSQL grants EXECUTE to PUBLIC by default. No statement in any of the 14
> migration files or the tier-2 file alters this for these functions, but the live catalog's
> default-ACL state was not queried; treat the "PG default (PUBLIC)" entries as the documented
> behavior of `CREATE FUNCTION` rather than a verified `pg_proc.proacl` reading.

---

## Public-share RPCs (June 2026 "airtight public-share" rebuild)

These four token-/id-scoped RPCs return ONLY the scoped JSON payload each public page needs, so
those pages stop reading tables directly with the anon key. All four `REVOKE ALL … FROM PUBLIC`
then `GRANT EXECUTE … TO anon, authenticated`, are `SECURITY DEFINER`, and `SET search_path = public`.
Source: `20260610113000_public_rpcs_phase1.sql`, `20260610130000_public_drilldown_rpcs.sql`.

### `public._share_link(p_token text)` — private helper

```sql
CREATE OR REPLACE FUNCTION public._share_link(p_token text)
RETURNS public.client_access_links
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.client_access_links
  WHERE access_token = p_token AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._share_link(text) FROM PUBLIC;
```
(`20260610113000_public_rpcs_phase1.sql:12-23`)

- **Returns**: one row of `client_access_links` (the valid, active, unexpired link), or no row.
- **Reads**: `client_access_links`. **Writes**: none.
- **Grants**: `REVOKE ALL FROM PUBLIC`; **never granted** to `anon`/`authenticated`. Callable
  only by the three SECURITY-DEFINER RPCs below (which run as owner). Not callable by clients.
- **Callers**: `get_public_portfolio`, `get_public_site_review`, `get_public_subsection_review`
  (all via `v_link := public._share_link(p_token);`). No app/edge callers.

### `public.get_public_subsection(p_subsection_id uuid)` — QR landing page

- **Signature**: `(p_subsection_id uuid) RETURNS jsonb`, `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`.
- **Auth check inside**: **none** — there is NO token. Scoped solely by the `subsection_id` from the
  URL. Returns `NULL` if `NOT EXISTS (SELECT 1 FROM subsections WHERE id = p_subsection_id)`
  (`20260610113000_public_rpcs_phase1.sql:27-30`). Any anon caller who knows/guesses a subsection
  UUID gets its public payload (this is the QR-scan landing path, by design).
- **Reads**: `subsections`, `settings`, `sites`, `document_categories`, `subsection_documents`,
  `snags` (`:27-50`).
- **Returns JSON keys**: `settings{company_name,company_logo_url}`, `subsection{id,name,tenant_name}`,
  `site{id,name}`, `categories[]` (each with nested `subsection_documents[]`), `snags[]`.
- **Writes**: none.
- **Grants**: `REVOKE ALL FROM PUBLIC` then `GRANT EXECUTE … TO anon, authenticated` (`:52-53`).
- **Callers**: `src/views/PublicSubsection.tsx:83` — `.rpc('get_public_subsection', { p_subsection_id: subsectionId })`.

### `public.get_public_portfolio(p_token text)` — client portfolio share page

- **Signature**: `(p_token text) RETURNS jsonb`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
  (Note: NOT declared `STABLE`, unlike the other three.)
- **Auth check inside**: `v_link := public._share_link(p_token); IF v_link.id IS NULL OR
  v_link.client_id IS NULL THEN RETURN NULL` — requires a valid token that is **client-scoped**
  (`20260610113000_public_rpcs_phase1.sql:59-62`).
- **Reads**: `client_access_links` (via `_share_link`), `settings`, `clients`, `sites`, `subsections`,
  `snags`. Per-site aggregates: `total_subsections` = `count(*)` of subsections; `open_snags` =
  count of snags where `lower(coalesce(status,'')) NOT IN ('rectified','closed')` (`:63-78`).
- **Returns JSON keys**: `settings`, `client{id,name,company_name,logo_url}`, `sites[]` (each with
  `total_subsections`, `open_snags`).
- **Writes**: none.
- **Grants**: `REVOKE ALL FROM PUBLIC` then `GRANT EXECUTE … TO anon, authenticated` (`:80-81`).
- **Callers**: `src/views/PublicClientPortfolio.tsx:108` — `.rpc("get_public_portfolio", { p_token: token })`.

### `public.get_public_site_review(p_token text, p_site_id uuid)` — site review drill-down

- **Signature**: `(p_token text, p_site_id uuid) RETURNS jsonb`, `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`.
- **Auth check inside** (closes IDOR "Vuln 7"): resolves token via `_share_link`; `RETURN NULL` if
  invalid. Looks up `sites.client_id` for `p_site_id`; `RETURN NULL` if site absent. **Scope gate**
  (`20260610130000_public_drilldown_rpcs.sql:30-37`):
  - client-scoped link → require `sites.client_id = v_link.client_id`;
  - else site-scoped link → require `p_site_id = v_link.site_id`;
  - else `RETURN NULL`.
- **Reads**: `client_access_links`, `sites`, `settings`, `clients`, `subsections`, `snags`,
  `site_documents`, `site_document_categories`, `inspections`, `subsection_documents`,
  `document_categories` (`:39-86`).
- **Returns JSON keys**: `settings`, `site` (incl. `supply_authority`, `nominated_max_demand`),
  `client`, `subsections[]`, `snags[]`, `site_documents[]`, `site_document_categories[]`,
  `inspections[]` (incl. `json_data`), `subsection_documents[]` (with `category_name`).
- **Writes**: none.
- **Grants**: `REVOKE ALL FROM PUBLIC` then `GRANT EXECUTE … TO anon, authenticated` (`:87-88`).
- **Callers**: `src/views/PublicSiteReview.tsx:184` — `.rpc('get_public_site_review', { p_token: token, p_site_id: targetSiteId })`.

### `public.get_public_subsection_review(p_token text, p_subsection_id uuid)` — subsection review drill-down

- **Signature**: `(p_token text, p_subsection_id uuid) RETURNS jsonb`, `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`.
- **Auth check inside** (closes IDOR "Vuln 6"): resolves token via `_share_link`; `RETURN NULL` if
  invalid. Resolves the subsection's `site_id` + `sites.client_id`; `RETURN NULL` if subsection
  absent. **Scope gate** (`20260610130000_public_drilldown_rpcs.sql:107-116`):
  - client-scoped link → require subsection's `client_id = v_link.client_id`;
  - else site-scoped link → require subsection's `site_id = v_link.site_id`;
  - else subsection-scoped link → require `p_subsection_id = v_link.subsection_id`;
  - else `RETURN NULL`.
- **Reads**: `client_access_links`, `subsections`, `sites`, `settings`, `clients`,
  `subsection_documents`, `document_categories`, `snags`, `inspections`, `inspection_templates`,
  `inspection_signatures`, `subsection_floor_plans`, `floor_plan_pins` (`:118-170`).
- **Returns JSON keys**: `settings`, `subsection` (incl. `ct_ratio`), `site`, `client`,
  `documents[]`, `snags[]` (incl. `rectified_at`, `rectification_notes`), `inspections[]`
  (incl. `json_data`, `template_name`, `template_sections`, nested `signatures[]`),
  `floor_plans[]` (each with `pins_count`).
- **Writes**: none.
- **Grants**: `REVOKE ALL FROM PUBLIC` then `GRANT EXECUTE … TO anon, authenticated` (`:171-172`).
- **Callers**: `src/views/PublicSubsectionReview.tsx:169` — `.rpc('get_public_subsection_review', { p_token: token, p_subsection_id: subsectionId })`.

---

## Inspection auto-relink functions (`20260519045946_ff0d3334-….sql`)

This migration also runs a one-time DO-block backfill (mutates `inspections.subsection_id`,
`subsections.firebase_id`, inserts `inspection_relink_audit`) — documented with the table/migration,
not here. **None of these three functions carry any GRANT/REVOKE** (PG default applies).

### `public.normalize_shop_key(_input text)`

```sql
CREATE OR REPLACE FUNCTION public.normalize_shop_key(_input text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(upper(coalesce(_input, '')), '[^A-Z0-9]', '', 'g')
$$;
```
(`20260519045946_ff0d3334-….sql:38-42`)

- **Lang/security**: `sql IMMUTABLE`, `SECURITY INVOKER` (default), **`search_path` NOT set**.
- **Behavior**: uppercases, strips all non-`[A-Z0-9]` chars. Pure; reads/writes nothing.
- **Callers**: no app callers found. Called inside `resolve_inspection_subsection` for shop-number
  comparison (`:62-65`). Used in index/match logic only.

### `public.resolve_inspection_subsection(_site_id uuid, _json jsonb)`

- **Signature**: `(_site_id uuid, _json jsonb) RETURNS TABLE(resolved_id uuid, match_count int, shop_number text, firebase_key text)`,
  `LANGUAGE plpgsql STABLE SET search_path = public`, `SECURITY INVOKER` (default).
- **Behavior** (`:45-83`): extracts `_fb = _json->>'subsectionId'` and
  `_shop = _json->'generalInfo'->>'shopNumber'`. (1) Firebase-key match: first `subsections` row with
  `site_id = _site_id AND firebase_id = _fb` → returns `(id, 1, shop, fb)`. (2) Else shop-number match:
  counts `subsections` where `normalize_shop_key(name) = normalize_shop_key(_shop)` within the site;
  if exactly 1 → returns that id with `match_count 1`, else returns `(NULL, count, …)`. (3) Else
  `(NULL, 0, …)`.
- **Reads**: `subsections`. **Writes**: none (resolver only).
- **Callers**: no app callers found. Called by `inspections_auto_link_subsection` (trigger) and by
  the one-time backfill DO-block in the same migration.

### `public.inspections_auto_link_subsection()` — BEFORE trigger on `inspections`

- **Signature**: `() RETURNS TRIGGER`, `LANGUAGE plpgsql SET search_path = public`, `SECURITY INVOKER` (default).
- **Behavior** (`:86-97`): when `NEW.subsection_id IS NULL AND NEW.json_data IS NOT NULL AND
  NEW.site_id IS NOT NULL`, calls `resolve_inspection_subsection(NEW.site_id, NEW.json_data)` and
  sets `NEW.subsection_id := r.resolved_id` if resolved. Returns `NEW`.
- **Reads**: `subsections` (via resolver). **Writes**: mutates the `NEW` row in-flight only.
- **Trigger** (`:99-103`): `trg_inspections_auto_link_subsection BEFORE INSERT OR UPDATE OF
  json_data, subsection_id ON public.inspections FOR EACH ROW`.
- **Callers**: no app callers found (fires automatically via trigger).

---

## COC compliance trigger

### `public.sync_coc_compliance_status()` — BEFORE trigger on `subsections`

- **Signature**: `() RETURNS TRIGGER`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`
  (`20260201151127_01cd682f-….sql:2-7`).
- **Behavior**: on INSERT, or UPDATE where `coc_status` or `is_coc_required` changed:
  - `NOT COALESCE(NEW.is_coc_required,false)` → `NEW.is_compliant := true`;
  - else, latest `coc_validations` for `NEW.id` (max `validated_at`) in `('Fail','Failed','Incomplete')`
    → `is_compliant := false`;
  - else `NEW.coc_status IN ('Approved','Valid','Pass')` → `true`; else `false`.
- **Reads**: `coc_validations` (latest validation per subsection). **Writes**: mutates `NEW` only.
- **Trigger**: `trg_sync_coc_compliance BEFORE INSERT OR UPDATE OF coc_status, is_coc_required ON
  public.subsections FOR EACH ROW` (`:53-58`).
- **Grants**: none explicit (PG default).
- **Callers**: no app callers found (trigger).

---

## Generic / utility triggers

### `public.track_floor_plan_pin_changes()` — BEFORE UPDATE trigger on `floor_plan_pins`

- Latest definition `20251120102409_a7bc6b71-….sql` (the `20251120102352` version was identical body
  but **without** `SECURITY DEFINER`/`search_path`; `…102409` adds `SECURITY DEFINER SET search_path = public`).
- **Signature**: `() RETURNS TRIGGER`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- **Behavior**: appends a change record to `NEW.edit_history` (jsonb) capturing `timestamp`,
  `user_id = NEW.last_modified_by`, and from/to diffs for `status`, `priority`,
  `assigned_contractor`; sets `NEW.last_modified_at = NOW()`.
- **Reads**: none (operates on OLD/NEW). **Writes**: mutates `NEW` only.
- **Trigger**: `floor_plan_pin_changes_trigger BEFORE UPDATE ON floor_plan_pins FOR EACH ROW`
  (defined in `20251120102352_9e71ab8f-….sql`; not re-declared in `…102409`).
- **Grants**: none explicit (PG default). **Callers**: no app callers found (trigger).

### `public.update_updated_at_column()` — generic `updated_at` BEFORE trigger

- Defined first in `20251014114352_…` (no security clause), then **re-defined latest** in
  `20251014114445_1195edac-….sql:11-21` as:

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
```

- **Signature**: `() RETURNS TRIGGER`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- **Behavior**: sets `NEW.updated_at = NOW()`. Reads/writes nothing beyond `NEW`.
- **Wired into many tables' `BEFORE UPDATE` triggers** across migrations (re-referenced, never
  re-defined after `…114445`). **Grants**: none explicit (PG default).
- **Callers**: no app callers found (trigger).

---

## Token / API validation RPCs

### `public.validate_access_link(token text)`

- Latest definition `20260123052657_71a9512e-….sql` (an earlier `20260123052614` version used a
  `set_config('role', …)` switching hack; the latest removes that, relying on the DEFINER owner to
  bypass RLS).
- **Signature**: `(token TEXT) RETURNS TABLE(link_id UUID, link_type TEXT, client_id UUID, site_id UUID,
  subsection_id UUID, is_valid BOOLEAN)`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'`.
- **Behavior** (`20260123052657:…14-78`): selects the `client_access_links` row by `access_token`.
  If row exists AND `is_active = true` AND (`expires_at IS NULL OR expires_at > now()`), **UPDATES**
  `last_accessed_at = now()` and `access_count = access_count + 1`. Returns the link fields plus a
  computed `is_valid`. Returns no row if the token is unknown.
- **Reads**: `client_access_links`. **Writes**: `client_access_links` (access tracking). **Auth check**:
  validity is by token activeness/expiry only — no `auth.uid()` check (anon-callable by design).
- **Grants**: `GRANT EXECUTE … TO anon` and `TO authenticated` (`20260123052657:…80-82`).
- **Callers** (all in `src`):
  - `src/views/PublicClientPortfolio.tsx:71` — `.rpc("validate_access_link", { token })`
  - `src/views/PublicSiteReview.tsx:148` — `.rpc('validate_access_link', { token })`
  - `src/views/PublicSubsectionReview.tsx:144` — `.rpc('validate_access_link', { token })`

### `public.validate_api_token(token text)`

- **Signature**: `(token TEXT) RETURNS TABLE(client_id UUID, scopes TEXT[], is_valid BOOLEAN)`,
  `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` (`20260110172925_a9616e50-….sql`).
- **Behavior**: joins `api_access_tokens` → `api_clients` on `access_token = token`, returns
  `(client_id, scopes, is_valid)` where `is_valid = (expires_at > now() AND c.is_active)`; then
  UPDATEs `api_access_tokens.last_used_at = now()` for that token.
- **Reads**: `api_access_tokens`, `api_clients`. **Writes**: `api_access_tokens` (`last_used_at`).
- **Grants**: none explicit (PG default).
- **Callers**: **no app callers found.** Also no edge-function callers: the `api-reports` edge
  function validates bearer tokens with a direct `.from("api_access_tokens")` query rather than this
  RPC (`supabase/functions/api-reports/index.ts:18-35`); `oauth-token` likewise queries the table
  directly (`supabase/functions/oauth-token/index.ts:52-76`). The only repo reference outside
  migrations is the generated type at `src/integrations/supabase/types.ts:3696` (not a call site).
  This RPC is **defined but dead** with respect to current code paths.

### `public.validate_inspection_templates()`

- Latest definition `20251120045114_44ed9877-….sql` (preceded by a `DROP FUNCTION IF EXISTS`; the
  prior `20251120045029` version had a buggy first CTE since corrected).
- **Signature**: `() RETURNS TABLE(template_id uuid, template_name text, issue_type text,
  issue_description text)`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- **Behavior**: scans `inspection_templates.sections` (jsonb), UNION-ALL of three checks — structure
  (`'Structure'`: null/non-array/empty), missing section name (`'Missing Name'`), duplicate section
  ids (`'Duplicate ID'`). Read-only diagnostic.
- **Reads**: `inspection_templates`. **Writes**: none.
- **Grants**: `GRANT EXECUTE … TO authenticated` (no anon).
- **Callers**: `src/views/TemplateValidator.tsx:32` — `supabase.rpc('validate_inspection_templates')`.

---

## Dropped

### `public.temp_reset_password()` — created, executed, and DROPPED in one migration

`20260212144831_85c05452-….sql` does, in order:
1. `CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`
2. `CREATE OR REPLACE FUNCTION public.temp_reset_password() RETURNS void LANGUAGE plpgsql
   SECURITY DEFINER SET search_path = 'public','extensions'` — finds the `auth.users` row for the
   hardcoded email `'marries.liesie@gmail.com'`, raises if absent, else sets
   `encrypted_password = extensions.crypt('Marries@001', extensions.gen_salt('bf'))`.
3. `SELECT public.temp_reset_password();` (runs it once),
4. `DROP FUNCTION public.temp_reset_password();`.

**Effective state: the function does NOT exist** (dropped in the same migration). It was a one-shot
password reset for a single hardcoded account; the plaintext password was committed to the migration.
No code references it (`temp_reset_password` appears nowhere in `src`/`supabase/functions`).

---

## Notes & unverified items

- "PG default (PUBLIC)" EXECUTE grants are inferred from `CREATE FUNCTION` semantics, not a live
  `pg_proc.proacl` query — see the ⚠️ UNVERIFIED note under the summary table.
- `inspections_auto_link_subsection`, `sync_coc_compliance_status`, `track_floor_plan_pin_changes`,
  `update_updated_at_column` are trigger functions; they have a nominal PUBLIC EXECUTE but are
  exercised via their triggers, not direct calls. Listed as "no app callers found".
- `validate_api_token` is the only non-trigger, non-dropped RPC here with no caller of any kind.
- The tier-2 lockdown file changes no function in this batch; it is cited only as the security
  context that makes the `get_public_*` RPCs necessary.
