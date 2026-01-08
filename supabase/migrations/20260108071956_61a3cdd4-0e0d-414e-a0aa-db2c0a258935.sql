-- Add public read policies for QR code landing page
-- These allow unauthenticated users to view subsection data when accessing via public QR code link

-- Public can view subsections (for QR code landing page)
CREATE POLICY "Public can view subsections"
ON public.subsections
FOR SELECT
USING (true);

-- Public can view sites (needed for subsection context)
CREATE POLICY "Public can view sites"
ON public.sites
FOR SELECT
USING (true);

-- Public can view clients (needed for site/subsection context)
CREATE POLICY "Public can view clients"
ON public.clients
FOR SELECT
USING (true);

-- Public can view document categories (for public document listing)
CREATE POLICY "Public can view document categories"
ON public.document_categories
FOR SELECT
USING (true);

-- Public can view site documents (for public document download)
CREATE POLICY "Public can view site documents"
ON public.site_documents
FOR SELECT
USING (true);