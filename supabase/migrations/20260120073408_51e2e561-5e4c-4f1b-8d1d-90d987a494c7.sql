-- Add fortress-checklist section to existing site_summary templates
UPDATE pdf_report_templates
SET sections = sections || '[{"id": "fortress-checklist", "title": "Fortress Compliance Checklist", "type": "table", "enabled": true, "editable": true, "order": 8}]'::jsonb
WHERE report_type = 'site_summary' 
AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(sections) elem 
  WHERE elem->>'id' = 'fortress-checklist'
);

-- Add documents-summary section to existing site_summary templates (after health-metrics)
UPDATE pdf_report_templates
SET sections = sections || '[{"id": "documents-summary", "title": "Documents Summary", "type": "table", "enabled": true, "editable": true, "order": 1}]'::jsonb
WHERE report_type = 'site_summary' 
AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(sections) elem 
  WHERE elem->>'id' = 'documents-summary'
);