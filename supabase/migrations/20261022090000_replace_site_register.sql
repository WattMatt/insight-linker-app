-- Replace a site's electrical register in ONE transaction.
--
-- The importer used to insert the new batch from the browser and then delete the old rows in a
-- second call. Any failure or interruption between the two — and every import made before the
-- existing register had loaded, which skipped the delete entirely — left the whole register on
-- the site twice (414 duplicate rows across 8 sites by 2026-09-23; YARONA CENTRE 30 of 30 on
-- 2026-10-07). Here delete and insert commit together or not at all.
--
-- SECURITY INVOKER: the caller's own site_assets RLS applies. If RLS ever lets the caller see
-- rows it may not delete, the delete would silently skip them and recreate duplicates, so the
-- delete count is checked against what was visible and the whole call fails instead.
create or replace function public.replace_site_register(p_site_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_visible integer;
  v_deleted integer;
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'replace_site_register: not signed in' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'replace_site_register: no rows to import' using errcode = '22023';
  end if;

  -- Two imports for the same site at once would each delete only the rows they can see and
  -- both inserts would survive. Serialize per site.
  perform pg_advisory_xact_lock(hashtext('replace_site_register:' || p_site_id::text));

  select count(*) into v_visible
  from site_assets
  where site_id = p_site_id and asset_category = 'electrical_meter';

  delete from site_assets
  where site_id = p_site_id and asset_category = 'electrical_meter';
  get diagnostics v_deleted = row_count;

  if v_deleted <> v_visible then
    raise exception 'replace_site_register: could only remove % of % existing register rows; nothing was changed',
      v_deleted, v_visible using errcode = '42501';
  end if;

  insert into site_assets (
    site_id, premises_id, trade_as, asset_category, meter_serial_number, meter_type, ct_ratio,
    breaker_size, reading_at_commissioning, old_meter_serial_number, last_meter_read_old,
    comments, created_by, import_batch_id
  )
  select
    p_site_id,
    btrim(r.premises_id),
    nullif(btrim(r.trade_as), ''),
    'electrical_meter',
    nullif(btrim(r.meter_serial_number), ''),
    nullif(btrim(r.meter_type), ''),
    nullif(btrim(r.ct_ratio), ''),
    nullif(btrim(r.breaker_size), ''),
    nullif(btrim(r.reading_at_commissioning), ''),
    nullif(btrim(r.old_meter_serial_number), ''),
    nullif(btrim(r.last_meter_read_old), ''),
    nullif(btrim(r.comments), ''),
    auth.uid(),
    v_batch
  from jsonb_to_recordset(p_rows) as r(
    premises_id text, trade_as text, meter_serial_number text, meter_type text, ct_ratio text,
    breaker_size text, reading_at_commissioning text, old_meter_serial_number text,
    last_meter_read_old text, comments text
  );
  get diagnostics v_inserted = row_count;

  return v_inserted;
end;
$$;

revoke all on function public.replace_site_register(uuid, jsonb) from public, anon;
grant execute on function public.replace_site_register(uuid, jsonb) to authenticated;
