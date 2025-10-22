-- Update the "Other" item name to "48V Relay Status" in the Low Voltage Line Shop Board Audit template
UPDATE inspection_templates 
SET sections = jsonb_set(
  sections,
  '{2,items,4,name}',
  '"48V Relay Status"'
)
WHERE id = '234af65e-f0f3-41f1-9be3-2b5395163d7e' AND name = 'Low Voltage Line Shop Board Audit';