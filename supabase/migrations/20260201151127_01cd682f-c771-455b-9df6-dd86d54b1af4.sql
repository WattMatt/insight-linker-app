-- Create function to auto-update is_compliant when coc_status changes
CREATE OR REPLACE FUNCTION public.sync_coc_compliance_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  has_failed_validation BOOLEAN;
BEGIN
  -- Only process if coc_status or is_coc_required changed
  IF (TG_OP = 'UPDATE' AND 
      (OLD.coc_status IS DISTINCT FROM NEW.coc_status OR 
       OLD.is_coc_required IS DISTINCT FROM NEW.is_coc_required)) 
     OR TG_OP = 'INSERT' THEN
    
    -- If COC is not required, always compliant
    IF NOT COALESCE(NEW.is_coc_required, false) THEN
      NEW.is_compliant := true;
      RETURN NEW;
    END IF;
    
    -- Check for failed validations (most recent only)
    SELECT EXISTS (
      SELECT 1
      FROM coc_validations cv
      WHERE cv.subsection_id = NEW.id
        AND cv.status IN ('Fail', 'Failed', 'Incomplete')
        AND cv.validated_at = (
          SELECT MAX(cv2.validated_at)
          FROM coc_validations cv2
          WHERE cv2.subsection_id = NEW.id
        )
    ) INTO has_failed_validation;
    
    -- If latest validation is failed, not compliant
    IF has_failed_validation THEN
      NEW.is_compliant := false;
      RETURN NEW;
    END IF;
    
    -- Check if coc_status indicates compliance
    IF NEW.coc_status IN ('Approved', 'Valid', 'Pass') THEN
      NEW.is_compliant := true;
    ELSE
      -- Missing, Failed, Pending, etc. = not compliant
      NEW.is_compliant := false;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on subsections table
DROP TRIGGER IF EXISTS trg_sync_coc_compliance ON public.subsections;

CREATE TRIGGER trg_sync_coc_compliance
  BEFORE INSERT OR UPDATE OF coc_status, is_coc_required
  ON public.subsections
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_coc_compliance_status();

-- Add comment for documentation
COMMENT ON FUNCTION public.sync_coc_compliance_status() IS 
'Automatically syncs is_compliant flag based on coc_status and validation results. 
Logic: 
- If is_coc_required=false → is_compliant=true
- If latest validation is Fail/Failed/Incomplete → is_compliant=false  
- If coc_status is Approved/Valid/Pass (no failed validation) → is_compliant=true
- Otherwise → is_compliant=false';