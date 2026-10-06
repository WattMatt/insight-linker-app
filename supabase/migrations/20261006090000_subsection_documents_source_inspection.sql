-- Link a generated inspection report to the inspection it was built from, so the
-- replace-on-save rule can keep ONE current report PER INSPECTION (not one per
-- subsection + category). Additive and nullable: uploaded documents and legacy
-- reports keep NULL. See docs/superpowers/specs/2026-10-06-site-report-generation-design.md.
alter table public.subsection_documents
  add column if not exists source_inspection_id uuid
    references public.inspections(id) on delete set null;

create index if not exists subsection_documents_source_inspection_idx
  on public.subsection_documents (source_inspection_id);
