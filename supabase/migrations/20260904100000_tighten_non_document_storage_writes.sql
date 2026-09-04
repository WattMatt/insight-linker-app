-- =============================================================================
-- Tighten WRITE access on non-document storage buckets
-- =============================================================================
-- Before: three blanket policies (20260611110000) let ANY authenticated user
-- INSERT / UPDATE / DELETE in every non-document bucket:
--   "authenticated upload non-document storage"  WITH CHECK (bucket_id <> 'documents')
--   "authenticated update non-document storage"  USING/CHECK (bucket_id <> 'documents')
--   "authenticated delete non-document storage"  USING (bucket_id <> 'documents')
-- So a Client or Contractor could overwrite the company logo, a client logo, or
-- another site's image. The admin-only gate on the image-repair tool was
-- therefore convenience, not a boundary.
--
-- After (READ access is unchanged — "Anyone can view non-document storage" stays):
--   * Branding / site assets (company-logos, client-logos, site-images):
--       staff only (Admin or User; never Client/Contractor).
--   * profile-images: the owner (folder = their uid) OR staff — so a user still
--       manages their own avatar and the repair tool (admin) can fix any.
--   * Operational / user-submitted buckets (inspection-photos, coc-photos,
--       issue-screenshots, suggestion-screenshots): UNCHANGED, any authenticated
--       user. Field photo paths are keyed by subsection/inspection, not by
--       site, so they cannot be site-scoped by foldername without a path
--       migration; these uploads legitimately come from every role. The
--       `reports` bucket keeps its own owner-scoped policies.
--
-- Verify (prod, via the management query endpoint), evaluating the predicates
-- under set-local JWT claims for a staff, a contractor and an owner:
--   staff  -> company-logos write = true ; contractor -> company-logos write = false
--   owner  -> own profile write   = true ; non-owner non-staff -> false
-- =============================================================================

DROP POLICY IF EXISTS "authenticated upload non-document storage" ON storage.objects;
DROP POLICY IF EXISTS "authenticated update non-document storage" ON storage.objects;
DROP POLICY IF EXISTS "authenticated delete non-document storage" ON storage.objects;

-- ── Operational + user-submitted buckets: keep broad authenticated write ─────
CREATE POLICY "authenticated write operational storage (insert)"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('inspection-photos','coc-photos','issue-screenshots','suggestion-screenshots'));
CREATE POLICY "authenticated write operational storage (update)"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('inspection-photos','coc-photos','issue-screenshots','suggestion-screenshots'))
  WITH CHECK (bucket_id IN ('inspection-photos','coc-photos','issue-screenshots','suggestion-screenshots'));
CREATE POLICY "authenticated write operational storage (delete)"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('inspection-photos','coc-photos','issue-screenshots','suggestion-screenshots'));

-- ── Branding / site assets: staff only ──────────────────────────────────────
CREATE POLICY "staff write branding storage (insert)"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('company-logos','client-logos','site-images')
    AND NOT public.has_role(auth.uid(), 'Client'::app_role)
    AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  );
CREATE POLICY "staff write branding storage (update)"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('company-logos','client-logos','site-images')
    AND NOT public.has_role(auth.uid(), 'Client'::app_role)
    AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  )
  WITH CHECK (
    bucket_id IN ('company-logos','client-logos','site-images')
    AND NOT public.has_role(auth.uid(), 'Client'::app_role)
    AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  );
CREATE POLICY "staff write branding storage (delete)"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('company-logos','client-logos','site-images')
    AND NOT public.has_role(auth.uid(), 'Client'::app_role)
    AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  );

-- ── profile-images: the owner (folder = uid) OR staff ───────────────────────
CREATE POLICY "own or staff write profile images (insert)"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (NOT public.has_role(auth.uid(), 'Client'::app_role) AND NOT public.has_role(auth.uid(), 'Contractor'::app_role))
    )
  );
CREATE POLICY "own or staff write profile images (update)"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (NOT public.has_role(auth.uid(), 'Client'::app_role) AND NOT public.has_role(auth.uid(), 'Contractor'::app_role))
    )
  )
  WITH CHECK (
    bucket_id = 'profile-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (NOT public.has_role(auth.uid(), 'Client'::app_role) AND NOT public.has_role(auth.uid(), 'Contractor'::app_role))
    )
  );
CREATE POLICY "own or staff write profile images (delete)"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (NOT public.has_role(auth.uid(), 'Client'::app_role) AND NOT public.has_role(auth.uid(), 'Contractor'::app_role))
    )
  );
