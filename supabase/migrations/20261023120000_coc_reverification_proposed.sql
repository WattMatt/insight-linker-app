-- COC re-verification import (proposed verdicts) — DRAFT, NOT APPLIED.
--
-- Lets an external re-verification batch (e.g. (647) Fortress strict re-verification,
-- Oct 2026) land in coc_certificates WITHOUT changing anything users see as final:
--   * The new verdict goes in proposed_verdict. `verdict` stays NULL until an engineer signs
--     off, so register-truth (docStatusFromVerdict, rollup_subsection_coc_status, public QR
--     verdict) is untouched by the import.
--   * Replace = superseded_at/superseded_by_batch_id. Legacy rows stay live (and visible) until
--     the record replacing them is signed off (sign_off_coc_certificate). No hard deletes;
--     superseded rows stay for audit.
--   * Each row has a stable record_key per site, so re-running a batch updates, never duplicates.
--   * Page images / PDFs are stored once per sha256 in coc_source_files.
--
-- Additive and idempotent. Existing rows get review_status 'final' (they are the current
-- workbook-imported register) and keep behaving exactly as today.
--
-- PROD APPLY: via Management API only (migration history has diverged — never `db push`).
-- Staging first.

-- ── coc_import_batches: versioned batch metadata ────────────────────────────────────────
-- Prod already has `kind` (default 'verdicts', check scope|verdicts|documents) plus `summary` and
-- `before_image`, added outside this repo's migrations (seen 2026-10-23). Keep those values and
-- only add 'reverification'.
alter table public.coc_import_batches
  add column if not exists kind text not null default 'verdicts',
  add column if not exists source_label text,
  add column if not exists source_hash text,          -- sha256 of the sorted per-file hash list
  add column if not exists source_files jsonb not null default '[]'::jsonb,  -- [{path, content_hash, size}]
  add column if not exists counts jsonb not null default '{}'::jsonb,        -- adds/updates/superseded/scored/...
  add column if not exists caveats jsonb not null default '[]'::jsonb;       -- batch-wide caveats (README)

alter table public.coc_import_batches drop constraint if exists coc_import_batches_kind_check;
alter table public.coc_import_batches add constraint coc_import_batches_kind_check
  check (kind in ('scope', 'verdicts', 'documents', 'reverification'));

-- ── coc_certificates: proposed verdicts, sign-off, superseded state ────────────────────
alter table public.coc_certificates
  add column if not exists record_key text,                 -- stable per-site key from the source (e.g. 'doc023_13')
  add column if not exists review_status text not null default 'final',
  add column if not exists proposed_verdict text,           -- PASS | FAIL | REVIEW (strict policy)
  add column if not exists proposed_verdict_alt text,       -- judgement policy, for comparison only
  add column if not exists rule_results jsonb not null default '[]'::jsonb,  -- [{rule,res,note,val}] as delivered
  add column if not exists flags jsonb not null default '[]'::jsonb,
  add column if not exists caveats jsonb not null default '[]'::jsonb,
  add column if not exists copies jsonb not null default '[]'::jsonb,        -- record ids folded into this one (copy_of)
  add column if not exists db_name text,
  add column if not exists building text,
  add column if not exists reg_person text,
  add column if not exists reg_no text,
  add column if not exists form_type text,
  add column if not exists source_content_hash text,        -- hash of the mapped source record (change detection)
  add column if not exists supersedes_ids uuid[] not null default '{}',
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_batch_id uuid references public.coc_import_batches(id) on delete set null,
  add column if not exists signed_off_by uuid references auth.users(id),
  add column if not exists signed_off_at timestamptz,
  add column if not exists sign_off_note text;

alter table public.coc_certificates drop constraint if exists coc_certificates_review_status_check;
alter table public.coc_certificates add constraint coc_certificates_review_status_check
  check (review_status in ('final', 'proposed', 'signed_off', 'rejected'));

-- A proposed row never carries a final verdict; only sign-off may set one.
alter table public.coc_certificates drop constraint if exists coc_certificates_proposed_has_no_verdict;
alter table public.coc_certificates add constraint coc_certificates_proposed_has_no_verdict
  check (review_status <> 'proposed' or verdict is null);

alter table public.coc_certificates drop constraint if exists coc_certificates_signoff_consistent;
alter table public.coc_certificates add constraint coc_certificates_signoff_consistent
  check ((review_status = 'signed_off') = (signed_off_at is not null));

-- Stable key: one row per (site, record_key), superseded or not — a re-run updates in place.
create unique index if not exists uq_coc_certificates_site_record_key
  on public.coc_certificates(site_id, record_key) where record_key is not null;
create index if not exists idx_coc_certificates_live
  on public.coc_certificates(site_id) where superseded_at is null;

-- Signed-off rows are frozen against importer overwrites: the proposed content, the
-- superseded marker and the sign-off itself cannot change once signed.
create or replace function public.coc_certificates_guard_signed_off()
returns trigger language plpgsql as $fn$
begin
  if old.signed_off_at is not null and (
       new.proposed_verdict      is distinct from old.proposed_verdict
    or new.rule_results          is distinct from old.rule_results
    or new.source_content_hash   is distinct from old.source_content_hash
    or new.superseded_at         is distinct from old.superseded_at
    or new.signed_off_at         is distinct from old.signed_off_at
    or new.signed_off_by         is distinct from old.signed_off_by
  ) then
    raise exception 'coc_certificates %: row is signed off (%); refusing to change it', old.id, old.signed_off_at;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_coc_certificates_guard_signed_off on public.coc_certificates;
create trigger trg_coc_certificates_guard_signed_off
  before update on public.coc_certificates
  for each row execute function public.coc_certificates_guard_signed_off();

