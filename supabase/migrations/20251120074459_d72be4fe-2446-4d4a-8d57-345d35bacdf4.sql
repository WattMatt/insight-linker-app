-- Fix RLS policies for subsection_documents to allow proper uploads
-- The issue is that users need Client role + user_clients mapping, but neither exists

-- Drop existing restrictive client upload policy
DROP POLICY IF EXISTS "Clients can upload their subsection documents" ON subsection_documents;

-- Create new policy that allows authenticated users to upload to subsections they can access
-- This matches the pattern used for other operations (delete, update, select)
CREATE POLICY "Authenticated users can upload subsection documents"
ON subsection_documents
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    -- Admins can upload anywhere
    has_role(auth.uid(), 'Admin'::app_role)
    -- Clients can upload to their subsections
    OR (
      has_role(auth.uid(), 'Client'::app_role) 
      AND subsection_id IN (
        SELECT s.id
        FROM subsections s
        INNER JOIN sites si ON s.site_id = si.id
        WHERE si.client_id = get_user_client_id()
      )
    )
    -- Contractors can upload to their assigned sites
    OR (
      has_role(auth.uid(), 'Contractor'::app_role)
      AND subsection_id IN (
        SELECT s.id
        FROM subsections s
        INNER JOIN user_sites us ON us.site_id = s.site_id
        WHERE us.user_id = auth.uid()
      )
    )
    -- Generic authenticated users can upload (for backwards compatibility)
    OR EXISTS (
      SELECT 1 FROM subsections s
      WHERE s.id = subsection_id
    )
  )
);

-- Also update the delete policy to match
DROP POLICY IF EXISTS "Clients can delete their subsection documents" ON subsection_documents;

CREATE POLICY "Users can delete their uploaded documents"
ON subsection_documents  
FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Admins can delete anywhere
    has_role(auth.uid(), 'Admin'::app_role)
    -- Users can delete their own uploads
    OR uploaded_by = auth.uid()
    -- Clients can delete from their subsections
    OR (
      has_role(auth.uid(), 'Client'::app_role)
      AND subsection_id IN (
        SELECT s.id
        FROM subsections s
        INNER JOIN sites si ON s.site_id = si.id
        WHERE si.client_id = get_user_client_id()
      )
    )
    -- Contractors can delete from their assigned sites
    OR (
      has_role(auth.uid(), 'Contractor'::app_role)
      AND subsection_id IN (
        SELECT s.id
        FROM subsections s
        INNER JOIN user_sites us ON us.site_id = s.site_id
        WHERE us.user_id = auth.uid()
      )
    )
  )
);