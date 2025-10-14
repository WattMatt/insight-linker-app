-- Create a table to track pending user invites from Firebase migration
CREATE TABLE public.pending_user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_id text,
  email text NOT NULL UNIQUE,
  full_name text,
  invited_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_user_invites ENABLE ROW LEVEL SECURITY;

-- Admins can manage pending invites
CREATE POLICY "Admins can view pending invites"
  ON public.pending_user_invites
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'Admin'));

CREATE POLICY "Admins can insert pending invites"
  ON public.pending_user_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'Admin'));

CREATE POLICY "Admins can update pending invites"
  ON public.pending_user_invites
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'Admin'));

CREATE POLICY "Admins can delete pending invites"
  ON public.pending_user_invites
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'Admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_pending_user_invites_updated_at
  BEFORE UPDATE ON public.pending_user_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();