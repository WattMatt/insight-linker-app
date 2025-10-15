-- Allow public (anon) users to read subsections data for QR code landing pages
CREATE POLICY "Public users can view subsections"
ON public.subsections
FOR SELECT
TO anon
USING (true);

-- Allow public (anon) users to read sites data
CREATE POLICY "Public users can view sites"
ON public.sites
FOR SELECT
TO anon
USING (true);

-- Allow public (anon) users to read clients data
CREATE POLICY "Public users can view clients"
ON public.clients
FOR SELECT
TO anon
USING (true);

-- Allow public (anon) users to read document categories
CREATE POLICY "Public users can view document categories"
ON public.document_categories
FOR SELECT
TO anon
USING (true);

-- Allow public (anon) users to read subsection documents
CREATE POLICY "Public users can view subsection documents"
ON public.subsection_documents
FOR SELECT
TO anon
USING (true);