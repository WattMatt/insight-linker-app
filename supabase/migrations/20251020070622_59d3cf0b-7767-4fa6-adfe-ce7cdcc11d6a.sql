-- Create a function to automatically cleanup old activity logs, keeping only the last 20
CREATE OR REPLACE FUNCTION public.cleanup_activity_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Delete all logs except the 20 most recent
  DELETE FROM public.activity_logs
  WHERE id NOT IN (
    SELECT id
    FROM public.activity_logs
    ORDER BY created_at DESC
    LIMIT 20
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger to run cleanup after each insert
DROP TRIGGER IF EXISTS trigger_cleanup_activity_logs ON public.activity_logs;
CREATE TRIGGER trigger_cleanup_activity_logs
AFTER INSERT ON public.activity_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_activity_logs();