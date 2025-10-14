# Data Import Scripts

## Step 1: Import Users Data

```sql
-- Insert users into temp_import
INSERT INTO public.temp_import (data) VALUES 
('{"email": "arno@watsonmattheus.com", "fullName": "ar", "role": "Contractor", "status": "Active"}'::jsonb),
('{"email": "admin@wmeng.co.za", "fullName": "Front of house", "role": "Admin", "status": "Active"}'::jsonb),
('{"email": "alain@wmeng.co.za", "fullName": "Alain", "role": "User", "status": "Active"}'::jsonb),
('{"email": "darren@wmeng.co.za", "fullName": "Darren", "role": "User", "status": "Active"}'::jsonb),
('{"email": "dawie@wmeng.co.za", "fullName": "Dawie De Beer", "role": "Admin", "status": "Active"}'::jsonb),
('{"email": "ernst@wmeng.co.za", "fullName": "Ersnt De Beer", "role": "Admin", "status": "Active"}'::jsonb),
('{"email": "estienne@wmeng.co.za", "fullName": "Estienne", "role": "User", "status": "Active"}'::jsonb),
('{"email": "michael@wmeng.co.za", "fullName": "Michael Welgemoed", "role": "Admin", "status": "Active"}'::jsonb);
```

## Step 2: Import Inspection/Calendar Events

First, create a default site and client (or use existing ones):

```sql
-- Get or create a default client
INSERT INTO public.clients (name, email, created_by)
VALUES ('Fortress Fund', 'info@fortress.co.za', auth.uid())
ON CONFLICT DO NOTHING
RETURNING id;

-- Note the client ID from above, then create sites
-- You'll need to create sites for each unique siteName in your data
-- For now, we'll create a few examples:

INSERT INTO public.sites (name, client_id, created_by)
VALUES 
  ('Mayville Mall', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('Fourways Value Mart', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('Palm Springs', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('204 Oxford (Thrupps Illovo Centre)', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('Rustenburg Plaza', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('YARONA SHOPPING CENTRE', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('Thembi Mall', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('Evaton Mall', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('Park Central', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('Mafikeng (Mahikeng) Station', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('Flamwood Value Centre', 'YOUR_CLIENT_ID_HERE', auth.uid()),
  ('Flamwood Walk', 'YOUR_CLIENT_ID_HERE', auth.uid())
RETURNING id, name;
```

## Step 3: Insert Calendar Events/Inspections

After creating sites, use their IDs to insert inspections:

```sql
-- Insert all inspections
-- Replace SITE_ID_XXX with actual site IDs from the previous query

INSERT INTO public.inspections (
  title,
  site_id,
  inspection_date,
  end_date,
  status,
  priority,
  assigned_to,
  description,
  inspector_id
) VALUES
-- Mayville Mall Audit
('Mayville Mall Audit Report', 'SITE_ID_MAYVILLE', '2025-07-21', '2025-08-01', 'In Progress', 'High', ARRAY['user_dawie'], '', auth.uid()),

-- Fourways Value Mart
('AUDIT', 'SITE_ID_FOURWAYS', '2025-08-04', '2025-08-08', 'Scheduled', 'High', ARRAY['user_ernst'], '', auth.uid()),

-- Palm Springs
('AUDIT', 'SITE_ID_PALM', '2025-08-11', '2025-08-29', 'Scheduled', 'High', ARRAY['user_ernst'], '', auth.uid()),

-- 204 Oxford
('AUDIT', 'SITE_ID_OXFORD', '2025-09-01', '2025-09-12', 'Scheduled', 'High', ARRAY['user_ernst'], '', auth.uid()),

-- Rustenburg Plaza
('AUDIT', 'SITE_ID_RUSTENBURG', '2025-09-15', '2025-09-24', 'Scheduled', 'High', NULL, '', auth.uid()),

-- Yarona Shopping Centre
('Audit', 'SITE_ID_YARONA', '2025-09-25', '2025-09-30', 'Scheduled', 'High', ARRAY['user_ernst'], '', auth.uid()),

-- Thembi Mall
('AUDIT', 'SITE_ID_THEMBI', '2025-10-01', '2025-10-07', 'Scheduled', 'High', ARRAY['user_ernst'], '', auth.uid()),

-- Evaton Mall
('AUDIT', 'SITE_ID_EVATON', '2025-10-08', '2025-11-07', 'Scheduled', 'High', ARRAY['user_ernst'], '', auth.uid()),

-- Park Central
('AUDIT', 'SITE_ID_PARK', '2025-11-10', '2025-11-17', 'Scheduled', 'High', ARRAY['user_ernst'], '', auth.uid()),

-- Mafikeng Station
('AUDIT', 'SITE_ID_MAFIKENG', '2025-11-18', '2025-11-21', 'Scheduled', 'High', ARRAY['user_ernst'], '', auth.uid()),

-- Flamwood Value Centre
('AUDIT', 'SITE_ID_FLAMWOOD_VC', '2025-11-24', '2025-12-02', 'Scheduled', 'High', ARRAY['user_ernst'], '', auth.uid()),

-- Flamwood Walk
('AUDIT', 'SITE_ID_FLAMWOOD_W', '2025-12-03', '2025-12-05', 'Scheduled', 'High', ARRAY['user_ernst'], '', auth.uid());
```

## Alternative: Simplified Import for Testing

If you want to quickly populate the calendar for testing without creating all sites:

```sql
-- Create one default site
INSERT INTO public.clients (name, email)
VALUES ('Test Client', 'test@client.com')
RETURNING id;

-- Use the client ID above
INSERT INTO public.sites (name, client_id, address)
VALUES ('Test Site', 'YOUR_CLIENT_ID', 'Test Address')
RETURNING id;

-- Then insert all inspections with the same site_id for quick testing
INSERT INTO public.inspections (title, site_id, inspection_date, end_date, status, priority, assigned_to)
SELECT 
  'AUDIT - ' || generate_series::text,
  'YOUR_SITE_ID',
  '2025-07-21'::date + (generate_series * 10 || ' days')::interval,
  '2025-07-21'::date + ((generate_series * 10) + 7 || ' days')::interval,
  'Scheduled',
  'High',
  ARRAY['user_ernst']
FROM generate_series(0, 11);
```

## Notes

- Users need to be created via the Auth system first (use the Users page to invite them)
- The `assigned_to` field stores user identifiers as text array
- Make sure to replace placeholder IDs with actual IDs from your database
- You can run these scripts in the Supabase SQL Editor
