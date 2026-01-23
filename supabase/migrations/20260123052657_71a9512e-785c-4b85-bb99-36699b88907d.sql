-- The correct approach: use SECURITY DEFINER which executes as the function owner
-- The function owner (postgres/service_role) bypasses RLS by default
-- We just need to ensure the function is owned by postgres and drop the role switching

-- Recreate the function without the role switching (which is not allowed)
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
DECLARE
  v_link_record RECORD;
BEGIN
  -- First, find the link and check if it's valid
  SELECT 
    cal.id,
    cal.link_type,
    cal.client_id,
    cal.site_id,
    cal.subsection_id,
    cal.access_token,
    cal.is_active,
    cal.expires_at
  INTO v_link_record
  FROM public.client_access_links cal
  WHERE cal.access_token = token
  LIMIT 1;
  
  -- If link exists and is valid, update the tracking fields
  IF v_link_record.id IS NOT NULL AND 
     v_link_record.is_active = true AND 
     (v_link_record.expires_at IS NULL OR v_link_record.expires_at > now()) THEN
    -- This UPDATE will work because SECURITY DEFINER runs as owner who bypasses RLS
    UPDATE public.client_access_links
    SET 
      last_accessed_at = now(),
      access_count = access_count + 1
    WHERE id = v_link_record.id;
  END IF;
  
  -- Return the validation result
  IF v_link_record.id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      v_link_record.id as link_id,
      v_link_record.link_type,
      v_link_record.client_id,
      v_link_record.site_id,
      v_link_record.subsection_id,
      (v_link_record.is_active AND (v_link_record.expires_at IS NULL OR v_link_record.expires_at > now())) as is_valid;
  END IF;
  
  RETURN;
END;
$$;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.validate_access_link(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_access_link(TEXT) TO authenticated;