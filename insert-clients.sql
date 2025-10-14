-- Insert client organizations
-- Run this script in your Supabase SQL Editor to create all clients

INSERT INTO public.clients (name) VALUES
  ('Fortress_Fund'),
  ('Moolman_Group'),
  ('abland'),
  ('atterbury'),
  ('gmi_property_group'),
  ('godrich_toyota'),
  ('rejem_linton'),
  ('resbublica'),
  ('twin_city'),
  ('watson_mattheus')
ON CONFLICT (name) DO NOTHING;

-- Verify the import
SELECT id, name, created_at 
FROM public.clients 
ORDER BY name;
