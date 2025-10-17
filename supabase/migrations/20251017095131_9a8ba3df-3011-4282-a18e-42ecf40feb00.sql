-- Add automatic cleanup for old pending user invites
-- This reduces the window for potential email harvesting if an admin account is compromised

-- Function to clean up pending invites older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_pending_invites()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete invites older than 30 days
  DELETE FROM public.pending_user_invites
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup action
  INSERT INTO public.activity_logs (action, details, user_email)
  VALUES (
    'cleanup_pending_invites',
    format('Automatically cleaned up %s old pending invites', deleted_count),
    'system'
  );
  
  RETURN deleted_count;
END;
$$;

-- Grant execute permission to authenticated users (admins will use this)
GRANT EXECUTE ON FUNCTION public.cleanup_old_pending_invites() TO authenticated;

-- Add index on created_at for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_pending_invites_created_at 
ON public.pending_user_invites(created_at);

-- Add comment explaining the security rationale
COMMENT ON FUNCTION public.cleanup_old_pending_invites() IS 
'Automatically removes pending user invites older than 30 days to reduce exposure window for sensitive email data. This function can be called manually by admins or scheduled via pg_cron to run periodically.';