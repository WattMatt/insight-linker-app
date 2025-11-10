-- Add COC fields to subsection_documents table
ALTER TABLE subsection_documents
ADD COLUMN IF NOT EXISTS coc_number TEXT,
ADD COLUMN IF NOT EXISTS coc_issue_date DATE,
ADD COLUMN IF NOT EXISTS coc_type TEXT CHECK (coc_type IN ('initial', 'supplementary')),
ADD COLUMN IF NOT EXISTS coc_status TEXT CHECK (coc_status IN ('pending', 'approved', 'rejected'));