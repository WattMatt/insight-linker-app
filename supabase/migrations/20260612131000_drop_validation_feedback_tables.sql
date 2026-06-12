-- Drop the COC-validation feedback loop tables. These belonged to the removed validation
-- engine (validation_id referenced coc_validations, dropped in 20260612130000). The
-- ValidationFeedback view + /validation-feedback route + sidebar entry were removed too.
DROP TABLE IF EXISTS public.validation_feedback       CASCADE;
DROP TABLE IF EXISTS public.validation_conversations  CASCADE;
DROP TABLE IF EXISTS public.validation_messages       CASCADE;
NOTIFY pgrst, 'reload schema';
