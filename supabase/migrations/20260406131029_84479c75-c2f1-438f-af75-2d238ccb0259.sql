
-- ============================================
-- coc_compliance_photos
-- ============================================
DROP POLICY IF EXISTS "Admins can manage all COC photos" ON public.coc_compliance_photos;
DROP POLICY IF EXISTS "Contractors can view COC photos for assigned sites" ON public.coc_compliance_photos;
DROP POLICY IF EXISTS "Users can manage all COC photos" ON public.coc_compliance_photos;
DROP POLICY IF EXISTS "Users can manage their own COC photos" ON public.coc_compliance_photos;

CREATE POLICY "All authenticated users full access"
ON public.coc_compliance_photos FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- offline_photos
-- ============================================
DROP POLICY IF EXISTS "Admins can manage all offline photos" ON public.offline_photos;
DROP POLICY IF EXISTS "Contractors can view offline photos for assigned sites" ON public.offline_photos;
DROP POLICY IF EXISTS "Users can manage all offline photos" ON public.offline_photos;
DROP POLICY IF EXISTS "Users can manage their own offline photos" ON public.offline_photos;

CREATE POLICY "All authenticated users full access"
ON public.offline_photos FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- floor_plan_pins
-- ============================================
DROP POLICY IF EXISTS "Admins can manage all floor plan pins" ON public.floor_plan_pins;
DROP POLICY IF EXISTS "Clients can view floor plan pins for their sites" ON public.floor_plan_pins;
DROP POLICY IF EXISTS "Contractors can view floor plan pins for assigned sites" ON public.floor_plan_pins;
DROP POLICY IF EXISTS "Users can manage all floor plan pins" ON public.floor_plan_pins;

CREATE POLICY "All authenticated users full access"
ON public.floor_plan_pins FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Keep existing public SELECT
-- "Public can view floor_plan_pins" already exists

-- ============================================
-- document_categories
-- ============================================
DROP POLICY IF EXISTS "Admins can manage all document categories" ON public.document_categories;
DROP POLICY IF EXISTS "Clients can view document categories for their sites" ON public.document_categories;
DROP POLICY IF EXISTS "Contractors can view document categories for assigned sites" ON public.document_categories;
DROP POLICY IF EXISTS "Users can manage all document categories" ON public.document_categories;

CREATE POLICY "All authenticated users full access"
ON public.document_categories FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Keep existing "Public can view document categories"

-- ============================================
-- inspection_items
-- ============================================
DROP POLICY IF EXISTS "Admins can manage all inspection items" ON public.inspection_items;
DROP POLICY IF EXISTS "Contractors can view inspection items for assigned sites" ON public.inspection_items;
DROP POLICY IF EXISTS "Users can manage all inspection items" ON public.inspection_items;

CREATE POLICY "All authenticated users full access"
ON public.inspection_items FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- inspection_signatures
-- ============================================
DROP POLICY IF EXISTS "Admins can delete signatures" ON public.inspection_signatures;
DROP POLICY IF EXISTS "Authenticated users can create signatures" ON public.inspection_signatures;
DROP POLICY IF EXISTS "Users can update their own signatures" ON public.inspection_signatures;
DROP POLICY IF EXISTS "Users can view signatures for inspections they have access to" ON public.inspection_signatures;

CREATE POLICY "All authenticated users full access"
ON public.inspection_signatures FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- floor_plan_pin_comments
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.floor_plan_pin_comments;
DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.floor_plan_pin_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.floor_plan_pin_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.floor_plan_pin_comments;

CREATE POLICY "All authenticated users full access"
ON public.floor_plan_pin_comments FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
