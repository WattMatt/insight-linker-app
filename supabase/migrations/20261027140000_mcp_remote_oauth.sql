-- Remote MCP server (https://watsonmattheus.com/api/mcp), approved by Arno 27 Oct 2026 12:08.
--
-- 1. OAuth 2.1 state for the MCP connector: registered clients (RFC 7591 DCR and client ID
--    metadata documents), authorization codes (5 minutes, single use) and refresh tokens (rotated on
--    every use). Codes and tokens are stored as SHA-256 hashes only.
-- 2. mcp_audit_log: one row per tool call (user, client, tool, args, result summary).
-- 3. mcp_fortress_snapshots: the "snapshot first" copies taken before any MCP write (the stdio server
--    wrote these to local files; serverless has no persistent disk).
-- 4. mcp_confirm_tokens_used: makes dry-run confirm tokens single use across serverless instances.
-- 5. fortress_sign_off_judgement(): one site's judgement sign-off in ONE transaction, through
--    sign_off_coc_certificate_judgement() (Admin only), with the same pre-checks as the 27 Oct run.
-- 6. fortress_replace_cocs(): the mcp-fortress write path (unchanged from mcp-fortress/sql/).
--
-- Tables 1-4 have RLS on and no policies: only the server (service role) reads or writes them.
-- PROD APPLY: via Management API only (migration history has diverged — never `db push`).

create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null,
  source text not null check (source in ('dcr', 'metadata_document')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_codes (
  code_hash text primary key,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null,
  resource text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mcp_oauth_codes_expires_idx on public.mcp_oauth_codes (expires_at);

create table if not exists public.mcp_oauth_refresh_tokens (
  token_hash text primary key,
  family_id uuid not null,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  resource text,
  expires_at timestamptz not null,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mcp_oauth_refresh_family_idx on public.mcp_oauth_refresh_tokens (family_id);

create table if not exists public.mcp_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  client_id text,
  tool text not null,
  args jsonb,
  ok boolean not null,
  summary text,
  duration_ms integer
);
create index if not exists mcp_audit_log_at_idx on public.mcp_audit_log (at desc);

create table if not exists public.mcp_fortress_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id),
  user_id uuid,
  reason text not null,
  taken_at timestamptz not null default now(),
  counts jsonb not null default '{}'::jsonb,
  data jsonb not null
);
create index if not exists mcp_fortress_snapshots_site_idx on public.mcp_fortress_snapshots (site_id, taken_at desc);

create table if not exists public.mcp_confirm_tokens_used (
  token_hash text primary key,
  user_id uuid,
  tool text not null,
  used_at timestamptz not null default now()
);

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_refresh_tokens enable row level security;
alter table public.mcp_audit_log enable row level security;
alter table public.mcp_fortress_snapshots enable row level security;
alter table public.mcp_confirm_tokens_used enable row level security;
revoke all on public.mcp_oauth_clients, public.mcp_oauth_codes, public.mcp_oauth_refresh_tokens,
  public.mcp_audit_log, public.mcp_fortress_snapshots, public.mcp_confirm_tokens_used from anon, authenticated;

-- ── Judgement sign-off for one site, one transaction ───────────────────────────────────────────
-- Same rules as the 27 Oct 2026 run (pull folder judgement_plan.mjs): the caller (TypeScript) picks
-- the ids; this function refuses unless every id is a live, unsigned proposed row of p_site_id with a
-- verdict_alt, from a non-June-2026 batch, whose linked older rows are not June 2026, not on another
-- shop, and carry no differing final verdict. Then each goes through
-- sign_off_coc_certificate_judgement() (Admin check inside) and the result is verified.
create or replace function public.fortress_sign_off_judgement(p_site_id uuid, p_ids uuid[], p_expect_superseded int)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare v_ok int; v_sup_before int; v_sup_after int; v_n int := coalesce(array_length(p_ids, 1), 0); i uuid;
  cls_old text; cls_new text;
begin
  if auth.uid() is null then raise exception 'fortress_sign_off_judgement: not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.sites s join public.clients c on c.id = s.client_id
                  where s.id = p_site_id and c.name = 'Fortress_Fund') then
    raise exception 'fortress_sign_off_judgement: site % is not a Fortress site', p_site_id using errcode = '42501';
  end if;
  if v_n = 0 then return jsonb_build_object('signed', 0, 'superseded', 0); end if;
  perform pg_advisory_xact_lock(hashtext('fortress_sign_off:' || p_site_id::text));

  select count(*) into v_ok
    from public.coc_certificates c left join public.coc_import_batches b on b.id = c.import_batch_id
   where c.id = any(p_ids) and c.site_id = p_site_id and c.review_status = 'proposed' and c.superseded_at is null
     and c.signed_off_at is null and coalesce(btrim(c.proposed_verdict_alt), '') <> ''
     and not coalesce(b.created_at >= '2026-06-01' and b.created_at < '2026-07-01', false);
  if v_ok <> v_n then
    raise exception 'fortress_sign_off_judgement: % of % ids are live unsigned proposals of this site with a verdict_alt (non-June)', v_ok, v_n;
  end if;

  -- Linked older rows that would be superseded: none June 2026, none on another shop, none with a
  -- differing final verdict class.
  select count(*) into v_ok
    from public.coc_certificates p
    join public.coc_certificates l on l.id = any(p.supersedes_ids) and l.superseded_at is null and l.signed_off_at is null
    left join public.coc_import_batches b on b.id = l.import_batch_id
   where p.id = any(p_ids) and (
         coalesce(b.created_at >= '2026-06-01' and b.created_at < '2026-07-01', false)
      or (l.subsection_id is not null and l.subsection_id is distinct from p.subsection_id)
      or (coalesce(btrim(l.verdict), '') <> '' and
          (case when upper(btrim(l.verdict)) like 'PASS%' then 'p' when upper(btrim(l.verdict)) like 'FAIL%' then 'f'
                when upper(btrim(l.verdict)) like 'REVIEW%' then 'r' else 'o' end)
          is distinct from
          (case when upper(btrim(p.proposed_verdict_alt)) like 'PASS%' then 'p' when upper(btrim(p.proposed_verdict_alt)) like 'FAIL%' then 'f'
                when upper(btrim(p.proposed_verdict_alt)) like 'REVIEW%' then 'r' else 'o' end)));
  if v_ok > 0 then
    raise exception 'fortress_sign_off_judgement: % linked older row(s) are June 2026, on another shop, or carry a differing final verdict', v_ok;
  end if;

  select count(*) into v_sup_before from public.coc_certificates where site_id = p_site_id and superseded_at is not null;
  foreach i in array p_ids loop
    perform public.sign_off_coc_certificate_judgement(i, 'mcp-fortress sign_off_verdicts (judgement)');
  end loop;

  select count(*) into v_ok from public.coc_certificates
   where id = any(p_ids) and review_status = 'signed_off' and signed_off_by = auth.uid() and signed_off_at is not null
     and verdict = proposed_verdict_alt and rules = public.coc_judgement_rules(rule_results);
  if v_ok <> v_n then raise exception 'fortress_sign_off_judgement: verify: % of % signed with verdict_alt', v_ok, v_n; end if;
  select count(*) into v_sup_after from public.coc_certificates where site_id = p_site_id and superseded_at is not null;
  if v_sup_after - v_sup_before <> p_expect_superseded then
    raise exception 'fortress_sign_off_judgement: verify: superseded +%, planned %', v_sup_after - v_sup_before, p_expect_superseded;
  end if;
  return jsonb_build_object('signed', v_ok, 'superseded', v_sup_after - v_sup_before);
