-- Per-subsection "inspection required" flag. When false, the subsection is treated as
-- inspection-not-applicable: waived from the inspection checklist item, the inspection factor
-- of site grading/readiness, and inspection KPIs. COC / metering / snags / thermal are
-- unaffected. Mirrors is_coc_required. Default true = no behaviour change for existing rows.
ALTER TABLE public.subsections
  ADD COLUMN IF NOT EXISTS is_inspection_required boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
