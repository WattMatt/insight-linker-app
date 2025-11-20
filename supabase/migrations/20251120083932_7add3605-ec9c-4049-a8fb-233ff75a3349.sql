-- Remove ALL restrictions on storage - allow anonymous access for everything
-- Drop all existing policies
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

-- Create completely unrestricted policies - NO authentication required
CREATE POLICY "Anyone can view all storage" 
ON storage.objects FOR SELECT 
USING (true);

CREATE POLICY "Anyone can upload to all storage" 
ON storage.objects FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update all storage" 
ON storage.objects FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete from all storage" 
ON storage.objects FOR DELETE 
USING (true);