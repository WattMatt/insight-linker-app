-- Drop overly permissive storage policies
DROP POLICY IF EXISTS "Authenticated users can delete inspection photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update inspection photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload inspection photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete site images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update site images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload site images" ON storage.objects;

-- Drop existing profile image policies
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all profile images" ON storage.objects;

-- ============================================================
-- INSPECTION PHOTOS BUCKET POLICIES
-- ============================================================

-- Admins have full access to inspection photos
CREATE POLICY "Admins can manage all inspection photos"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'inspection-photos' AND has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (bucket_id = 'inspection-photos' AND has_role(auth.uid(), 'Admin'::app_role));

-- Clients can upload/view/delete inspection photos for their sites only
CREATE POLICY "Clients can upload inspection photos for their sites"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'inspection-photos' 
  AND has_role(auth.uid(), 'Client'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text
    FROM sites s
    WHERE s.client_id = get_user_client_id()
  )
);

CREATE POLICY "Clients can view inspection photos for their sites"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'inspection-photos' 
  AND has_role(auth.uid(), 'Client'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text
    FROM sites s
    WHERE s.client_id = get_user_client_id()
  )
);

CREATE POLICY "Clients can delete inspection photos for their sites"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'inspection-photos' 
  AND has_role(auth.uid(), 'Client'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text
    FROM sites s
    WHERE s.client_id = get_user_client_id()
  )
);

-- Contractors can upload/view/delete inspection photos for their assigned sites only
CREATE POLICY "Contractors can upload inspection photos for their sites"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'inspection-photos' 
  AND has_role(auth.uid(), 'Contractor'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT us.site_id::text
    FROM user_sites us
    WHERE us.user_id = auth.uid()
  )
);

CREATE POLICY "Contractors can view inspection photos for their sites"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'inspection-photos' 
  AND has_role(auth.uid(), 'Contractor'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT us.site_id::text
    FROM user_sites us
    WHERE us.user_id = auth.uid()
  )
);

CREATE POLICY "Contractors can delete inspection photos for their sites"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'inspection-photos' 
  AND has_role(auth.uid(), 'Contractor'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT us.site_id::text
    FROM user_sites us
    WHERE us.user_id = auth.uid()
  )
);

-- ============================================================
-- DOCUMENTS BUCKET POLICIES
-- ============================================================

-- Admins have full access to documents
CREATE POLICY "Admins can manage all documents"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'documents' AND has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (bucket_id = 'documents' AND has_role(auth.uid(), 'Admin'::app_role));

-- Clients can upload/view/delete documents for their sites only
CREATE POLICY "Clients can upload documents for their sites"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND has_role(auth.uid(), 'Client'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text
    FROM sites s
    WHERE s.client_id = get_user_client_id()
  )
);

CREATE POLICY "Clients can view documents for their sites"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' 
  AND has_role(auth.uid(), 'Client'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text
    FROM sites s
    WHERE s.client_id = get_user_client_id()
  )
);

CREATE POLICY "Clients can delete documents for their sites"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND has_role(auth.uid(), 'Client'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text
    FROM sites s
    WHERE s.client_id = get_user_client_id()
  )
);

-- Contractors can upload/view/delete documents for their assigned sites only
CREATE POLICY "Contractors can upload documents for their sites"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND has_role(auth.uid(), 'Contractor'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT us.site_id::text
    FROM user_sites us
    WHERE us.user_id = auth.uid()
  )
);

CREATE POLICY "Contractors can view documents for their sites"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' 
  AND has_role(auth.uid(), 'Contractor'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT us.site_id::text
    FROM user_sites us
    WHERE us.user_id = auth.uid()
  )
);

CREATE POLICY "Contractors can delete documents for their sites"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND has_role(auth.uid(), 'Contractor'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT us.site_id::text
    FROM user_sites us
    WHERE us.user_id = auth.uid()
  )
);

-- ============================================================
-- SITE IMAGES BUCKET POLICIES
-- ============================================================

-- Admins have full access to site images
CREATE POLICY "Admins can manage all site images"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'site-images' AND has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (bucket_id = 'site-images' AND has_role(auth.uid(), 'Admin'::app_role));

-- Clients can upload/view site images for their sites only
CREATE POLICY "Clients can upload site images for their sites"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'site-images' 
  AND has_role(auth.uid(), 'Client'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text
    FROM sites s
    WHERE s.client_id = get_user_client_id()
  )
);

CREATE POLICY "Clients can view site images for their sites"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'site-images' 
  AND has_role(auth.uid(), 'Client'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text
    FROM sites s
    WHERE s.client_id = get_user_client_id()
  )
);

-- Contractors can view site images for their assigned sites
CREATE POLICY "Contractors can view site images for their sites"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'site-images' 
  AND has_role(auth.uid(), 'Contractor'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT us.site_id::text
    FROM user_sites us
    WHERE us.user_id = auth.uid()
  )
);

-- ============================================================
-- PROFILE IMAGES BUCKET POLICIES
-- ============================================================

-- Users can manage their own profile images
CREATE POLICY "Users can upload their own profile images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own profile images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own profile images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own profile images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins can view all profile images
CREATE POLICY "Admins can view all profile images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-images' AND has_role(auth.uid(), 'Admin'::app_role));