-- One register row per meter per premises, enforced by the database.
--
-- The key mirrors registerRowKey() in src/lib/assetVerification.ts — keep them in step:
--   premises: trimmed, upper-cased
--   meter:    the first run of 6+ digits if there is one ("35727818 METER OFF" -> 35727818),
--             otherwise the serial upper-cased with only letters and digits kept
-- Serials with no digit at all (blank, "TBC", "N/A", "COMMON AREA") are notes, not meters, and
-- are left out of the index, exactly as the app never treats them as the same meter.
--
-- PREREQUISITE: existing duplicates must be removed first (register_duplicates_CLEANUP.sql,
-- run and verified 2026-10-22+). If any remain this stops with the count and changes nothing.
do $$
declare
  v_dupes integer;
begin
  select count(*) into v_dupes
  from (
    select 1
    from public.site_assets
    where asset_category = 'electrical_meter' and meter_serial_number ~ '\d'
    group by site_id,
             upper(regexp_replace(premises_id, '^\s+|\s+$', '', 'g')),
             coalesce(substring(meter_serial_number from '\d{6,}'),
                      upper(regexp_replace(meter_serial_number, '[^A-Za-z0-9]', '', 'g')))
    having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception 'site_assets still has % duplicate premises+serial groups; run the cleanup first', v_dupes;
  end if;
end;
$$;

create unique index if not exists site_assets_one_row_per_meter
  on public.site_assets (
    site_id,
    upper(regexp_replace(premises_id, '^\s+|\s+$', '', 'g')),
    coalesce(substring(meter_serial_number from '\d{6,}'),
             upper(regexp_replace(meter_serial_number, '[^A-Za-z0-9]', '', 'g')))
  )
  where asset_category = 'electrical_meter' and meter_serial_number ~ '\d';
