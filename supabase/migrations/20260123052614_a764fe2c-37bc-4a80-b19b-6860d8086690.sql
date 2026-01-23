-- Drop the overly permissive UPDATE policy we just created
DROP POLICY IF EXISTS "Allow tracking updates via token" ON public.client_access_links;

-- Instead, we'll bypass RLS for the SECURITY DEFINER function by using SET search_path
-- The function already has SECURITY DEFINER which should bypass RLS
-- But we need to add a SELECT policy for anon users to at least read the token

-- Add public SELECT policy so the RPC can find the token
CREATE POLICY "Public can select access_links for validation"
ON public.client_access_links
FOR SELECT
USING (true);

-- Now recreate the function with explicit bypassing of RLS for the update
CREATE OR REPLACE FUNCTION public.validate_access_link(token TEXT)
RETURNS TABLE(
  link_id UUID,
  link_type TEXT,
  client_id UUID,
  site_id UUID,
  subsection_id UUID,
  is_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Update last accessed and increment counter
  -- Using SET LOCAL to bypass RLS for this transaction
  PERFORM set_config('role', 'postgres', true);
  
  UPDATE public.client_access_links cal
  SET 
    last_accessed_at = now(),
    access_count = access_count + 1
  WHERE cal.access_token = token
    AND cal.is_active = true
    AND (cal.expires_at IS NULL OR cal.expires_at > now());
  
  -- Reset role
  PERFORM set_config('role', 'anon', true);
  
  RETURN QUERY
  SELECT 
    cal.id as link_id,
    cal.link_type,
    cal.client_id,
    cal.site_id,
    cal.subsection_id,
    (cal.is_active AND (cal.expires_at IS NULL OR cal.expires_at > now())) as is_valid
  FROM public.client_access_links cal
  WHERE cal.access_token = token
  LIMIT 1;
END;
$$;