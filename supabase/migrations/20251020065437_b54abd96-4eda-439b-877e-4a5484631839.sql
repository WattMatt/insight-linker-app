-- Add public RLS policy for clients table to allow QR code pages to display client information
CREATE POLICY "Public QR code access to client info"
ON public.clients
FOR SELECT
TO public
USING (true);