-- Add public RLS policy for document_categories table to allow QR code pages to view document categories
CREATE POLICY "Public can view document categories"
ON public.document_categories
FOR SELECT
TO public
USING (true);