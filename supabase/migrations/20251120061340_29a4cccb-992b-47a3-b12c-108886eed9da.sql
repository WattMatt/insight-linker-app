-- Create table for user-specific policy overrides
CREATE TABLE IF NOT EXISTS public.user_policy_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL')),
  permission_type TEXT NOT NULL CHECK (permission_type IN ('GRANT', 'DENY')),
  condition TEXT,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_policy_overrides ENABLE ROW LEVEL SECURITY;

-- Only admins can manage policy overrides
CREATE POLICY "Admins can manage policy overrides"
  ON public.user_policy_overrides
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

-- Create updated_at trigger
CREATE TRIGGER update_user_policy_overrides_updated_at
  BEFORE UPDATE ON public.user_policy_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_user_policy_overrides_user_id ON public.user_policy_overrides(user_id);
CREATE INDEX idx_user_policy_overrides_table_name ON public.user_policy_overrides(table_name);