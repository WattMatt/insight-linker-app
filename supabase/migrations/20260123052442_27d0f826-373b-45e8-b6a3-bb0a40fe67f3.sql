-- Add public read policies for tables needed by public review pages

-- 1. coc_validations - needed for COC status display
CREATE POLICY "Public can view coc_validations" 
ON public.coc_validations 
FOR SELECT 
USING (true);

-- 2. inspections - needed for inspection status display
CREATE POLICY "Public can view inspections"
ON public.inspections
FOR SELECT
USING (true);

-- 3. floor_plan_pins - needed for floor plan display
CREATE POLICY "Public can view floor_plan_pins"
ON public.floor_plan_pins
FOR SELECT
USING (true);

-- 4. subsection_floor_plans - needed for floor plan display
CREATE POLICY "Public can view subsection_floor_plans"
ON public.subsection_floor_plans
FOR SELECT
USING (true);

-- 5. subsection_documents - check and add if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'subsection_documents' 
    AND cmd = 'SELECT' 
    AND qual = 'true'
  ) THEN
    CREATE POLICY "Public can view subsection_documents"
    ON public.subsection_documents
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- 6. site_documents - needed for site documents display
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'site_documents' 
    AND cmd = 'SELECT' 
    AND qual = 'true'
  ) THEN
    CREATE POLICY "Public can view site_documents"
    ON public.site_documents
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- 7. inspection_templates - needed for template details in inspections
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'inspection_templates' 
    AND cmd = 'SELECT' 
    AND qual = 'true'
  ) THEN
    CREATE POLICY "Public can view inspection_templates"
    ON public.inspection_templates
    FOR SELECT
    USING (true);
  END IF;
END $$;