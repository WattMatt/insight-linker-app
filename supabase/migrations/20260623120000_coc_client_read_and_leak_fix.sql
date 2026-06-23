-- Close the cross-tenant leak on the COC tables (previously `using (true)` for SELECT
-- AND for INSERT/UPDATE/DELETE), and grant clients read access to their own site's COC
-- schedule + certificates. Staff (anyone who is NOT a Client: Admin / Contractor / User)
-- keep full access exactly as before.

-- ── SELECT: coc_import_batches (clients do NOT need this; staff-only read) ─────
drop policy if exists "auth read coc_import_batches" on public.coc_import_batches;

create policy "staff read coc_import_batches"
  on public.coc_import_batches for select to authenticated
  using (not public.has_role(auth.uid(), 'Client'));

-- ── SELECT: coc_db_schedule (staff full read + clients own-site read) ──────────
drop policy if exists "auth read coc_db_schedule" on public.coc_db_schedule;

create policy "staff read coc_db_schedule"
  on public.coc_db_schedule for select to authenticated
  using (not public.has_role(auth.uid(), 'Client'));

create policy "clients read own site coc_db_schedule"
  on public.coc_db_schedule for select to authenticated
  using (
    public.has_role(auth.uid(), 'Client') and
    site_id in (select id from public.sites where client_id = public.get_user_client_id())
  );

-- ── SELECT: coc_certificates (staff full read + clients own-site read) ─────────
drop policy if exists "auth read coc_certificates" on public.coc_certificates;

create policy "staff read coc_certificates"
  on public.coc_certificates for select to authenticated
  using (not public.has_role(auth.uid(), 'Client'));

create policy "clients read own site coc_certificates"
  on public.coc_certificates for select to authenticated
  using (
    public.has_role(auth.uid(), 'Client') and
    site_id in (select id from public.sites where client_id = public.get_user_client_id())
  );

-- ── WRITES: lock INSERT/UPDATE/DELETE to non-clients (staff only) ──────────────
-- Previously `using (true)` allowed any authenticated user (incl. clients) to mutate
-- any site's COC data. Clients have no write UI, so this is non-breaking.
do $$
declare t text;
begin
  foreach t in array array['coc_import_batches','coc_db_schedule','coc_certificates'] loop
    execute format('drop policy if exists "auth insert %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "auth update %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "auth delete %1$s" on public.%1$s;', t);

    execute format($f$create policy "staff insert %1$s" on public.%1$s
      for insert to authenticated with check (not public.has_role(auth.uid(), 'Client'));$f$, t);
    execute format($f$create policy "staff update %1$s" on public.%1$s
      for update to authenticated using (not public.has_role(auth.uid(), 'Client'))
      with check (not public.has_role(auth.uid(), 'Client'));$f$, t);
    execute format($f$create policy "staff delete %1$s" on public.%1$s
      for delete to authenticated using (not public.has_role(auth.uid(), 'Client'));$f$, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
