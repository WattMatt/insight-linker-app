-- COMPREHENSIVE RLS AUDIT: Restrict contractors across all tables

-- ============================================
-- INSPECTION ITEMS - Already has policies, verify they're secure
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view items" ON public.inspection_items;
DROP POLICY IF EXISTS "Authenticated users can create items" ON public.inspection_items;
DROP POLICY IF EXISTS "Authenticated users can update items" ON public.inspection_items;
DROP POLICY IF EXISTS "Authenticated users can delete items" ON public.inspection_items;

CREATE POLICY "Admins can manage inspection items"
ON public.inspection_items
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view inspection items for their sites"
ON public.inspection_items
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND subsection_id IN (
    SELECT isubsec.id
    FROM inspection_subsections isubsec
    INNER JOIN inspections i ON i.id = isubsec.inspection_id
    INNER JOIN user_sites us ON us.site_id = i.site_id
    WHERE us.user_id = auth.uid()
  )
);

-- ============================================
-- INSPECTION SUBSECTIONS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view subsections" ON public.inspection_subsections;
DROP POLICY IF EXISTS "Authenticated users can create subsections" ON public.inspection_subsections;
DROP POLICY IF EXISTS "Authenticated users can update subsections" ON public.inspection_subsections;
DROP POLICY IF EXISTS "Authenticated users can delete subsections" ON public.inspection_subsections;

CREATE POLICY "Admins can manage inspection subsections"
ON public.inspection_subsections
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view inspection subsections for their sites"
ON public.inspection_subsections
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND inspection_id IN (
    SELECT i.id
    FROM inspections i
    INNER JOIN user_sites us ON us.site_id = i.site_id
    WHERE us.user_id = auth.uid()
  )
);

-- ============================================
-- SUBSECTION DOCUMENTS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can insert subsection documents" ON public.subsection_documents;
DROP POLICY IF EXISTS "Authenticated users can update subsection documents" ON public.subsection_documents;
DROP POLICY IF EXISTS "Authenticated users can delete subsection documents" ON public.subsection_documents;

CREATE POLICY "Admins can manage subsection documents"
ON public.subsection_documents
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view subsection documents for their sites"
ON public.subsection_documents
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND subsection_id IN (
    SELECT s.id
    FROM subsections s
    INNER JOIN user_sites us ON us.site_id = s.site_id
    WHERE us.user_id = auth.uid()
  )
);

-- ============================================
-- SITE DOCUMENTS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can insert site documents" ON public.site_documents;
DROP POLICY IF EXISTS "Authenticated users can update site documents" ON public.site_documents;
DROP POLICY IF EXISTS "Authenticated users can delete site documents" ON public.site_documents;

CREATE POLICY "Admins can manage site documents"
ON public.site_documents
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view site documents for their sites"
ON public.site_documents
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND site_id IN (
    SELECT site_id FROM user_sites WHERE user_id = auth.uid()
  )
);

-- ============================================
-- SNAGS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view snags" ON public.snags;

CREATE POLICY "Admins can view all snags"
ON public.snags
FOR SELECT
USING (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view snags for their sites"
ON public.snags
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND subsection_id IN (
    SELECT s.id
    FROM subsections s
    INNER JOIN user_sites us ON us.site_id = s.site_id
    WHERE us.user_id = auth.uid()
  )
);

-- ============================================
-- DOCUMENT CATEGORIES
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can manage document categories" ON public.document_categories;

CREATE POLICY "Admins can manage document categories"
ON public.document_categories
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view document categories for their sites"
ON public.document_categories
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND subsection_id IN (
    SELECT s.id
    FROM subsections s
    INNER JOIN user_sites us ON us.site_id = s.site_id
    WHERE us.user_id = auth.uid()
  )
);

-- ============================================
-- SITE DOCUMENT CATEGORIES
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can manage site document categories" ON public.site_document_categories;

CREATE POLICY "Admins can manage site document categories"
ON public.site_document_categories
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view site document categories for their sites"
ON public.site_document_categories
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND site_id IN (
    SELECT site_id FROM user_sites WHERE user_id = auth.uid()
  )
);

-- ============================================
-- SITE MARKING CHECKLIST
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view marking checklists" ON public.site_marking_checklist;
DROP POLICY IF EXISTS "Authenticated users can create marking checklists" ON public.site_marking_checklist;
DROP POLICY IF EXISTS "Authenticated users can update marking checklists" ON public.site_marking_checklist;
DROP POLICY IF EXISTS "Authenticated users can delete marking checklists" ON public.site_marking_checklist;

CREATE POLICY "Admins can manage marking checklists"
ON public.site_marking_checklist
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view marking checklists for their sites"
ON public.site_marking_checklist
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND site_id IN (
    SELECT site_id FROM user_sites WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Contractors can update marking checklists for their sites"
ON public.site_marking_checklist
FOR UPDATE
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND site_id IN (
    SELECT site_id FROM user_sites WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND site_id IN (
    SELECT site_id FROM user_sites WHERE user_id = auth.uid()
  )
);

-- ============================================
-- COC VALIDATIONS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view COC validations" ON public.coc_validations;
DROP POLICY IF EXISTS "Authenticated users can create COC validations" ON public.coc_validations;
DROP POLICY IF EXISTS "Authenticated users can update COC validations" ON public.coc_validations;

CREATE POLICY "Admins can manage COC validations"
ON public.coc_validations
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view COC validations for their sites"
ON public.coc_validations
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND subsection_id IN (
    SELECT s.id
    FROM subsections s
    INNER JOIN user_sites us ON us.site_id = s.site_id
    WHERE us.user_id = auth.uid()
  )
);

-- ============================================
-- INSPECTION TEMPLATES
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.inspection_templates;
DROP POLICY IF EXISTS "Authenticated users can create templates" ON public.inspection_templates;
DROP POLICY IF EXISTS "Authenticated users can update templates" ON public.inspection_templates;
DROP POLICY IF EXISTS "Authenticated users can delete templates" ON public.inspection_templates;

CREATE POLICY "Admins can manage inspection templates"
ON public.inspection_templates
FOR ALL
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Contractors can view inspection templates"
ON public.inspection_templates
FOR SELECT
USING (has_role(auth.uid(), 'Contractor'::app_role));

-- ============================================
-- PROFILES - Contractors should only see their own
-- ============================================
CREATE POLICY "Contractors can view their own profile"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND id = auth.uid()
);

-- ============================================
-- ACTIVITY LOGS - Contractors should only see their own
-- ============================================
CREATE POLICY "Contractors can view their own activity logs"
ON public.activity_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'Contractor'::app_role)
  AND user_id = auth.uid()
);