-- Add public access policy for inspection photos
CREATE POLICY "Public can view inspection photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'inspection-photos');