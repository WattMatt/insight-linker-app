-- Fix the trg_recompute_from_template() trigger function.
--
-- This trigger (AFTER UPDATE ON inspection_templates) was created directly in
-- prod (drift — never recorded in the repo) during the existence-based-compliance
-- work. Its body referenced NEW.sections_json / OLD.sections_json, but the column
-- is `sections` (there is no `sections_json` column). As a result EVERY update to
-- inspection_templates errored with:
--   record "new" has no field "sections_json"
-- which silently blocked ALL template editing app-wide (including adding the new
-- `document` field type). Corrected to compare `sections`.
--
-- Applied to prod 2026-06-16 via the Management API; this migration records it.

CREATE OR REPLACE FUNCTION public.trg_recompute_from_template()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
declare
  rec record;
begin
  if NEW.sections is not distinct from OLD.sections then
    return null;   -- nothing meaningful changed
  end if;

  for rec in
    select distinct i.subsection_id
    from public.inspections i
    where i.template_id = NEW.id
      and i.subsection_id is not null
  loop
    perform public.apply_subsection_recompute(rec.subsection_id);
  end loop;

  return null;
end;
$function$;
