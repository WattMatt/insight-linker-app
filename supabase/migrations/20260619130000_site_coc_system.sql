-- Site COC system: ingest the COC working workbooks into structured, subsection-integrated
-- tables. Each upload replaces the site's imported set (batch-scoped). The Verification SANS
-- grid is stored as jsonb on coc_certificates. RLS: authenticated-only (no anon).

create table if not exists public.coc_import_batches (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  uploaded_by uuid references auth.users(id),
  schedule_file_name text,
  verification_file_name text,
  certs_imported int default 0,
  shops_imported int default 0,
  matched_count int default 0,
  unmatched_count int default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.coc_db_schedule (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  subsection_id uuid references public.subsections(id) on delete set null,
  import_batch_id uuid references public.coc_import_batches(id) on delete cascade,
  shop_no_raw text,
  trading_name text,
  coc_required text,
  initial_cert_nos text,
  supplementary_cert_nos text,
  unclear text,
  supp_to_initial_ref text,
  files_count int,
  status text,
  notes text,
  match_status text not null default 'matched',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coc_certificates (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  subsection_id uuid references public.subsections(id) on delete set null,
  import_batch_id uuid references public.coc_import_batches(id) on delete cascade,
  shop_no_raw text,
  cert_no text,
  cert_no_norm text,
  cert_type text,
  doc_type text,
  clause_9_2 text,
  supp_to_init text,
  issued_date date,
  location text,
  confidence text,
  source_file text,
  verdict text,
  reasons text,
  rules jsonb not null default '{}'::jsonb,
  notes text,
  match_status text not null default 'matched',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_coc_db_schedule_site on public.coc_db_schedule(site_id);
create index if not exists idx_coc_db_schedule_subsection on public.coc_db_schedule(subsection_id);
create index if not exists idx_coc_certificates_site on public.coc_certificates(site_id);
create index if not exists idx_coc_certificates_subsection on public.coc_certificates(subsection_id);

alter table public.coc_import_batches enable row level security;
alter table public.coc_db_schedule enable row level security;
alter table public.coc_certificates enable row level security;

-- coc_import_batches
create policy "auth read coc_import_batches"   on public.coc_import_batches for select to authenticated using (true);
create policy "auth insert coc_import_batches" on public.coc_import_batches for insert to authenticated with check (true);
create policy "auth update coc_import_batches" on public.coc_import_batches for update to authenticated using (true) with check (true);
create policy "auth delete coc_import_batches" on public.coc_import_batches for delete to authenticated using (true);

-- coc_db_schedule
create policy "auth read coc_db_schedule"   on public.coc_db_schedule for select to authenticated using (true);
create policy "auth insert coc_db_schedule" on public.coc_db_schedule for insert to authenticated with check (true);
create policy "auth update coc_db_schedule" on public.coc_db_schedule for update to authenticated using (true) with check (true);
create policy "auth delete coc_db_schedule" on public.coc_db_schedule for delete to authenticated using (true);

-- coc_certificates
create policy "auth read coc_certificates"   on public.coc_certificates for select to authenticated using (true);
create policy "auth insert coc_certificates" on public.coc_certificates for insert to authenticated with check (true);
create policy "auth update coc_certificates" on public.coc_certificates for update to authenticated using (true) with check (true);
create policy "auth delete coc_certificates" on public.coc_certificates for delete to authenticated using (true);

notify pgrst, 'reload schema';
