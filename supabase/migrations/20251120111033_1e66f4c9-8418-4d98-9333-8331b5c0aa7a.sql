-- Emergency Fix: Add User role policies (without the INSERT that failed)
-- This restores access for users with the "User" role

-- Sites
CREATE POLICY "Users can manage all sites" ON sites
  FOR ALL 
  USING (has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'User'::app_role));

-- Subsections
CREATE POLICY "Users can manage all subsections" ON subsections
  FOR ALL 
  USING (has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'User'::app_role));

-- Inspections
CREATE POLICY "Users can manage all inspections" ON inspections
  FOR ALL 
  USING (has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'User'::app_role));

-- Site Documents
CREATE POLICY "Users can manage all site documents" ON site_documents
  FOR ALL 
  USING (has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'User'::app_role));

-- Floor Plan Pins
CREATE POLICY "Users can manage all floor plan pins" ON floor_plan_pins
  FOR ALL 
  USING (has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'User'::app_role));

-- Subsection Floor Plans
CREATE POLICY "Users can manage all subsection floor plans" ON subsection_floor_plans
  FOR ALL 
  USING (has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'User'::app_role));

-- Document Categories
CREATE POLICY "Users can manage all document categories" ON document_categories
  FOR ALL 
  USING (has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'User'::app_role));

-- Snags
CREATE POLICY "Users can manage all snags" ON snags
  FOR ALL 
  USING (has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'User'::app_role));

-- Inspection Items
CREATE POLICY "Users can manage all inspection items" ON inspection_items
  FOR ALL 
  USING (has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'User'::app_role));