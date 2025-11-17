-- Remove conflicting authenticated-only policy that blocks public access
DROP POLICY IF EXISTS "Authenticated users can view inspection photos" ON storage.objects;

-- Ensure the public policy is the only SELECT policy for inspection photos
-- This allows both authenticated and anonymous users to view inspection photos consistently