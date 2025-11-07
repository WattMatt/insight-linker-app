-- Fix security warning: Set search_path for function
DROP FUNCTION IF EXISTS get_pending_verifications(uuid);

CREATE OR REPLACE FUNCTION get_pending_verifications(user_uuid uuid)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  description text,
  resolved_at timestamp with time zone
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ir.id,
    'issue'::text as type,
    'Issue Report'::text as title,
    ir.description,
    ir.resolved_at
  FROM issue_reports ir
  WHERE ir.reported_by = user_uuid
    AND ir.needs_user_verification = true
    AND ir.verification_status = 'pending'
  
  UNION ALL
  
  SELECT 
    s.id,
    'suggestion'::text as type,
    s.title,
    s.description,
    s.resolved_at
  FROM suggestions s
  WHERE s.reported_by = user_uuid
    AND s.needs_user_verification = true
    AND s.verification_status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION get_pending_verifications TO authenticated;