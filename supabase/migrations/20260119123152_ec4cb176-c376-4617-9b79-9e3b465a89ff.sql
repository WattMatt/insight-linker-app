-- Add asset-verification section to existing site_summary templates
UPDATE pdf_report_templates
SET sections = sections || '[{"id": "asset-verification", "title": "Asset Verification Summary", "type": "kpi", "enabled": true, "editable": true, "order": 7}]'::jsonb
WHERE report_type = 'site_summary' 
AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(sections) elem 
  WHERE elem->>'id' = 'asset-verification'
);