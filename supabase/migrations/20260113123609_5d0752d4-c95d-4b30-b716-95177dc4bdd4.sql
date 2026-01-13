-- Fix is_compliant for subsections that have failed validations but are marked as compliant
UPDATE subsections 
SET is_compliant = false 
WHERE id IN (
  SELECT DISTINCT s.id 
  FROM subsections s
  JOIN coc_validations v ON v.subsection_id = s.id
  WHERE (
    -- Check if overall status indicates failure
    v.report_data->>'overallStatus' IN ('Fail', 'Failed', 'Invalid', 'FAIL')
    -- Or if hierarchy validation failed
    OR v.report_data->'hierarchyValidation'->>'hierarchyStatus' LIKE '%Invalid%'
    -- Or if there are critical failures
    OR (v.report_data->'criticalFailures' IS NOT NULL 
        AND jsonb_array_length(v.report_data->'criticalFailures') > 0)
  )
);

-- Also ensure subsections with 'Failed' or 'rejected' coc_status are marked non-compliant
UPDATE subsections
SET is_compliant = false
WHERE coc_status IN ('Failed', 'rejected', 'Rejected', 'failed', 'invalid', 'Invalid')
  AND (is_compliant = true OR is_compliant IS NULL);