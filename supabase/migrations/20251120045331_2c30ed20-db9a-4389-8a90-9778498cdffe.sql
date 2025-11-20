-- Add DELETE policies for contractors and clients on subsection_documents table
-- This allows them to delete documents they can access, not just view them

-- Policy for Contractors to delete documents for their assigned sites
CREATE POLICY "Contractors can delete subsection documents for their sites"
ON subsection_documents
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND subsection_id IN (
    SELECT s.id
    FROM subsections s
    JOIN user_sites us ON us.site_id = s.site_id
    WHERE us.user_id = auth.uid()
  )
);

-- Policy for Clients to delete documents for their sites
CREATE POLICY "Clients can delete their subsection documents"
ON subsection_documents
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'Client'::app_role) 
  AND subsection_id IN (
    SELECT subsections.id
    FROM subsections
    WHERE subsections.site_id IN (
      SELECT sites.id
      FROM sites
      WHERE sites.client_id = get_user_client_id()
    )
  )
);

-- Also add INSERT policies so they can upload documents
CREATE POLICY "Contractors can upload subsection documents for their sites"
ON subsection_documents
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND subsection_id IN (
    SELECT s.id
    FROM subsections s
    JOIN user_sites us ON us.site_id = s.site_id
    WHERE us.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can upload their subsection documents"
ON subsection_documents
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'Client'::app_role) 
  AND subsection_id IN (
    SELECT subsections.id
    FROM subsections
    WHERE subsections.site_id IN (
      SELECT sites.id
      FROM sites
      WHERE sites.client_id = get_user_client_id()
    )
  )
);