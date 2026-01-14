-- Fix COC type and status CHECK constraints to allow all valid values
-- This fixes the issue where COC type was being reset because the constraint rejected valid values

-- Drop old constraints
ALTER TABLE subsection_documents DROP CONSTRAINT IF EXISTS subsection_documents_coc_type_check;
ALTER TABLE subsection_documents DROP CONSTRAINT IF EXISTS subsection_documents_coc_status_check;

-- Add updated coc_type constraint with all valid types (both cases for compatibility)
ALTER TABLE subsection_documents 
ADD CONSTRAINT subsection_documents_coc_type_check 
CHECK (coc_type IS NULL OR coc_type = ANY (ARRAY[
  'Initial', 'Supplementary', 'Temporary', 'Not Marked',
  'initial', 'supplementary', 'temporary', 'not marked'
]));

-- Add updated coc_status constraint with all valid statuses
ALTER TABLE subsection_documents 
ADD CONSTRAINT subsection_documents_coc_status_check 
CHECK (coc_status IS NULL OR coc_status = ANY (ARRAY[
  'pending', 'approved', 'rejected',
  'Approved', 'Failed', 'Pending', 'Rejected'
]));