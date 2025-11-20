-- Remove ALL RLS restrictions for authenticated users
-- This allows authenticated users full access to all tables

-- site_document_categories - currently causing errors
DROP POLICY IF EXISTS "Admins can manage site document categories" ON site_document_categories;
DROP POLICY IF EXISTS "Contractors can view site document categories for their sites" ON site_document_categories;

CREATE POLICY "All authenticated users full access to site_document_categories"
ON site_document_categories
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- document_categories
DROP POLICY IF EXISTS "Admins can manage document categories" ON document_categories;
DROP POLICY IF EXISTS "Contractors can view document categories for their sites" ON document_categories;
DROP POLICY IF EXISTS "Public can view document categories" ON document_categories;

CREATE POLICY "All authenticated users full access to document_categories"
ON document_categories
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- site_documents
DROP POLICY IF EXISTS "Admins can manage site documents" ON site_documents;
DROP POLICY IF EXISTS "Clients can view their site documents" ON site_documents;
DROP POLICY IF EXISTS "Contractors can view site documents for their sites" ON site_documents;
DROP POLICY IF EXISTS "Public can view site documents" ON site_documents;

CREATE POLICY "All authenticated users full access to site_documents"
ON site_documents
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- subsections
DROP POLICY IF EXISTS "Authenticated users can create subsections" ON subsections;
DROP POLICY IF EXISTS "Authenticated users can delete subsections" ON subsections;
DROP POLICY IF EXISTS "Authenticated users can update subsections" ON subsections;
DROP POLICY IF EXISTS "Authenticated users can view subsections" ON subsections;
DROP POLICY IF EXISTS "Clients can view their subsections" ON subsections;
DROP POLICY IF EXISTS "Contractors can view subsections for their sites" ON subsections;
DROP POLICY IF EXISTS "Public QR code access - subsection name and ID only" ON subsections;

CREATE POLICY "All authenticated users full access to subsections"
ON subsections
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- sites
DROP POLICY IF EXISTS "Admins can manage sites" ON sites;
DROP POLICY IF EXISTS "Admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Clients can view their own sites" ON sites;
DROP POLICY IF EXISTS "Contractors can view their assigned sites" ON sites;
DROP POLICY IF EXISTS "Public QR code access - minimal data only" ON sites;

CREATE POLICY "All authenticated users full access to sites"
ON sites
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- inspections
DROP POLICY IF EXISTS "Authenticated users can create inspections" ON inspections;
DROP POLICY IF EXISTS "Authenticated users can delete inspections" ON inspections;
DROP POLICY IF EXISTS "Authenticated users can update inspections" ON inspections;
DROP POLICY IF EXISTS "Authenticated users can view inspections" ON inspections;
DROP POLICY IF EXISTS "Clients can view their inspections" ON inspections;
DROP POLICY IF EXISTS "Contractors can update inspections for their sites" ON inspections;
DROP POLICY IF EXISTS "Contractors can view inspections for their sites" ON inspections;

CREATE POLICY "All authenticated users full access to inspections"
ON inspections
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- subsection_floor_plans
DROP POLICY IF EXISTS "Authenticated users can insert floor plans" ON subsection_floor_plans;
DROP POLICY IF EXISTS "Users can delete their floor plans" ON subsection_floor_plans;
DROP POLICY IF EXISTS "Users can update their floor plans" ON subsection_floor_plans;
DROP POLICY IF EXISTS "Users can view floor plans for their subsections" ON subsection_floor_plans;

CREATE POLICY "All authenticated users full access to subsection_floor_plans"
ON subsection_floor_plans
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- floor_plan_pins
DROP POLICY IF EXISTS "Authenticated users can insert pins" ON floor_plan_pins;
DROP POLICY IF EXISTS "Users can delete pins" ON floor_plan_pins;
DROP POLICY IF EXISTS "Users can update pins" ON floor_plan_pins;
DROP POLICY IF EXISTS "Users can view pins for accessible floor plans" ON floor_plan_pins;

