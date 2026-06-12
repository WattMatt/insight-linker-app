-- COC manual workflow: add fields, normalise status, derive is_compliant from the manual
-- verdict + expiry (no longer from coc_validations). Validation tables dropped in a later migration.

ALTER TABLE public.subsections
  ADD COLUMN IF NOT EXISTS coc_expiry_date    date,
  ADD COLUMN IF NOT EXISTS coc_failure_reasons text,
  ADD COLUMN IF NOT EXISTS coc_reviewed_by    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS coc_reviewed_at    timestamptz;

-- Normalise the messy coc_status vocabulary to: Missing | Pending | Pass | Fail | N/A
UPDATE public.subsections SET coc_status = CASE
  WHEN coc_status IN ('Approved','Valid','Pass')      THEN 'Pass'
  WHEN coc_status IN ('Failed','Fail','Rejected')     THEN 'Fail'
  WHEN coc_status IN ('Pending','pending')            THEN 'Pending'
  WHEN coc_status = 'N/A'                             THEN 'N/A'
  ELSE 'Missing'
END;
ALTER TABLE public.subsections ALTER COLUMN coc_status SET DEFAULT 'Missing';
ALTER TABLE public.subsections DROP CONSTRAINT IF EXISTS subsections_coc_status_check;
ALTER TABLE public.subsections ADD CONSTRAINT subsections_coc_status_check
  CHECK (coc_status IN ('Missing','Pending','Pass','Fail','N/A'));

-- Replace the compliance trigger body (stops reading coc_validations)
CREATE OR REPLACE FUNCTION public.sync_coc_compliance_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT COALESCE(NEW.is_coc_required, false) THEN
    NEW.is_compliant := true;
  ELSE
    NEW.is_compliant := (NEW.coc_status = 'Pass'
      AND (NEW.coc_expiry_date IS NULL OR NEW.coc_expiry_date >= current_date));
  END IF;
  RETURN NEW;
END;
$fn$;

-- Recreate the trigger so it also fires on coc_expiry_date changes
DROP TRIGGER IF EXISTS trg_sync_coc_compliance ON public.subsections;
CREATE TRIGGER trg_sync_coc_compliance
  BEFORE INSERT OR UPDATE OF coc_status, is_coc_required, coc_expiry_date
  ON public.subsections FOR EACH ROW EXECUTE FUNCTION public.sync_coc_compliance_status();

-- Backfill is_compliant under the new rule
UPDATE public.subsections SET is_compliant = (
  NOT COALESCE(is_coc_required,false)
  OR (coc_status='Pass' AND (coc_expiry_date IS NULL OR coc_expiry_date >= current_date))
);

NOTIFY pgrst, 'reload schema';
