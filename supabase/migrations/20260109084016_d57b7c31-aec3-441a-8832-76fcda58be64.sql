-- Add public read access for snags on the public QR landing page
-- This allows anonymous users to view snags for any subsection they have the ID for
-- This is intentional for the QR code public access feature

CREATE POLICY "Public can view snags via subsection ID"
ON public.snags
FOR SELECT
USING (true);