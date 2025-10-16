-- Insert Site Drawing template
INSERT INTO inspection_templates (name, category, description, sections, cover_page, sections_count, pages_count)
VALUES (
  'Site Drawing Inspection',
  'Site Drawing',
  'Interactive PDF site drawing inspection with pin-based annotations for marking specific locations and adding photos and notes',
  '[]'::jsonb,
  '{}'::jsonb,
  0,
  1
);