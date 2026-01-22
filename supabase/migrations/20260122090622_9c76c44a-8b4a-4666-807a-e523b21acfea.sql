-- Create table for client access links (shareable magic links)
CREATE TABLE public.client_access_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'site' CHECK (link_type IN ('client', 'site', 'subsection')),
  subsection_id UUID REFERENCES public.subsections(id) ON DELETE CASCADE,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  access_count INTEGER NOT NULL DEFAULT 0
);

-- Create index for fast token lookups
CREATE INDEX idx_client_access_links_token ON public.client_access_links(access_token);
CREATE INDEX idx_client_access_links_client ON public.client_access_links(client_id);
CREATE INDEX idx_client_access_links_site ON public.client_access_links(site_id);

-- Enable RLS
ALTER TABLE public.client_access_links ENABLE ROW LEVEL SECURITY;

-- Admins can manage all access links
CREATE POLICY "Admins can manage access links"
ON public.client_access_links
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'Admin'
  )
);

-- Function to validate and log access link usage
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
  UPDATE public.client_access_links cal
  SET 
    last_accessed_at = now(),
    access_count = access_count + 1
  WHERE cal.access_token = token
    AND cal.is_active = true
    AND (cal.expires_at IS NULL OR cal.expires_at > now());
  
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