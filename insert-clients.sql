-- Insert client organizations
-- Run this script in your Supabase SQL Editor to create all clients

INSERT INTO public.clients (name) VALUES
  ('Fortress Fund'),
  ('Moolman Group'),
  ('Abland'),
  ('Atterbury'),
  ('GMI Property Group'),
  ('Godrich Toyota'),
  ('Rejem Linton'),
  ('Resbublica'),
  ('Twin City'),
  ('Watson Mattheus')
ON CONFLICT (name) DO NOTHING;

-- Verify the import
SELECT id, name, created_at 
FROM public.clients 
ORDER BY name;
