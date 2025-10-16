-- Storage Security Fix: Allow Public Download Access for QR Code Documents
-- This migration enables public users to download documents via QR codes
-- while keeping upload/delete operations restricted to authenticated users

-- ============================================
-- DOCUMENTS BUCKET - Allow Public Downloads
-- ============================================

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;

-- Allow public users to DOWNLOAD (SELECT) documents
-- This enables QR code functionality where public users need to view COCs, manuals, etc.
CREATE POLICY "Public can download documents"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'documents');

-- Restrict UPLOAD to authenticated users only
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  auth.role() = 'authenticated'
);

-- Restrict UPDATE to authenticated users only
CREATE POLICY "Authenticated users can update documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  auth.role() = 'authenticated'
);

-- Restrict DELETE to authenticated users only
CREATE POLICY "Authenticated users can delete documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  auth.role() = 'authenticated'
);


-- ============================================
-- SUBSECTION_DOCUMENTS TABLE - Allow Public Read
-- ============================================

-- Allow public users to view document metadata (needed for QR pages to list documents)
DROP POLICY IF EXISTS "Authenticated users can manage subsection documents" ON public.subsection_documents;

CREATE POLICY "Public can view subsection documents"
ON public.subsection_documents
FOR SELECT
TO public
USING (true);

CREATE POLICY "Authenticated users can insert subsection documents"
ON public.subsection_documents
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update subsection documents"
ON public.subsection_documents
FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete subsection documents"
ON public.subsection_documents
FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');


-- ============================================
-- SITE_DOCUMENTS TABLE - Allow Public Read
-- ============================================

-- Allow public users to view site document metadata (if needed for QR functionality)
DROP POLICY IF EXISTS "Authenticated users can manage site documents" ON public.site_documents;

CREATE POLICY "Public can view site documents"
ON public.site_documents
FOR SELECT
TO public
USING (true);

CREATE POLICY "Authenticated users can insert site documents"
ON public.site_documents
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update site documents"
ON public.site_documents
FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete site documents"
ON public.site_documents
FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');


-- ============================================
-- SUMMARY OF CHANGES:
-- ============================================
-- ✅ Public can DOWNLOAD documents from storage (for QR code access)
-- ✅ Public can VIEW document metadata from subsection_documents and site_documents tables
-- ✅ Only authenticated users can UPLOAD, UPDATE, or DELETE documents
-- ✅ QR code scanning now fully functional for public users