-- ── Sign-off: the ONLY path that turns a proposed verdict into a final one ─────────────
-- Accept: verdict := proposed_verdict, rules := {code: res} from rule_results, and the legacy
--   rows listed in supersedes_ids are superseded NOW (they stay visible until this point).
--   The linked COC document is re-stamped from the verdict, which fires the subsection rollup.
-- Reject: the proposed row is parked as 'rejected'; legacy rows stay live.
-- Admin only (there is no separate Engineer role in app_role).
create or replace function public.sign_off_coc_certificate(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare c public.coc_certificates;
begin
  if not public.has_role(auth.uid(), 'Admin') then
    raise exception 'sign-off requires the Admin role';
  end if;
  if p_decision not in ('accept', 'reject') then
    raise exception 'decision must be accept or reject, got %', p_decision;
  end if;

  select * into c from public.coc_certificates where id = p_id for update;
  if not found then raise exception 'coc_certificates % not found', p_id; end if;
  if c.review_status <> 'proposed' or c.superseded_at is not null then
    raise exception 'coc_certificates % is % (superseded %), not a live proposed row', p_id, c.review_status, c.superseded_at;
  end if;

  if p_decision = 'reject' then
    update public.coc_certificates
       set review_status = 'rejected', signed_off_by = auth.uid(), sign_off_note = p_note, updated_at = now()
     where id = p_id;
    return;
  end if;

  update public.coc_certificates
     set review_status = 'signed_off',
         verdict = c.proposed_verdict,
         rules = coalesce((select jsonb_object_agg(r->>'rule', r->>'res') from jsonb_array_elements(c.rule_results) r), '{}'::jsonb),
         signed_off_by = auth.uid(), signed_off_at = now(), sign_off_note = p_note, updated_at = now()
   where id = p_id;

  update public.coc_certificates
     set superseded_at = now(), superseded_by_batch_id = c.import_batch_id, updated_at = now()
   where id = any(c.supersedes_ids) and superseded_at is null and signed_off_at is null;

  -- Register-truth stamp, same mapping as docStatusFromVerdict() in src/lib/siteCoc/verdictMap.ts.
  if c.coc_document_id is not null then
    update public.subsection_documents
       set coc_status = case when upper(coalesce(c.proposed_verdict, '')) like 'PASS%' then 'Pass'
                             when upper(coalesce(c.proposed_verdict, '')) like 'FAIL%' then 'Fail'
                             else 'Pending' end
     where id = c.coc_document_id;
  end if;
end;
$fn$;

revoke all on function public.sign_off_coc_certificate(uuid, text, text) from public, anon;
grant execute on function public.sign_off_coc_certificate(uuid, text, text) to authenticated;

-- ── Manual supersede: for legacy rows no re-verification record replaces ──────────────
-- (e.g. the 73 Fortress rows with no matching certificate in the Oct 2026 batch). Hides the
-- row from clients and reports; keeps it for audit. Signed-off rows cannot be superseded here.
create or replace function public.supersede_coc_certificate(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.has_role(auth.uid(), 'Admin') then
    raise exception 'superseding requires the Admin role';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'a note explaining why is required';
  end if;
  update public.coc_certificates
     set superseded_at = now(),
         notes = concat_ws(E'\n', notes, format('Superseded manually %s by %s: %s', now()::date, auth.uid(), p_note)),
         updated_at = now()
   where id = p_id and superseded_at is null and signed_off_at is null;
  if not found then
    raise exception 'coc_certificates % not found, already superseded, or signed off', p_id;
  end if;
end;
$fn$;

revoke all on function public.supersede_coc_certificate(uuid, text) from public, anon;
grant execute on function public.supersede_coc_certificate(uuid, text) to authenticated;

-- ── Clients: never see proposed, rejected or superseded rows ───────────────────────────
-- (Supersedes the policy in 20260805120000_managing_agencies.)
drop policy if exists "clients read own site coc_certificates" on public.coc_certificates;
create policy "clients read own site coc_certificates"
  on public.coc_certificates
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'Client')
    and site_id in (select public.get_user_visible_site_ids())
    and review_status in ('final', 'signed_off')
    and superseded_at is null
  );

-- ── Source files: upload once per content hash ─────────────────────────────────────────
create table if not exists public.coc_source_files (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  first_batch_id uuid references public.coc_import_batches(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.coc_certificate_source_files (
  certificate_id uuid not null references public.coc_certificates(id) on delete cascade,
  source_file_id uuid not null references public.coc_source_files(id) on delete restrict,
  role text not null default 'page',   -- page | pdf | signoff_card
  page_no int,
  primary key (certificate_id, source_file_id, role)
);

alter table public.coc_source_files enable row level security;
alter table public.coc_certificate_source_files enable row level security;

-- Staff only (same rule as the other COC tables); clients get no access to source scans.
do $$
declare t text;
begin
  foreach t in array array['coc_source_files', 'coc_certificate_source_files'] loop
    execute format('drop policy if exists "staff read %1$s"   on public.%1$s;', t);
    execute format('drop policy if exists "staff insert %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "staff update %1$s" on public.%1$s;', t);
    execute format($f$create policy "staff read %1$s" on public.%1$s
      for select to authenticated using (not public.has_role(auth.uid(), 'Client'));$f$, t);
    execute format($f$create policy "staff insert %1$s" on public.%1$s
      for insert to authenticated with check (not public.has_role(auth.uid(), 'Client'));$f$, t);
    execute format($f$create policy "staff update %1$s" on public.%1$s
      for update to authenticated using (not public.has_role(auth.uid(), 'Client'))
      with check (not public.has_role(auth.uid(), 'Client'));$f$, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
