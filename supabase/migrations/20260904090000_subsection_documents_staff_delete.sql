-- =============================================================================
-- subsection_documents: let STAFF delete generated reports
-- =============================================================================
-- Why
--   The site Reports tab now lists per-subsection reports (every bulk inspection
--   report lands in subsection_documents). The live DELETE policy on that table
--   ("Authenticated users can delete documents", 20251120080137) only permits
--   Admin or `uploaded_by = auth.uid()`, and generated report rows were inserted
--   with uploaded_by NULL — so a staff member with the default 'User' role could
--   not delete them. (The app-side delete now verifies a row was actually
--   removed before touching storage, so this was never data-destructive after
--   41e4cb6's follow-up; it was simply refused.)
--
--   site_documents already grants the 'User' role FOR ALL
--   ("Users can manage all site documents", 20251120111033). This brings
--   subsection_documents DELETE in line with the staff pattern used for the
--   documents bucket ("Staff can manage documents", 20260806090000): anyone who
--   is neither a Client nor a Contractor.
--
-- What stays
--   The existing Admin / uploader policy remains; this policy is additive
--   (Postgres ORs permissive policies). Client and Contractor deletes are
--   unaffected.
--
-- Verify (prod, via the management query endpoint)
--   select policyname, cmd from pg_policies
--    where tablename = 'subsection_documents' and cmd = 'DELETE';
--   -- expect: "Authenticated users can delete documents", "Staff can delete subsection documents"
-- =============================================================================

DROP POLICY IF EXISTS "Staff can delete subsection documents" ON public.subsection_documents;

CREATE POLICY "Staff can delete subsection documents"
ON public.subsection_documents
FOR DELETE
TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'Client'::app_role)
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
);
