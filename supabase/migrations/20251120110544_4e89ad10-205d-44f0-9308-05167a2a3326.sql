-- Phase 1: Create security definer helper functions
CREATE OR REPLACE FUNCTION public.contractor_has_site_access(_user_id uuid, _site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_sites
    WHERE user_id = _user_id
      AND site_id = _site_id
  )
$$;

-- Phase 2: Fix Sites Table RLS Policies
DROP POLICY IF EXISTS "All authenticated users full access to sites" ON sites;

CREATE POLICY "Admins can manage all sites" ON sites
  FOR ALL 
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Clients can view their sites" ON sites
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Client'::app_role) 
    AND client_id = get_user_client_id()
  );

CREATE POLICY "Contractors can view assigned sites" ON sites
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Contractor'::app_role)
    AND id IN (
      SELECT site_id FROM user_sites WHERE user_id = auth.uid()
    )
  );

-- Phase 3: Fix Subsections Table RLS Policies
DROP POLICY IF EXISTS "All authenticated users full access to subsections" ON subsections;

CREATE POLICY "Admins can manage all subsections" ON subsections
  FOR ALL 
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Clients can view subsections for their sites" ON subsections
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Client'::app_role)
    AND site_id IN (
      SELECT id FROM sites WHERE client_id = get_user_client_id()
    )
  );

CREATE POLICY "Contractors can view subsections for assigned sites" ON subsections
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Contractor'::app_role)
    AND site_id IN (
      SELECT site_id FROM user_sites WHERE user_id = auth.uid()
    )
  );

-- Phase 4: Fix Inspections Table RLS Policies
DROP POLICY IF EXISTS "All authenticated users full access to inspections" ON inspections;

CREATE POLICY "Admins can manage all inspections" ON inspections
  FOR ALL 
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Clients can view inspections for their sites" ON inspections
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Client'::app_role)
    AND site_id IN (
      SELECT id FROM sites WHERE client_id = get_user_client_id()
    )
  );

CREATE POLICY "Contractors can view inspections for assigned sites" ON inspections
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Contractor'::app_role)
    AND site_id IN (
      SELECT site_id FROM user_sites WHERE user_id = auth.uid()
    )
  );

-- Phase 5: Fix Site Documents Table RLS Policies
DROP POLICY IF EXISTS "All authenticated users full access to site_documents" ON site_documents;

CREATE POLICY "Admins can manage all site documents" ON site_documents
  FOR ALL 
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Clients can view site documents for their sites" ON site_documents
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Client'::app_role)
    AND site_id IN (
      SELECT id FROM sites WHERE client_id = get_user_client_id()
    )
  );

CREATE POLICY "Contractors can view site documents for assigned sites" ON site_documents
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Contractor'::app_role)
    AND site_id IN (
      SELECT site_id FROM user_sites WHERE user_id = auth.uid()
    )
  );

-- Phase 6: Fix Floor Plan Pins Table RLS Policies
DROP POLICY IF EXISTS "All authenticated users full access to floor_plan_pins" ON floor_plan_pins;

CREATE POLICY "Admins can manage all floor plan pins" ON floor_plan_pins
  FOR ALL 
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Clients can view floor plan pins for their sites" ON floor_plan_pins
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Client'::app_role)
    AND floor_plan_id IN (
      SELECT fp.id FROM subsection_floor_plans fp
      JOIN subsections s ON s.id = fp.subsection_id
      JOIN sites st ON st.id = s.site_id
      WHERE st.client_id = get_user_client_id()
    )
  );

CREATE POLICY "Contractors can view floor plan pins for assigned sites" ON floor_plan_pins
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Contractor'::app_role)
    AND floor_plan_id IN (
      SELECT fp.id FROM subsection_floor_plans fp
      JOIN subsections s ON s.id = fp.subsection_id
      WHERE s.site_id IN (
        SELECT site_id FROM user_sites WHERE user_id = auth.uid()
      )
    )
  );

-- Phase 7: Fix Subsection Floor Plans Table RLS Policies
DROP POLICY IF EXISTS "All authenticated users full access to subsection_floor_plans" ON subsection_floor_plans;

CREATE POLICY "Admins can manage all subsection floor plans" ON subsection_floor_plans
  FOR ALL 
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Clients can view subsection floor plans for their sites" ON subsection_floor_plans
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Client'::app_role)
    AND subsection_id IN (
      SELECT s.id FROM subsections s
      JOIN sites st ON st.id = s.site_id
      WHERE st.client_id = get_user_client_id()
    )
  );

CREATE POLICY "Contractors can view subsection floor plans for assigned sites" ON subsection_floor_plans
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Contractor'::app_role)
    AND subsection_id IN (
      SELECT s.id FROM subsections s
      WHERE s.site_id IN (
        SELECT site_id FROM user_sites WHERE user_id = auth.uid()
      )
    )
  );

-- Phase 8: Fix Document Categories Table RLS Policies
DROP POLICY IF EXISTS "All authenticated users full access to document_categories" ON document_categories;

CREATE POLICY "Admins can manage all document categories" ON document_categories
  FOR ALL 
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Clients can view document categories for their sites" ON document_categories
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Client'::app_role)
    AND subsection_id IN (
      SELECT s.id FROM subsections s
      JOIN sites st ON st.id = s.site_id
      WHERE st.client_id = get_user_client_id()
    )
  );

CREATE POLICY "Contractors can view document categories for assigned sites" ON document_categories
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Contractor'::app_role)
    AND subsection_id IN (
      SELECT s.id FROM subsections s
      WHERE s.site_id IN (
        SELECT site_id FROM user_sites WHERE user_id = auth.uid()
      )
    )
  );

-- Phase 9: Fix Snags Table RLS Policies
DROP POLICY IF EXISTS "All authenticated users full access to snags" ON snags;

CREATE POLICY "Admins can manage all snags" ON snags
  FOR ALL 
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Clients can view snags for their sites" ON snags
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Client'::app_role)
    AND subsection_id IN (
      SELECT s.id FROM subsections s
      JOIN sites st ON st.id = s.site_id
      WHERE st.client_id = get_user_client_id()
    )
  );

CREATE POLICY "Contractors can view snags for assigned sites" ON snags
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Contractor'::app_role)
    AND subsection_id IN (
      SELECT s.id FROM subsections s
      WHERE s.site_id IN (
        SELECT site_id FROM user_sites WHERE user_id = auth.uid()
      )
    )
  );

-- Phase 10: Fix Inspection Items Table RLS Policies
DROP POLICY IF EXISTS "All authenticated users full access to inspection_items" ON inspection_items;

CREATE POLICY "Admins can manage all inspection items" ON inspection_items
  FOR ALL 
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view inspection items for assigned sites" ON inspection_items
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'Contractor'::app_role)
    AND subsection_id IN (
      SELECT isub.id FROM inspection_subsections isub
      JOIN inspections i ON i.id = isub.inspection_id
      WHERE i.site_id IN (
        SELECT site_id FROM user_sites WHERE user_id = auth.uid()
      )
    )
  );