-- Site Documents management: add document metadata to site_documents, add an is_system
-- flag to BOTH category tables (so report/COC categories can be locked from rename/move/
-- delete), and seed is_system for the known system categories. Idempotent; apply via the
-- Supabase Management API database/query endpoint (NOT db push) due to prod/migration drift.

-- 1) Metadata columns on site_documents (nullable; populated going forward, old rows null).
ALTER TABLE public.site_documents ADD COLUMN IF NOT EXISTS file_size  bigint;
ALTER TABLE public.site_documents ADD COLUMN IF NOT EXISTS mime_type  text;
ALTER TABLE public.site_documents ADD COLUMN IF NOT EXISTS uploaded_by uuid references auth.users(id);
ALTER TABLE public.site_documents ADD COLUMN IF NOT EXISTS updated_by  uuid references auth.users(id);

-- 2) is_system flag on both category tables.
ALTER TABLE public.site_document_categories ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.document_categories      ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- 3) Seed is_system for system report categories (both tables).
UPDATE public.site_document_categories SET is_system = true
WHERE name IN (
  'Site Summary Reports','Asset Verification Reports','Floor Plan Reports','Inspection Reports',
  'COC Validation Reports','Site COC Reports','Site Drawing Reports','Marking Checklists','Generated Reports'
) AND is_system = false;

-- Subsection categories: report categories PLUS auto-created COC categories ('COC', eval-report
-- categories). These are app-managed and must not be rename/move targets on the Documents tab.
UPDATE public.document_categories SET is_system = true
WHERE (
  name IN (
    'Site Summary Reports','Asset Verification Reports','Floor Plan Reports','Inspection Reports',
    'COC Validation Reports','Site COC Reports','Site Drawing Reports','Marking Checklists','Generated Reports'
  )
  OR name ILIKE '%coc%'
  OR name ILIKE '%evaluation report%'
) AND is_system = false;

NOTIFY pgrst, 'reload schema';
