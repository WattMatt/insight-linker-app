-- Inspection status markers → existence-based compliance.
--
-- The inspection status enum (Pending/In Progress/Completed/Cancelled) no longer gates
-- which inspection "counts". recompute_subsection_installation_status now scores the most
-- recent inspection per template by date, regardless of status — the mere presence of a
-- (non-deleted) inspection is the signal. Voiding an inspection becomes a soft-delete
-- (deleted_at), which this function already respects.
--
-- Applied to PROD via the Management API on 2026-06-15, followed by a full
-- apply_subsection_recompute() across all subsections (prod-drift: not via db push).
-- The status column is retained (unused for compliance/health); the standalone
-- /inspections view + dashboards still display it pending a Phase-2 UI sweep.

CREATE OR REPLACE FUNCTION public.recompute_subsection_installation_status(p_subsection_id uuid)
 RETURNS TABLE(status text, score numeric, total_answered integer, passed_items integer, open_physical integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_pass_threshold        numeric := public.get_compliance_setting_numeric('pass_threshold', 80);
  v_attention_threshold   numeric := public.get_compliance_setting_numeric('attention_threshold', 50);
  v_photo_upgrades        boolean := public.get_compliance_setting_bool('photo_presence_upgrades', true);
  v_snag_demotes          boolean := public.get_compliance_setting_bool('snag_demotes_compliant', true);
  v_open_physical integer;
  v_total integer := 0;
  v_pass  integer := 0;
  v_fail  integer := 0;
  v_score numeric;
  v_status text;
  v_has_relevant boolean := false;
  rec record;
  v_section jsonb;
  v_item jsonb;
  v_section_id text;
  v_item_id text;
  v_leaf jsonb;
  v_classified text;
  v_photos jsonb;
begin
  select count(*) into v_open_physical
  from public.snags sn
  where sn.subsection_id = p_subsection_id
    and sn.snag_type = 'physical'
    and sn.status in ('open', 'in_progress')
    and sn.deleted_at is null;

  -- Existence-based: most recent inspection per template, regardless of status marker.
  for rec in
    select distinct on (i.template_id)
      i.id, i.template_id, i.json_data, t.sections
    from public.inspections i
    left join public.inspection_templates t on t.id = i.template_id
    where i.subsection_id = p_subsection_id
      and i.deleted_at is null
    order by i.template_id, coalesce(i.inspection_date, i.updated_at) desc
  loop
    v_has_relevant := true;
    if rec.sections is null or jsonb_typeof(rec.sections) <> 'array' then
      continue;
    end if;
    for v_section in select * from jsonb_array_elements(rec.sections)
    loop
      v_section_id := v_section ->> 'id';
      if v_section_id is null then continue; end if;
      if jsonb_typeof(v_section -> 'items') <> 'array' then continue; end if;
      for v_item in select * from jsonb_array_elements(v_section -> 'items')
      loop
        v_item_id := v_item ->> 'id';
        if v_item_id is null then continue; end if;
        v_total := v_total + 1;
        v_leaf := rec.json_data -> v_section_id -> v_item_id;
        if v_leaf is null then continue; end if;
        v_classified := public.classify_field_status(v_leaf -> 'status');
        if v_photo_upgrades and v_classified = 'pending' then
          v_photos := v_leaf -> 'photos';
          if jsonb_typeof(v_photos) = 'array' and jsonb_array_length(v_photos) > 0 then
            v_classified := 'pass';
          end if;
        end if;
        if v_classified = 'pass' then
          v_pass := v_pass + 1;
        elsif v_classified = 'fail' then
          v_fail := v_fail + 1;
        end if;
      end loop;
    end loop;
  end loop;

  if not v_has_relevant then
    return query select 'incomplete'::text, null::numeric, 0, 0, v_open_physical;
    return;
  end if;
  if v_total = 0 then
    return query select 'requires_attention'::text, null::numeric, 0, 0, v_open_physical;
    return;
  end if;
  v_score := (v_pass::numeric / v_total::numeric) * 100.0;
  if v_fail > 0 then
    v_status := 'non_compliant';
  elsif v_score >= v_pass_threshold then
    v_status := case when v_snag_demotes and v_open_physical > 0 then 'requires_attention' else 'compliant' end;
  elsif v_score >= v_attention_threshold then
    v_status := 'requires_attention';
  else
    v_status := 'requires_attention';
  end if;
  return query select v_status, v_score, v_total, v_pass, v_open_physical;
end;
$function$;
