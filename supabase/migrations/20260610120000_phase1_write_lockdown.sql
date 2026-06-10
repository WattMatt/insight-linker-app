-- Phase 1 remediation — write-side RLS lockdown
-- Closes Vulns 4 & 5 from docs/security/2026-06-10-phase1-full-app-review.md
--
-- Problem:
--   * clients / coc_validations carried `FOR ALL USING (auth.uid() IS NOT NULL)`,
--     so ANY authenticated principal — including Client-portal and Contractor-portal
--     users — could INSERT/UPDATE/DELETE any tenant's client record (PII) or any
--     compliance validation.
--   * coc_extractions carried anon-reachable write policies: INSERT allowed
--     `extracted_by IS NULL` (anon passes) and UPDATE/DELETE used existence-only
--     predicates that never referenced auth.uid() (true for anon).
--
-- Fix:
--   Replace the blanket write policies with a "staff" boundary that mirrors the
--   admin-portal guard in src/components/ProtectedRoute.tsx — that guard admits
--   any authenticated user who is NOT a Contractor and NOT a Client. We use the
--   same predicate so existing admin-portal staff (Admin / Moderator / User roles,
--   per handle_new_user's default of 'User') keep full management access, while the
--   two untrusted portal roles and anonymous callers are blocked from writing.
--
-- Scope:
--   WRITE side only. The permissive anon `FOR SELECT USING (true)` policies on these
--   tables remain in place and are handled by the (still-pending) tier-2 anon-read
--   lockdown. Authenticated reads therefore continue to work unchanged after this
--   migration (they resolve via the lingering public SELECT policy).

-- Reusable staff predicate is inlined per policy (Postgres has no macro for this).

-- ============================================================
-- clients
-- ============================================================
DROP POLICY IF EXISTS "All authenticated users full access to clients" ON public.clients;
DROP POLICY IF EXISTS "Staff manage clients" ON public.clients;

CREATE POLICY "Staff manage clients"
ON public.clients
FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  AND NOT public.has_role(auth.uid(), 'Client'::app_role)
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  AND NOT public.has_role(auth.uid(), 'Client'::app_role)
);

-- ============================================================
-- coc_validations
-- ============================================================
DROP POLICY IF EXISTS "All authenticated users full access to coc_validations" ON public.coc_validations;
DROP POLICY IF EXISTS "Staff manage coc_validations" ON public.coc_validations;

CREATE POLICY "Staff manage coc_validations"
ON public.coc_validations
FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  AND NOT public.has_role(auth.uid(), 'Client'::app_role)
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  AND NOT public.has_role(auth.uid(), 'Client'::app_role)
);

-- ============================================================
-- coc_extractions
-- ============================================================
-- The app performs NO client-side writes to this table; the extract-coc edge
-- function writes via the service_role key (bypasses RLS) and, post-hardening,
-- sets extracted_by from the verified JWT. So the only callers we must admit here
-- are staff doing manual correction; everything else (anon, Client, Contractor)
-- is denied.
DROP POLICY IF EXISTS "Users can create their own extractions" ON public.coc_extractions;
DROP POLICY IF EXISTS "Users can update extractions" ON public.coc_extractions;
DROP POLICY IF EXISTS "Users can delete extractions" ON public.coc_extractions;
DROP POLICY IF EXISTS "Staff manage coc_extractions" ON public.coc_extractions;

CREATE POLICY "Staff manage coc_extractions"
ON public.coc_extractions
FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  AND NOT public.has_role(auth.uid(), 'Client'::app_role)
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  AND NOT public.has_role(auth.uid(), 'Client'::app_role)
);

-- ============================================================
-- Post-apply verification (run manually against the live DB):
--   1. As a Client-portal session:  DELETE FROM clients WHERE id = '<any>';        -- expect 0 rows / RLS denial
--   2. With the anon key:           PATCH /rest/v1/coc_extractions?id=eq.<uuid>     -- expect 401/empty
--   3. As an Admin/User staff session: UPDATE clients SET name=name WHERE id='<own>'; -- expect success
-- ============================================================
