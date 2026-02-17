-- Allow anonymous users to read site_assets (for public review portals)
-- This is safe because site_assets contain only electrical meter metadata, no PII
CREATE POLICY "Public can view site assets"
ON public.site_assets
FOR SELECT
TO anon
USING (true);