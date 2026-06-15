-- Recompute subsections.is_compliant when an inspection changes.
--
-- BACKGROUND: is_compliant is single-owned by apply_subsection_recompute (the
-- inspection-driven installation recompute + COC gate). That function already
-- runs when a subsection row changes (trg_recompute_subsection_defender) and
-- when COC documents change (trg_rollup_coc_from_documents). But it was NEVER
-- wired to the `inspections` table — so completing/deleting an inspection
-- updated inspections.status yet left the subsection's server-side is_compliant
-- stale. This adds the missing trigger.
--
-- ⚠️ APPLY CAREFULLY: apply_subsection_recompute lives in prod (applied via the
-- Management API, not repo migrations — see the known schema drift). Do NOT blind
-- `supabase db push`; apply this in the SQL editor / Management API after
-- confirming prod has no equivalent inspections→recompute trigger already.
--
-- Recursion is safe: this calls apply_subsection_recompute DIRECTLY; its nested
-- UPDATE on subsections fires the defender at pg_trigger_depth()>1, which the
-- defender self-guards against (same pattern as trg_rollup_coc_from_documents).

CREATE OR REPLACE FUNCTION public.trg_recompute_from_inspections()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM public.apply_subsection_recompute(COALESCE(NEW.subsection_id, OLD.subsection_id));
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_recompute_from_inspections ON public.inspections;
CREATE TRIGGER trg_recompute_from_inspections
AFTER INSERT OR DELETE OR UPDATE OF status, subsection_id
ON public.inspections FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_from_inspections();

-- Backfill: recompute every live subsection so is_compliant reflects current inspections.
DO $do$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.subsections WHERE deleted_at IS NULL LOOP
    PERFORM public.apply_subsection_recompute(r.id);
  END LOOP;
END; $do$;

NOTIFY pgrst, 'reload schema';
