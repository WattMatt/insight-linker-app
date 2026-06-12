-- Per-document COC: add expiry, normalise messy values, and derive subsections.coc_status
-- from the certificate documents (Initial + Supplementaries). The recompute gate
-- (apply_subsection_recompute) keeps reading subsections.coc_status; its legacy
-- expired-Pass branch is dropped (expiry is now folded into the per-document roll-up).

ALTER TABLE public.subsection_documents ADD COLUMN IF NOT EXISTS coc_expiry_date date;

-- The existing coc_status CHECK only allows the old vocab (pending/approved/rejected/…).
-- Relax it to the canonical set + legacy values so normalization and the manual
-- Pass/Fail verdicts are accepted.
ALTER TABLE public.subsection_documents DROP CONSTRAINT IF EXISTS subsection_documents_coc_status_check;
ALTER TABLE public.subsection_documents ADD CONSTRAINT subsection_documents_coc_status_check
  CHECK (coc_status IS NULL OR coc_status IN (
    'Pass','Fail','Pending','Missing','N/A',
    'pending','approved','rejected','Approved','Failed','Rejected'
  ));

UPDATE public.subsection_documents SET coc_type = CASE
  WHEN lower(coc_type) = 'initial'       THEN 'Initial'
  WHEN lower(coc_type) = 'supplementary' THEN 'Supplementary'
  WHEN lower(coc_type) = 'temporary'     THEN 'Temporary'
  ELSE coc_type END
WHERE coc_type IS NOT NULL;

UPDATE public.subsection_documents SET coc_status = CASE
  WHEN lower(coc_status) IN ('approved','pass','valid')  THEN 'Pass'
  WHEN lower(coc_status) IN ('rejected','failed','fail') THEN 'Fail'
  WHEN lower(coc_status) = 'pending'                     THEN 'Pending'
  ELSE coc_status END
WHERE coc_status IS NOT NULL;

-- Roll-up: set subsections.coc_status from its COC certificate documents.
CREATE OR REPLACE FUNCTION public.rollup_subsection_coc_status(p_subsection_id uuid)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_status text;
BEGIN
  WITH classified AS (
    SELECT CASE
      WHEN d.coc_status IN ('Fail','Failed','Rejected') THEN 'Fail'
      WHEN d.coc_status IN ('Pass','Approved','Valid')
        AND d.coc_expiry_date IS NOT NULL AND d.coc_expiry_date < current_date THEN 'Fail'
      WHEN d.coc_status IN ('Pass','Approved','Valid') THEN 'Pass'
      ELSE 'Pending'
    END AS s
    FROM public.subsection_documents d
    JOIN public.document_categories c ON c.id = d.category_id
    WHERE d.subsection_id = p_subsection_id
      AND c.name ILIKE '%coc%'
      AND c.name NOT ILIKE '%validation%'
      AND c.name NOT ILIKE '%report%'
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM classified)               THEN 'Missing'
    WHEN EXISTS (SELECT 1 FROM classified WHERE s = 'Fail')  THEN 'Fail'
    WHEN EXISTS (SELECT 1 FROM classified WHERE s = 'Pass')  THEN 'Pass'
    ELSE 'Pending'
  END INTO v_status;

  UPDATE public.subsections
     SET coc_status = v_status, updated_at = now()
   WHERE id = p_subsection_id
     AND coalesce(coc_status,'') <> v_status;

  -- Recompute is_compliant directly. We cannot rely on the AFTER-trigger
  -- (trg_recompute_subsection_defender) because it self-guards with
  -- pg_trigger_depth() > 1 and we are nested inside the subsection_documents
  -- trigger here, so it would skip the recompute.
  PERFORM public.apply_subsection_recompute(p_subsection_id);
END;
$fn$;

-- Simplify the COC gate to key off the rolled-up coc_status only. The legacy
-- expired-Pass branch (which read the now-unmaintained subsections.coc_expiry_date)
-- is removed — per-document expiry is already folded into rollup_subsection_coc_status.
CREATE OR REPLACE FUNCTION public.apply_subsection_recompute(p_subsection_id uuid)
 RETURNS void LANGUAGE plpgsql AS $function$
declare
  r record; v_is_compliant boolean; c record; v_coc_fail boolean;
begin
  if p_subsection_id is null then return; end if;
  select * into r from public.recompute_subsection_installation_status(p_subsection_id);
  v_is_compliant := case r.status
    when 'compliant' then true when 'non_compliant' then false
    when 'requires_attention' then false when 'incomplete' then null end;
  select s.is_coc_required, s.coc_status into c from public.subsections s where s.id = p_subsection_id;
  v_coc_fail := coalesce(c.is_coc_required, false) and c.coc_status in ('Fail','Failed','Rejected');
  if v_coc_fail then v_is_compliant := false; end if;
  update public.subsections s
     set installation_status = r.status, installation_score = r.score,
         is_compliant = v_is_compliant, updated_at = now()
   where s.id = p_subsection_id and s.deleted_at is null
     and (coalesce(s.installation_status,'') <> coalesce(r.status,'')
       or coalesce(s.installation_score,-1) <> coalesce(r.score,-1)
       or coalesce(s.is_compliant,false) <> coalesce(v_is_compliant,false));
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_rollup_coc_from_documents()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM public.rollup_subsection_coc_status(COALESCE(NEW.subsection_id, OLD.subsection_id));
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_rollup_coc_from_documents ON public.subsection_documents;
CREATE TRIGGER trg_rollup_coc_from_documents
AFTER INSERT OR DELETE OR UPDATE OF coc_status, coc_type, coc_expiry_date, category_id
ON public.subsection_documents FOR EACH ROW
EXECUTE FUNCTION public.trg_rollup_coc_from_documents();

-- Backfill: roll every subsection up from its documents (fires the recompute gate => is_compliant).
DO $do$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.subsections WHERE deleted_at IS NULL LOOP
    PERFORM public.rollup_subsection_coc_status(r.id);
  END LOOP;
END; $do$;

NOTIFY pgrst, 'reload schema';
