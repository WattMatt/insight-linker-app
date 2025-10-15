-- Allow public (anon) users to read site documents for QR code landing pages
CREATE POLICY "Public users can view site documents"
ON public.site_documents
FOR SELECT
TO anon
USING (true);