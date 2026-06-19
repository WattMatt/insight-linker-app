-- Link an imported COC certificate row to the actual uploaded files (COC + evaluation report)
-- in the subsection's document store, so the Site COC tab can show attached status + preview.
alter table public.coc_certificates
  add column if not exists coc_document_id uuid references public.subsection_documents(id) on delete set null,
  add column if not exists eval_document_id uuid references public.subsection_documents(id) on delete set null;

notify pgrst, 'reload schema';
