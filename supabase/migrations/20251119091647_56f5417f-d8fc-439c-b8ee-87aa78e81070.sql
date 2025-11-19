-- Create assignment history table
CREATE TABLE public.user_sites_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  site_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('assigned', 'removed')),
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.user_sites_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view assignment history"
ON public.user_sites_history
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "System can insert assignment history"
ON public.user_sites_history
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create trigger function to log assignments
CREATE OR REPLACE FUNCTION public.log_user_site_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_sites_history (user_id, site_id, action, performed_by)
    VALUES (NEW.user_id, NEW.site_id, 'assigned', auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.user_sites_history (user_id, site_id, action, performed_by)
    VALUES (OLD.user_id, OLD.site_id, 'removed', auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create triggers
CREATE TRIGGER log_user_site_insert
AFTER INSERT ON public.user_sites
FOR EACH ROW
EXECUTE FUNCTION public.log_user_site_assignment();

CREATE TRIGGER log_user_site_delete
AFTER DELETE ON public.user_sites
FOR EACH ROW
EXECUTE FUNCTION public.log_user_site_assignment();