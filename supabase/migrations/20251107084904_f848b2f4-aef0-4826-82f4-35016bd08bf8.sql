-- Add verification fields to issue_reports
ALTER TABLE public.issue_reports 
ADD COLUMN IF NOT EXISTS needs_user_verification boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS rejection_reason text,
ADD COLUMN IF NOT EXISTS rejection_screenshot_url text;

-- Add verification fields to suggestions
ALTER TABLE public.suggestions
ADD COLUMN IF NOT EXISTS needs_user_verification boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS rejection_reason text,
ADD COLUMN IF NOT EXISTS rejection_screenshot_url text;

-- Create function to check for pending verifications
CREATE OR REPLACE FUNCTION get_pending_verifications(user_uuid uuid)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  description text,
  resolved_at timestamp with time zone
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_pending_verifications TO authenticated;