-- Step 2: Create user_clients mapping table and update RLS policies

-- Create user_clients mapping table (1:1 relationship between users and clients)
CREATE TABLE IF NOT EXISTS public.user_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(client_id)
);

-- Enable RLS on user_clients
ALTER TABLE public.user_clients ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_clients
CREATE POLICY "Admins can manage user-client mappings"
ON public.user_clients
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'Admin'));

CREATE POLICY "Users can view their own client mapping"
ON public.user_clients
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Security definer function to get client_id for current user
CREATE OR REPLACE FUNCTION public.get_user_client_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id 
  FROM public.user_clients 
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Update RLS policies for client-specific data access

-- Sites: Clients can only view their own sites
CREATE POLICY "Clients can view their own sites"
ON public.sites
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'Client') AND 
  client_id = public.get_user_client_id()
);

-- Subsections: Clients can view subsections of their sites
CREATE POLICY "Clients can view their subsections"
ON public.subsections
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'Client') AND
  site_id IN (
    SELECT id FROM public.sites WHERE client_id = public.get_user_client_id()
  )
);

-- Inspections: Clients can view inspections of their sites
CREATE POLICY "Clients can view their inspections"
ON public.inspections
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'Client') AND
  site_id IN (
    SELECT id FROM public.sites WHERE client_id = public.get_user_client_id()
  )
);

-- Site documents: Clients can view documents from their sites
CREATE POLICY "Clients can view their site documents"
ON public.site_documents
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'Client') AND
  site_id IN (
    SELECT id FROM public.sites WHERE client_id = public.get_user_client_id()
  )
);

-- Subsection documents: Clients can view documents from their subsections
CREATE POLICY "Clients can view their subsection documents"
ON public.subsection_documents
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'Client') AND
  subsection_id IN (
    SELECT id FROM public.subsections 
    WHERE site_id IN (
      SELECT id FROM public.sites WHERE client_id = public.get_user_client_id()
    )
  )
);

-- Calendar events: Clients can view their calendar events
CREATE POLICY "Clients can view their calendar events"
ON public.calendar_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'Client') AND
  site_name IN (
    SELECT name FROM public.sites WHERE client_id = public.get_user_client_id()
  )
);

-- Snags: Clients can view snags from their subsections
CREATE POLICY "Clients can view their snags"
ON public.snags
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'Client') AND
  subsection_id IN (
    SELECT id FROM public.subsections 
    WHERE site_id IN (
      SELECT id FROM public.sites WHERE client_id = public.get_user_client_id()
    )
  )
);

COMMENT ON TABLE public.user_clients IS 'Maps users to clients for client portal access (1:1 relationship)';
COMMENT ON FUNCTION public.get_user_client_id() IS 'Returns the client_id for the currently authenticated user';