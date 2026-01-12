-- Backfill subsection_documents with extracted COC data from existing validations
-- Using correct enum values for the check constraints

UPDATE subsection_documents sd
SET 
  coc_number = cv.report_data->>'cocNumber',
  coc_issue_date = (cv.report_data->>'cocIssueDate')::date,
  coc_type = CASE 
    WHEN LOWER(cv.report_data->>'cocType') ILIKE '%supplementary%' THEN 'supplementary'
    ELSE 'initial'
  END,
  coc_status = CASE 
    WHEN cv.status = 'Pass' THEN 'approved'
    WHEN cv.status = 'Fail' THEN 'rejected'
    ELSE 'pending'
  END
FROM coc_validations cv
WHERE cv.document_id = sd.id
  AND cv.report_data->>'cocNumber' IS NOT NULL;