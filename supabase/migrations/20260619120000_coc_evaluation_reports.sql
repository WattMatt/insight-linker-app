-- Evaluation reports: link a supporting evaluation/verification report document to
-- its COC certificate. Eval reports live in a "report"-named category (excluded from
-- the COC roll-up), so this never affects is_compliant.
ALTER TABLE public.subsection_documents
  ADD COLUMN IF NOT EXISTS parent_document_id uuid
  REFERENCES public.subsection_documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_subsection_documents_parent
  ON public.subsection_documents(parent_document_id);

NOTIFY pgrst, 'reload schema';
