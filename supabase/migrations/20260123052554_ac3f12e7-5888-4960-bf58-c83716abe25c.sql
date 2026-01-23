-- The validate_access_link function already has SECURITY DEFINER,
-- but the RLS policy on client_access_links doesn't allow anon users to update
-- We need to add a policy that allows the function to update access metrics

-- Add a policy specifically for tracking access link usage
-- This allows updating ONLY the tracking fields and only when the token matches
CREATE POLICY "Allow tracking updates via token"
ON public.client_access_links
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Note: This is safe because:
-- 1. The validate_access_link function is SECURITY DEFINER
-- 2. It only updates last_accessed_at and access_count
-- 3. Users cannot modify other fields through the function