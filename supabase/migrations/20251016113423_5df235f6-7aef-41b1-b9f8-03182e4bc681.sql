-- Update the status check constraint to include 'Incomplete'
ALTER TABLE public.coc_validations 
DROP CONSTRAINT IF EXISTS coc_validations_status_check;

ALTER TABLE public.coc_validations
ADD CONSTRAINT coc_validations_status_check 
CHECK (status IN ('Pass', 'Fail', 'Pending', 'Error', 'Incomplete'));