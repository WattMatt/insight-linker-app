-- Create table for OAuth API clients (external applications)
CREATE TABLE public.api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_id TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  client_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  redirect_uris TEXT[] DEFAULT '{}',
  scopes TEXT[] DEFAULT ARRAY['reports:read'],
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create table for OAuth access tokens
CREATE TABLE public.api_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.api_clients(id) ON DELETE CASCADE NOT NULL,
  access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  refresh_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  scopes TEXT[] DEFAULT ARRAY['reports:read'],
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  refresh_expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- Create table for API request logs (audit trail)
CREATE TABLE public.api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.api_clients(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  request_params JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for api_clients (only admins can manage)
CREATE POLICY "Admins can manage API clients" 
ON public.api_clients 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'Admin'))
WITH CHECK (public.has_role(auth.uid(), 'Admin'));

-- RLS Policies for api_access_tokens (service role only via edge functions)
CREATE POLICY "Service role manages tokens" 
ON public.api_access_tokens 
FOR ALL 
TO service_role 
USING (true)
WITH CHECK (true);

-- RLS Policies for api_request_logs (admins can view)
CREATE POLICY "Admins can view API logs" 
ON public.api_request_logs 
FOR SELECT 
TO authenticated 
USING (public.has_role(auth.uid(), 'Admin'));

CREATE POLICY "Service role manages logs" 
ON public.api_request_logs 
FOR ALL 
TO service_role 
USING (true)
WITH CHECK (true);

-- Function to validate access token
CREATE OR REPLACE FUNCTION public.validate_api_token(token TEXT)
RETURNS TABLE(client_id UUID, scopes TEXT[], is_valid BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.client_id,
    t.scopes,
    (t.expires_at > now() AND c.is_active) as is_valid
  FROM public.api_access_tokens t
  JOIN public.api_clients c ON c.id = t.client_id
  WHERE t.access_token = token
  LIMIT 1;
  
  -- Update last_used_at
  UPDATE public.api_access_tokens 
  SET last_used_at = now()
  WHERE access_token = token;
END;
$$;

-- Index for faster token lookups
CREATE INDEX idx_api_access_tokens_token ON public.api_access_tokens(access_token);
CREATE INDEX idx_api_access_tokens_expires ON public.api_access_tokens(expires_at);
CREATE INDEX idx_api_clients_client_id ON public.api_clients(client_id);