
-- Clean up broken photo URLs from "Ventilation & Cooling Systems" (section 0, item 2)
UPDATE inspections 
SET json_data = jsonb_set(
  json_data,
  '{0,2,photos}',
  '[]'::jsonb
),
updated_at = NOW()
WHERE id = 'd4b630cf-f484-4d42-b346-d891c9c85f39';
