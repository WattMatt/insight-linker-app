
-- Clean up broken photo URLs from inspection d4b630cf-f484-4d42-b346-d891c9c85f39
UPDATE inspections 
SET json_data = jsonb_set(
  json_data,
  '{1,3,photos}',
  '[]'::jsonb
),
updated_at = NOW()
WHERE id = 'd4b630cf-f484-4d42-b346-d891c9c85f39';
