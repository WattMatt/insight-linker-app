-- Allow all authenticated users to insert site assets
CREATE POLICY "Authenticated users can insert assets"
ON public.site_assets
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow all authenticated users to update site assets
CREATE POLICY "Authenticated users can update assets"
ON public.site_assets
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow all authenticated users to delete site assets
CREATE POLICY "Authenticated users can delete assets"
ON public.site_assets
FOR DELETE
TO authenticated
USING (true);

-- Allow all authenticated users to view site assets
CREATE POLICY "Authenticated users can view assets"
ON public.site_assets
FOR SELECT
TO authenticated
USING (true);