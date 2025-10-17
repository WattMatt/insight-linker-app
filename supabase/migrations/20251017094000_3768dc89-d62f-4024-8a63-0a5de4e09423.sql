-- Fix public exposure of profiles and clients tables
-- Remove public SELECT policies that expose sensitive personal and business data

-- Drop the public access policy on clients table
DROP POLICY IF EXISTS "Public can view client basic info" ON public.clients;

-- Make storage buckets private to protect sensitive images
UPDATE storage.buckets 
SET public = false 
WHERE id IN ('profile-images', 'site-images');

-- Drop existing storage policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view site images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload site images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update site images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete site images" ON storage.objects;

-- Add RLS policies for profile images bucket - users can only access their own
CREATE POLICY "Users can view their own profile images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'profile-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload their own profile images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own profile images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profile-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own profile images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'profile-images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Add RLS policies for site images bucket - authenticated users only
CREATE POLICY "Authenticated users can view site images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'site-images' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can upload site images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'site-images' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update site images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'site-images' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete site images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'site-images' AND 
  auth.role() = 'authenticated'
);