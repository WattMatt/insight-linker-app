-- =============================================================================
-- 20260806090000_documents_bucket_privacy.sql
-- PDF standardization P0 (§6.1 of PDF-STANDARD-AUDIT-AND-PLAN): the `documents`
-- bucket — every generated compliance report, uploaded COC, floor plan and
-- schematic — has been PUBLIC since 20251120081347/20251120083541, and
-- 20251120083932's "Anyone can view all storage" SELECT policy (still live;
-- the 20260611110000 emergency lockdown removed anon WRITES only) exposes
-- every object to anonymous listing/reads via the storage API as well.
--
-- This migration:
--   1. makes the `documents` bucket private again;
--   2. rescopes the blanket storage policies so they no longer cover
--      `documents` (other buckets keep today's behaviour — narrowing them is
--      out of scope for this P0 and would break image serving app-wide);
--   3. restores fine-grained `documents` policies equivalent to
--      20251120051502, ADAPTED to the current role/visibility model:
--        - Staff (Admin OR User, i.e. NOT Client AND NOT Contractor) get full
--          access. 20251120051502 granted Admin only, but staff 'User'
--          accounts generate and save reports (pdfDocumentSaver runs as the
--          logged-in inspector), and the app's post-lockdown "Staff" policy
--          pattern (20260610120000) is (NOT Contractor AND NOT Client).
--        - Clients are scoped by public.get_user_visible_site_ids() — the
--          managing-agency-aware visibility predicate that replaced
--          get_user_client_id() site scoping in 20260805120000.
--        - Contractors are scoped by user_sites, as in 20251120051502.
--        - Both scoped roles additionally cover the `subsections/{id}/...`
--          path shape used by subsection documents (20251120051502 only
--          matched `{siteId}/...`, which silently excluded every subsection
--          document).
--
-- App-side counterpart (same branch): pdfDocumentSaver stores bare storage
-- PATHS in file_url; all consumers resolve through getDocumentSignedUrl()
-- (src/lib/documents/documentUrl.ts), which also parses legacy public-URL
-- rows. Public share-link pages (validate_access_link RPC flows) can no
-- longer fetch document BYTES anonymously — that is the intent of this P0;
-- re-enabling public-page document downloads requires a token-validating
-- edge function that mints signed URLs (follow-up, documented in the plan).
--
-- VERIFY AFTER APPLYING:
--   anon:   GET {project}/storage/v1/object/public/documents/<any-path>  → 400/403
--   anon:   POST /storage/v1/object/sign/documents/<path>               → denied
--   staff:  createSignedUrl('documents', <path>) succeeds; file loads
--   client: sees only documents under sites from get_user_visible_site_ids()
-- =============================================================================

-- ── 1. Bucket private again ──────────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- ── 2. Rescope the blanket policies away from `documents` ────────────────────
-- Current live blanket policies:
--   "Anyone can view all storage"        (20251120083932, anon+auth SELECT)
--   "authenticated upload storage"       (20260611110000)
--   "authenticated update storage"       (20260611110000)
--   "authenticated delete storage"       (20260611110000)
DROP POLICY IF EXISTS "Anyone can view all storage"        ON storage.objects;
DROP POLICY IF EXISTS "authenticated upload storage"       ON storage.objects;
DROP POLICY IF EXISTS "authenticated update storage"       ON storage.objects;
DROP POLICY IF EXISTS "authenticated delete storage"       ON storage.objects;

-- Defensive: the documents-specific blanket set from 20251120081347 was
-- already dropped by 20251120083932's drop-all loop, but drop by name in case
-- an environment applied migrations out of order.
DROP POLICY IF EXISTS "Any authenticated user can view documents"   ON storage.objects;
DROP POLICY IF EXISTS "Any authenticated user can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Any authenticated user can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Any authenticated user can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Public can view documents"                   ON storage.objects;
DROP POLICY IF EXISTS "Public can view all buckets"                 ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users full access to all buckets - SELECT" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users full access to all buckets - INSERT" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users full access to all buckets - UPDATE" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users full access to all buckets - DELETE" ON storage.objects;

-- Recreate the blanket policies for every bucket EXCEPT documents, preserving
-- today's behaviour elsewhere (inspection-photos, site-images, profile-images,
-- client-logos, coc-photos keep working exactly as before this migration).
CREATE POLICY "Anyone can view non-document storage"
ON storage.objects FOR SELECT
USING (bucket_id <> 'documents');

