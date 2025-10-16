-- Add public read access policy for clients table
-- This allows QR code public pages to display client information
CREATE POLICY "Public can view client basic info"
ON public.clients
FOR SELECT
USING (true);