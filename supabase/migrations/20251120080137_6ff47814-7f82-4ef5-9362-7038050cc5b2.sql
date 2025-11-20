-- Fix document upload RLS by simplifying to allow ALL authenticated users
-- Remove duplicate and overly complex policies

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can upload subsection documents" ON subsection_documents;
DROP POLICY IF EXISTS "Contractors can upload subsection documents for their sites" ON subsection_documents;

-- Create simple policy: any authenticated user can upload
CREATE POLICY "Any authenticated user can upload documents"
ON subsection_documents
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Also simplify the delete policy
DROP POLICY IF EXISTS "Users can delete their uploaded documents" ON subsection_documents;
DROP POLICY IF EXISTS "Contractors can delete subsection documents for their sites" ON subsection_documents;

CREATE POLICY "Authenticated users can delete documents"
ON subsection_documents
FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'Admin'::app_role)
    OR uploaded_by = auth.uid()
  )
);