CREATE POLICY "All authenticated users full access to floor_plan_pins"
ON floor_plan_pins
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- snags
DROP POLICY IF EXISTS "Admins can view all snags" ON snags;
DROP POLICY IF EXISTS "Authenticated users can create snags" ON snags;
DROP POLICY IF EXISTS "Authenticated users can delete their own snags" ON snags;
DROP POLICY IF EXISTS "Authenticated users can update their own snags" ON snags;
DROP POLICY IF EXISTS "Clients can view their snags" ON snags;
DROP POLICY IF EXISTS "Contractors can view snags for their sites" ON snags;

CREATE POLICY "All authenticated users full access to snags"
ON snags
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- site_marking_checklist
DROP POLICY IF EXISTS "Admins can manage marking checklists" ON site_marking_checklist;
DROP POLICY IF EXISTS "Contractors can update marking checklists for their sites" ON site_marking_checklist;
DROP POLICY IF EXISTS "Contractors can view marking checklists for their sites" ON site_marking_checklist;

CREATE POLICY "All authenticated users full access to site_marking_checklist"
ON site_marking_checklist
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- coc_validations
DROP POLICY IF EXISTS "Admins can manage COC validations" ON coc_validations;
DROP POLICY IF EXISTS "Contractors can view COC validations for their sites" ON coc_validations;

CREATE POLICY "All authenticated users full access to coc_validations"
ON coc_validations
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- inspection_items
DROP POLICY IF EXISTS "Admins can manage inspection items" ON inspection_items;
DROP POLICY IF EXISTS "Contractors can view inspection items for their sites" ON inspection_items;

CREATE POLICY "All authenticated users full access to inspection_items"
ON inspection_items
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- inspection_subsections
DROP POLICY IF EXISTS "Admins can manage inspection subsections" ON inspection_subsections;
DROP POLICY IF EXISTS "Contractors can view inspection subsections for their sites" ON inspection_subsections;

CREATE POLICY "All authenticated users full access to inspection_subsections"
ON inspection_subsections
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- inspection_templates
DROP POLICY IF EXISTS "Admins can manage inspection templates" ON inspection_templates;
DROP POLICY IF EXISTS "Contractors can view inspection templates" ON inspection_templates;

CREATE POLICY "All authenticated users full access to inspection_templates"
ON inspection_templates
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- calendar_events
DROP POLICY IF EXISTS "Admins can manage calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Admins can view all calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Clients can view their calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Contractors can view calendar events for their sites" ON calendar_events;

CREATE POLICY "All authenticated users full access to calendar_events"
ON calendar_events
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- qr_codes
DROP POLICY IF EXISTS "Admins can manage all QR codes" ON qr_codes;
DROP POLICY IF EXISTS "Clients can view their QR codes" ON qr_codes;
DROP POLICY IF EXISTS "Contractors can view QR codes for their sites" ON qr_codes;
DROP POLICY IF EXISTS "Public can view QR codes" ON qr_codes;

CREATE POLICY "All authenticated users full access to qr_codes"
ON qr_codes
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- clients
DROP POLICY IF EXISTS "Admins can manage clients" ON clients;
DROP POLICY IF EXISTS "Admins can view all clients" ON clients;
DROP POLICY IF EXISTS "Contractors can view clients for their sites" ON clients;
DROP POLICY IF EXISTS "Public QR code access to client info" ON clients;

CREATE POLICY "All authenticated users full access to clients"
ON clients
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- user_sites
CREATE POLICY "All authenticated users full access to user_sites"
ON user_sites
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- user_clients
CREATE POLICY "All authenticated users full access to user_clients"
ON user_clients
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- validation_conversations
CREATE POLICY "All authenticated users full access to validation_conversations"
ON validation_conversations
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- validation_messages
CREATE POLICY "All authenticated users full access to validation_messages"
ON validation_messages
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- validation_feedback
CREATE POLICY "All authenticated users full access to validation_feedback"
ON validation_feedback
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);