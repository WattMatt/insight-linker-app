-- Fix subsections where coc_status shows "Approved" but latest validation shows "Fail"
-- This corrects data inconsistency caused by the previous status priority bug

-- Update subsections that have:
-- 1. coc_status = 'Approved'  
-- 2. But their latest COC validation is 'Fail', 'Failed', or 'Incomplete'

UPDATE subsections s
SET 
  coc_status = 'Failed',
  is_compliant = false,
  updated_at = NOW()
WHERE s.id IN (
  SELECT s2.id
  FROM subsections s2
  JOIN coc_validations cv ON cv.subsection_id = s2.id
  WHERE s2.coc_status = 'Approved'
    AND cv.validated_at = (
      SELECT MAX(cv2.validated_at) 
      FROM coc_validations cv2 
      WHERE cv2.subsection_id = s2.id
    )
    AND cv.status IN ('Fail', 'Failed', 'Incomplete')
);