-- COC verdict becomes a GATE on is_compliant, integrated into the inspection-driven
-- recompute. A failed/expired COC forces non-compliant; a Pass does NOT auto-promote.
-- Drops the old informational BEFORE-trigger so is_compliant has a single owner.

DROP TRIGGER IF EXISTS trg_sync_coc_compliance ON public.subsections;
DROP FUNCTION IF EXISTS public.sync_coc_compliance_status();

-- Re-create apply_subsection_recompute with the COC gate appended. Body is the live
-- definition plus the gate block (vocab-tolerant for the transitional old-flow writes).
CREATE OR REPLACE FUNCTION public.apply_subsection_recompute(p_subsection_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  r record;
  v_is_compliant boolean;
  c record;
  v_coc_fail boolean;
begin
  if p_subsection_id is null then return; end if;

  select * into r from public.recompute_subsection_installation_status(p_subsection_id);

  v_is_compliant := case r.status
    when 'compliant'          then true
    when 'non_compliant'      then false
    when 'requires_attention' then false
    when 'incomplete'         then null
  end;

  -- COC gate: a required COC that is failed/rejected, or an expired pass, forces
  -- is_compliant = false. Vocab-tolerant (old flow may still write Failed/Approved).
  select s.is_coc_required, s.coc_status, s.coc_expiry_date
    into c
    from public.subsections s where s.id = p_subsection_id;
  v_coc_fail := coalesce(c.is_coc_required, false) and (
       c.coc_status in ('Fail','Failed','Rejected')
    or (c.coc_status in ('Pass','Approved','Valid')
        and c.coc_expiry_date is not null
        and c.coc_expiry_date < current_date)
  );
  if v_coc_fail then
    v_is_compliant := false;
  end if;

  update public.subsections s
     set installation_status = r.status,
         installation_score  = r.score,
         is_compliant        = v_is_compliant,
         updated_at          = now()
   where s.id = p_subsection_id
     and s.deleted_at is null
     and (
       coalesce(s.installation_status, '') <> coalesce(r.status, '')
       or coalesce(s.installation_score, -1) <> coalesce(r.score, -1)
       or coalesce(s.is_compliant, false) <> coalesce(v_is_compliant, false)
     );
end;
$function$;

-- Backfill: recompute every live subsection so is_compliant reflects the gate.
DO $do$
DECLARE rec record;
BEGIN
  FOR rec IN SELECT id FROM public.subsections WHERE deleted_at IS NULL LOOP
    PERFORM public.apply_subsection_recompute(rec.id);
  END LOOP;
END;
$do$;

NOTIFY pgrst, 'reload schema';
