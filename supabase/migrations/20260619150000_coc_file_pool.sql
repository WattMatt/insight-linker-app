-- Site COC file pool: every dropped file uploads here first (never rejected). Exact register
-- matches auto-assign into the subsection's COC store; the rest are assigned manually from the pool.
create table if not exists public.coc_file_pool (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_size int,
  detected_cert_no text,
  detected_kind text,
  status text not null default 'pending',
  assigned_subsection_id uuid references public.subsections(id) on delete set null,
  assigned_document_id uuid references public.subsection_documents(id) on delete set null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_coc_file_pool_site on public.coc_file_pool(site_id);

alter table public.coc_file_pool enable row level security;
create policy "auth read coc_file_pool"   on public.coc_file_pool for select to authenticated using (true);
create policy "auth insert coc_file_pool" on public.coc_file_pool for insert to authenticated with check (true);
create policy "auth update coc_file_pool" on public.coc_file_pool for update to authenticated using (true) with check (true);
create policy "auth delete coc_file_pool" on public.coc_file_pool for delete to authenticated using (true);

notify pgrst, 'reload schema';
