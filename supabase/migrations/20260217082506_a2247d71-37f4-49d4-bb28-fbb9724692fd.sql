
-- Table to store visitor details and log each access
CREATE TABLE public.access_link_visitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_link_id UUID REFERENCES public.client_access_links(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

-- Enable RLS
ALTER TABLE public.access_link_visitors ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public pages)
CREATE POLICY "Anyone can register as visitor"
  ON public.access_link_visitors FOR INSERT
  WITH CHECK (true);

-- Allow authenticated admins to read
CREATE POLICY "Admins can view visitors"
  ON public.access_link_visitors FOR SELECT
  USING (public.has_role(auth.uid(), 'Admin'));

-- Index for quick lookups
CREATE INDEX idx_access_link_visitors_link_id ON public.access_link_visitors(access_link_id);
CREATE INDEX idx_access_link_visitors_email ON public.access_link_visitors(email);
