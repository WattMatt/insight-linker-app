-- Add user_id column to activity_logs for better access control
ALTER TABLE public.activity_logs 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Populate user_id from existing user_email data by matching with profiles
UPDATE public.activity_logs 
SET user_id = profiles.id
FROM public.profiles
WHERE activity_logs.user_email = profiles.email;

-- Create index for better query performance
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);

-- Drop the old permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view activity logs" ON public.activity_logs;

-- Create new restrictive SELECT policies
-- Users can only view their own activity logs
CREATE POLICY "Users can view their own activity logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all activity logs
CREATE POLICY "Admins can view all activity logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'Admin'::app_role));

-- Update INSERT policy to ensure user_id is set correctly
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON public.activity_logs;

CREATE POLICY "Users can insert their own activity logs"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);