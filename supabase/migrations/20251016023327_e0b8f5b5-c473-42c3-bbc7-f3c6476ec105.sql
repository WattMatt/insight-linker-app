-- Update Miniature substation and RMU templates to Medium Voltage category
UPDATE inspection_templates
SET category = 'Medium Voltage'
WHERE name ILIKE '%miniature substation%' 
   OR name ILIKE '%RMU%'
   OR name ILIKE '%ring main unit%';