CREATE POLICY "authenticated upload non-document storage"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id <> 'documents');

CREATE POLICY "authenticated update non-document storage"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id <> 'documents') WITH CHECK (bucket_id <> 'documents');

CREATE POLICY "authenticated delete non-document storage"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id <> 'documents');

-- ── 3. Fine-grained `documents` policies ─────────────────────────────────────

-- Staff (Admin or User): full access. See header for why this extends
-- 20251120051502's Admin-only clause.
CREATE POLICY "Staff can manage documents"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'documents'
  AND NOT public.has_role(auth.uid(), 'Client'::app_role)
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
)
WITH CHECK (
  bucket_id = 'documents'
  AND NOT public.has_role(auth.uid(), 'Client'::app_role)
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
);

-- Clients: scoped to their visible sites (managing-agency aware), covering
-- both `{siteId}/...` and `subsections/{subsectionId}/...` path shapes.
CREATE POLICY "Clients can view documents for their sites"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_role(auth.uid(), 'Client'::app_role)
  AND (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.get_user_visible_site_ids() AS v(id)
    )
    OR (
      (storage.foldername(name))[1] = 'subsections'
      AND (storage.foldername(name))[2] IN (
        SELECT sub.id::text FROM public.subsections sub
        WHERE sub.site_id IN (SELECT public.get_user_visible_site_ids())
      )
    )
  )
);

CREATE POLICY "Clients can upload documents for their sites"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.has_role(auth.uid(), 'Client'::app_role)
  AND (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.get_user_visible_site_ids() AS v(id)
    )
    OR (
      (storage.foldername(name))[1] = 'subsections'
      AND (storage.foldername(name))[2] IN (
        SELECT sub.id::text FROM public.subsections sub
        WHERE sub.site_id IN (SELECT public.get_user_visible_site_ids())
      )
    )
  )
);

CREATE POLICY "Clients can delete documents for their sites"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_role(auth.uid(), 'Client'::app_role)
  AND (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.get_user_visible_site_ids() AS v(id)
    )
    OR (
      (storage.foldername(name))[1] = 'subsections'
      AND (storage.foldername(name))[2] IN (
        SELECT sub.id::text FROM public.subsections sub
        WHERE sub.site_id IN (SELECT public.get_user_visible_site_ids())
      )
    )
  )
);

-- Contractors: scoped to their assigned sites (user_sites), same two path
-- shapes as the Client policies.
CREATE POLICY "Contractors can view documents for their sites"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_role(auth.uid(), 'Contractor'::app_role)
  AND (
    (storage.foldername(name))[1] IN (
      SELECT us.site_id::text FROM public.user_sites us WHERE us.user_id = auth.uid()
    )
    OR (
      (storage.foldername(name))[1] = 'subsections'
      AND (storage.foldername(name))[2] IN (
        SELECT sub.id::text FROM public.subsections sub
        WHERE sub.site_id IN (SELECT us.site_id FROM public.user_sites us WHERE us.user_id = auth.uid())
      )
    )
  )
);

CREATE POLICY "Contractors can upload documents for their sites"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.has_role(auth.uid(), 'Contractor'::app_role)
  AND (
    (storage.foldername(name))[1] IN (
      SELECT us.site_id::text FROM public.user_sites us WHERE us.user_id = auth.uid()
    )
    OR (
      (storage.foldername(name))[1] = 'subsections'
      AND (storage.foldername(name))[2] IN (
        SELECT sub.id::text FROM public.subsections sub
        WHERE sub.site_id IN (SELECT us.site_id FROM public.user_sites us WHERE us.user_id = auth.uid())
      )
    )
  )
);

CREATE POLICY "Contractors can delete documents for their sites"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_role(auth.uid(), 'Contractor'::app_role)
  AND (
    (storage.foldername(name))[1] IN (
      SELECT us.site_id::text FROM public.user_sites us WHERE us.user_id = auth.uid()
    )
    OR (
      (storage.foldername(name))[1] = 'subsections'
      AND (storage.foldername(name))[2] IN (
        SELECT sub.id::text FROM public.subsections sub
        WHERE sub.site_id IN (SELECT us.site_id FROM public.user_sites us WHERE us.user_id = auth.uid())
      )
    )
  )
);