end;
$fn$;

revoke all on function public.fortress_sign_off_judgement(uuid, uuid[], int) from public, anon;
grant execute on function public.fortress_sign_off_judgement(uuid, uuid[], int) to authenticated;

create or replace function public.fortress_replace_cocs(
  p_site_id uuid,
  p_plan jsonb,          -- { adds: [...], updates: [...], superseded: [uuid...], counts: {...} }
  p_label text,
  p_source_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_batch uuid;
  v_adds jsonb := coalesce(p_plan->'adds', '[]');
  v_updates jsonb := coalesce(p_plan->'updates', '[]');
  v_sup jsonb := coalesce(p_plan->'superseded', '[]');
  v_n int;
  v_bad int;
begin
  if auth.uid() is null then
    raise exception 'fortress_replace_cocs: not signed in' using errcode = '42501';
  end if;
  if public.has_role(auth.uid(), 'Client') or public.has_role(auth.uid(), 'Contractor') then
    raise exception 'fortress_replace_cocs: staff only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sites s join public.clients c on c.id = s.client_id
                  where s.id = p_site_id and c.name = 'Fortress_Fund') then
    raise exception 'fortress_replace_cocs: site % is not a Fortress site', p_site_id using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('fortress_replace_cocs:' || p_site_id::text));

  -- Every row the plan names must be this site's, a re-verification row, not signed off, and not
  -- from a June 2026 import batch.
  select count(*) into v_bad
    from (select (u->>'id')::uuid as id from jsonb_array_elements(v_updates) u
          union all select x::uuid from jsonb_array_elements_text(v_sup) x) t
    left join public.coc_certificates c on c.id = t.id
    left join public.coc_import_batches b on b.id = c.import_batch_id
   where c.id is null or c.site_id <> p_site_id or c.record_key is null or c.signed_off_at is not null
      or (b.created_at >= '2026-06-01' and b.created_at < '2026-07-01');
  if v_bad > 0 then
    raise exception 'fortress_replace_cocs: % planned update/supersede row(s) are outside this site, legacy, signed off or June 2026', v_bad;
  end if;
  select count(*) into v_bad
    from jsonb_array_elements(v_adds) a, jsonb_array_elements_text(coalesce(a->'supersedes_ids','[]')) s
    left join public.coc_certificates c on c.id = s::uuid
   where c.id is null or c.site_id <> p_site_id;
  if v_bad > 0 then
    raise exception 'fortress_replace_cocs: % supersedes_ids are not rows of this site', v_bad;
  end if;

  insert into public.coc_import_batches (site_id, uploaded_by, kind, source_label, source_hash, counts, certs_imported, verification_file_name)
  values (p_site_id, auth.uid(), 'reverification', p_label, p_source_hash,
          coalesce(p_plan->'counts', '{}') || jsonb_build_object('via', 'mcp-fortress'),
          jsonb_array_length(v_adds), p_label)
  returning id into v_batch;

  insert into public.coc_certificates (site_id, import_batch_id, subsection_id, coc_document_id, eval_document_id,
      supersedes_ids, match_status, verdict, rules, review_status,
      record_key, proposed_verdict, proposed_verdict_alt, cert_no, cert_no_norm, cert_type, doc_type, issued_date,
      location, confidence, source_file, reasons, rule_results, flags, caveats, copies, db_name, building,
      reg_person, reg_no, form_type, notes, source_content_hash)
  select p_site_id, v_batch, (a->>'subsection_id')::uuid, (a->>'coc_document_id')::uuid, (a->>'eval_document_id')::uuid,
         coalesce(array(select jsonb_array_elements_text(a->'supersedes_ids')::uuid), '{}'),
         case when a->>'subsection_id' is not null then 'matched' else 'unmatched' end,
         null, '{}'::jsonb, 'proposed',
         r.record_key, r.proposed_verdict, r.proposed_verdict_alt, r.cert_no, r.cert_no_norm, r.cert_type, r.doc_type, r.issued_date,
         r.location, r.confidence, r.source_file, r.reasons, r.rule_results, r.flags, r.caveats, r.copies, r.db_name, r.building,
         r.reg_person, r.reg_no, r.form_type, r.notes, r.source_content_hash
    from jsonb_array_elements(v_adds) a,
         jsonb_to_record(a->'row') as r(record_key text, proposed_verdict text, proposed_verdict_alt text, cert_no text,
           cert_no_norm text, cert_type text, doc_type text, issued_date date, location text, confidence text,
           source_file text, reasons text, rule_results jsonb, flags jsonb, caveats jsonb, copies jsonb, db_name text,
           building text, reg_person text, reg_no text, form_type text, notes text, source_content_hash text);

  update public.coc_certificates c
     set import_batch_id = v_batch, review_status = 'proposed', verdict = null, superseded_at = null,
         superseded_by_batch_id = null, updated_at = now(),
         proposed_verdict = r.proposed_verdict, proposed_verdict_alt = r.proposed_verdict_alt, cert_no = r.cert_no,
         cert_no_norm = r.cert_no_norm, cert_type = r.cert_type, doc_type = r.doc_type, issued_date = r.issued_date,
         location = r.location, confidence = r.confidence, source_file = r.source_file, reasons = r.reasons,
         rule_results = r.rule_results, flags = r.flags, caveats = r.caveats, copies = r.copies, db_name = r.db_name,
         building = r.building, reg_person = r.reg_person, reg_no = r.reg_no, form_type = r.form_type, notes = r.notes,
         source_content_hash = r.source_content_hash
    from jsonb_array_elements(v_updates) u,
         jsonb_to_record(u->'row') as r(proposed_verdict text, proposed_verdict_alt text, cert_no text,
           cert_no_norm text, cert_type text, doc_type text, issued_date date, location text, confidence text,
           source_file text, reasons text, rule_results jsonb, flags jsonb, caveats jsonb, copies jsonb, db_name text,
           building text, reg_person text, reg_no text, form_type text, notes text, source_content_hash text)
   where c.id = (u->>'id')::uuid and c.site_id = p_site_id and c.signed_off_at is null;

  update public.coc_certificates c
     set superseded_at = now(), superseded_by_batch_id = v_batch, updated_at = now()
   where c.id in (select x::uuid from jsonb_array_elements_text(v_sup) x)
     and c.site_id = p_site_id and c.signed_off_at is null and c.superseded_at is null;

  -- Verify before commit.
  select count(*) into v_n from public.coc_certificates
   where import_batch_id = v_batch and review_status = 'proposed' and verdict is null and superseded_at is null;
  if v_n <> jsonb_array_length(v_adds) + jsonb_array_length(v_updates) then
    raise exception 'fortress_replace_cocs: proposed rows in batch % <> planned %', v_n, jsonb_array_length(v_adds) + jsonb_array_length(v_updates);
  end if;
  select count(*) into v_n from public.coc_certificates where superseded_by_batch_id = v_batch;
  if v_n <> jsonb_array_length(v_sup) then
    raise exception 'fortress_replace_cocs: superseded % <> planned %', v_n, jsonb_array_length(v_sup);
  end if;
  select count(*) into v_n from public.coc_certificates
   where import_batch_id = v_batch and (verdict is not null or signed_off_at is not null);
  if v_n <> 0 then
    raise exception 'fortress_replace_cocs: % rows in the batch carry a verdict or sign-off', v_n;
  end if;

  return jsonb_build_object('batch_id', v_batch, 'inserted', jsonb_array_length(v_adds),
                            'updated', jsonb_array_length(v_updates), 'superseded', jsonb_array_length(v_sup));
end;
$fn$;

revoke all on function public.fortress_replace_cocs(uuid, jsonb, text, text) from public, anon;
grant execute on function public.fortress_replace_cocs(uuid, jsonb, text, text) to authenticated;
notify pgrst, 'reload schema';
