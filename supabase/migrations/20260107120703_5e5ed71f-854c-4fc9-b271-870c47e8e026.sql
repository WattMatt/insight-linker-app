-- Add fix verification columns to issue_reports table
ALTER TABLE public.issue_reports 
ADD COLUMN IF NOT EXISTS fix_description text,
ADD COLUMN IF NOT EXISTS fix_test_result jsonb,
ADD COLUMN IF NOT EXISTS fix_test_run_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS fix_confidence_score integer;

-- Add fix verification columns to suggestions table
ALTER TABLE public.suggestions 
ADD COLUMN IF NOT EXISTS fix_description text,
ADD COLUMN IF NOT EXISTS fix_test_result jsonb,
ADD COLUMN IF NOT EXISTS fix_test_run_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS fix_confidence_score integer;

-- Add comments for documentation
COMMENT ON COLUMN public.issue_reports.fix_description IS 'Description of the fix applied by admin';
COMMENT ON COLUMN public.issue_reports.fix_test_result IS 'JSON result from AI verification of the fix';
COMMENT ON COLUMN public.issue_reports.fix_test_run_at IS 'When the fix verification test was run';
COMMENT ON COLUMN public.issue_reports.fix_confidence_score IS 'AI confidence score 0-100 for the fix';

COMMENT ON COLUMN public.suggestions.fix_description IS 'Description of the implementation by admin';
COMMENT ON COLUMN public.suggestions.fix_test_result IS 'JSON result from AI verification of the implementation';
COMMENT ON COLUMN public.suggestions.fix_test_run_at IS 'When the implementation verification test was run';
COMMENT ON COLUMN public.suggestions.fix_confidence_score IS 'AI confidence score 0-100 for the implementation';