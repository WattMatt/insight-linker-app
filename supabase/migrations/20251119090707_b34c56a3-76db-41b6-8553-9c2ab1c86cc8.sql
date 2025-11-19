-- CRITICAL SECURITY FIX: Restrict contractors to only their assigned sites and related data

-- Drop overly permissive policies for contractors
DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can view calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Authenticated users can view sites" ON public.sites;

-- Recreate clients policy - separate for admins and contractors
CREATE POLICY "Admins can view all clients"
ON public.clients
FOR SELECT
USING (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view clients for their sites"
ON public.clients
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND id IN (
    SELECT DISTINCT s.client_id
    FROM sites s
    INNER JOIN user_sites us ON us.site_id = s.id
    WHERE us.user_id = auth.uid()
  )
);

-- Recreate sites policy - separate for admins and contractors
CREATE POLICY "Admins can view all sites"
ON public.sites
FOR SELECT
USING (has_role(auth.uid(), 'Admin'::app_role));

-- Keep existing contractor sites policy (already correct)

-- Recreate calendar events policy - restrict to assigned sites
CREATE POLICY "Admins can view all calendar events"
ON public.calendar_events
FOR SELECT
USING (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view calendar events for their sites"
ON public.calendar_events
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND site_name IN (
    SELECT s.name
    FROM sites s
    INNER JOIN user_sites us ON us.site_id = s.id
    WHERE us.user_id = auth.uid()
  )
);

-- Ensure contractors cannot create/update/delete data they shouldn't access
DROP POLICY IF EXISTS "Authenticated users can create clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON public.clients;

CREATE POLICY "Admins can manage clients"
ON public.clients
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can create sites" ON public.sites;
DROP POLICY IF EXISTS "Authenticated users can update sites" ON public.sites;
DROP POLICY IF EXISTS "Authenticated users can delete sites" ON public.sites;

CREATE POLICY "Admins can manage sites"
ON public.sites
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can create calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Authenticated users can update calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Authenticated users can delete calendar events" ON public.calendar_events;

CREATE POLICY "Admins can manage calendar events"
ON public.calendar_events
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));