-- Add report_data column to store comprehensive validation reports
ALTER TABLE public.coc_validations
ADD COLUMN IF NOT EXISTS report_data jsonb DEFAULT NULL;

COMMENT ON COLUMN public.coc_validations.report_data IS 'Stores the complete validation report including administrative details, technical evaluation, and recommendations';