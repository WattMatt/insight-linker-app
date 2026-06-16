-- Per-subsection "thermal/infrared report required" flag.
--
-- Thermal reports live in subsection_documents (a site never holds one of its own), so the
-- per-site deliverables checklist tracks thermal PER SUBSECTION, required only where flagged.
-- Mirrors is_coc_required. Backfill marks subsections that already have a thermal/infrared
-- document as required — they are evidently applicable, and will read as complete immediately.
ALTER TABLE public.subsections
  ADD COLUMN IF NOT EXISTS is_thermal_required boolean NOT NULL DEFAULT false;

UPDATE public.subsections s SET is_thermal_required = true
WHERE s.is_thermal_required = false
  AND EXISTS (
    SELECT 1 FROM public.subsection_documents d
    JOIN public.document_categories c ON c.id = d.category_id
    WHERE d.subsection_id = s.id
      AND c.name ~* 'thermal|thermo|infrared|thermograph'
  );

NOTIFY pgrst, 'reload schema';
