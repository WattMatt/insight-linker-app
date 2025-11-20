-- Remove ALL storage restrictions for ALL buckets
-- This will allow any authenticated user to upload/delete from any bucket

-- Drop ALL existing policies on storage.objects
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_record.policyname);
    END LOOP;
END $$;

-- Make ALL buckets public
UPDATE storage.buckets SET public = true;

-- Create universal policies for ALL buckets - any authenticated user can do anything
CREATE POLICY "Authenticated users full access to all buckets - SELECT" 
ON storage.objects FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users full access to all buckets - INSERT" 
ON storage.objects FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users full access to all buckets - UPDATE" 
ON storage.objects FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users full access to all buckets - DELETE" 
ON storage.objects FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Also allow public viewing for all buckets
CREATE POLICY "Public can view all buckets" 
ON storage.objects FOR SELECT 
USING (true);