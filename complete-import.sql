-- Complete Data Import Script
-- Run this in Supabase SQL Editor

-- Step 1: Create default client (Fortress Fund)
DO $$
DECLARE
  v_client_id uuid;
  v_site_mayville uuid;
  v_site_fourways uuid;
  v_site_palm uuid;
  v_site_oxford uuid;
  v_site_rustenburg uuid;
  v_site_yarona uuid;
  v_site_thembi uuid;
  v_site_evaton uuid;
  v_site_park uuid;
  v_site_mafikeng uuid;
  v_site_flamwood_vc uuid;
  v_site_flamwood_w uuid;
BEGIN
  -- Insert client
  INSERT INTO public.clients (name, email, contact_person)
  VALUES ('Fortress Fund', 'info@fortressfund.com', 'Admin')
  RETURNING id INTO v_client_id;

  -- Insert all sites
  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('Mayville Mall', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_mayville;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('Fourways Value Mart', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_fourways;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('Palm Springs', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_palm;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('204 Oxford (Thrupps Illovo Centre)', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_oxford;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('Rustenburg Plaza', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_rustenburg;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('YARONA SHOPPING CENTRE', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_yarona;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('Thembi Mall', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_thembi;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('Evaton Mall', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_evaton;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('Park Central', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_park;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('Mafikeng (Mahikeng) Station', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_mafikeng;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('Flamwood Value Centre', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_flamwood_vc;

  INSERT INTO public.sites (name, client_id, site_type)
  VALUES ('Flamwood Walk', v_client_id, 'Shopping Mall')
  RETURNING id INTO v_site_flamwood_w;

  -- Insert all inspections with correct data
  INSERT INTO public.inspections (
    title,
    site_id,
    inspection_date,
    end_date,
    status,
    priority,
    assigned_to,
    description
  ) VALUES
  ('Mayville Mall Audit Report', v_site_mayville, '2025-07-21', '2025-08-01', 'In Progress', 'High', ARRAY['user_dawie'], ''),
  ('AUDIT', v_site_fourways, '2025-08-04', '2025-08-08', 'Scheduled', 'High', ARRAY['user_ernst'], ''),
  ('AUDIT', v_site_palm, '2025-08-11', '2025-08-29', 'Scheduled', 'High', ARRAY['user_ernst'], ''),
  ('AUDIT', v_site_oxford, '2025-09-01', '2025-09-12', 'Scheduled', 'High', ARRAY['user_ernst'], ''),
  ('AUDIT', v_site_rustenburg, '2025-09-15', '2025-09-24', 'Scheduled', 'High', NULL, ''),
  ('Audit', v_site_yarona, '2025-09-25', '2025-09-30', 'Scheduled', 'High', ARRAY['user_ernst'], ''),
  ('AUDIT', v_site_thembi, '2025-10-01', '2025-10-07', 'Scheduled', 'High', ARRAY['user_ernst'], ''),
  ('AUDIT', v_site_evaton, '2025-10-08', '2025-11-07', 'Scheduled', 'High', ARRAY['user_ernst'], ''),
  ('AUDIT', v_site_park, '2025-11-10', '2025-11-17', 'Scheduled', 'High', ARRAY['user_ernst'], ''),
  ('AUDIT', v_site_mafikeng, '2025-11-18', '2025-11-21', 'Scheduled', 'High', ARRAY['user_ernst'], ''),
  ('AUDIT', v_site_flamwood_vc, '2025-11-24', '2025-12-02', 'Scheduled', 'High', ARRAY['user_ernst'], ''),
  ('AUDIT', v_site_flamwood_w, '2025-12-03', '2025-12-05', 'Scheduled', 'High', ARRAY['user_ernst'], '');

  RAISE NOTICE 'Successfully imported 1 client, 12 sites, and 12 inspections';
END $$;

-- Verify the import
SELECT 'Clients' as table_name, COUNT(*) as count FROM public.clients
UNION ALL
SELECT 'Sites', COUNT(*) FROM public.sites
UNION ALL
SELECT 'Inspections', COUNT(*) FROM public.inspections;
