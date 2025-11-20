-- Remove all restrictive storage policies for documents bucket
-- This ensures authenticated users have full access to upload/delete documents

-- Drop all existing policies for documents bucket
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Public users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Public users can download documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view documents" ON storage.objects;

-- Drop any other conflicting policies for documents bucket
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage'
        AND (policyname LIKE '%documents%' OR policyname LIKE '%document%')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_record.policyname);
    END LOOP;
END $$;

-- Make bucket public for easier access
UPDATE storage.buckets SET public = true WHERE id = 'documents';

-- Create simple, unrestricted policies for authenticated users
CREATE POLICY "Any authenticated user can view documents" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Any authenticated user can upload documents" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Any authenticated user can update documents" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Any authenticated user can delete documents" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

-- Also allow public viewing since bucket is now public
CREATE POLICY "Public can view documents" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'documents');