-- Drop the COC auto-validation engine tables outright (no snapshot — decision #3).
-- The validation engine (validate-coc/extract-coc + review UI) was removed; COC is now a
-- manual per-subsection verdict in subsections.coc_status. Nothing reads these tables.
DROP TABLE IF EXISTS public.coc_validations                     CASCADE;
DROP TABLE IF EXISTS public.coc_extractions                     CASCADE;
DROP TABLE IF EXISTS public.coc_validation_settings             CASCADE;
DROP TABLE IF EXISTS public.coc_local_validations              CASCADE;
DROP TABLE IF EXISTS public.coc_compliance_photos               CASCADE;
DROP TABLE IF EXISTS public.coc_compliance_photos_snap_20260421 CASCADE;
NOTIFY pgrst, 'reload schema';
-- Kept: contractor_coc_uploads (manual upload target, anon-locked per G-SEC-11).
