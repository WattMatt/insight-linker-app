-- Phase 1b remediation — admin-config write-side RLS lockdown
-- Extends the 2026-06-10 write lockdown (20260610120000_phase1_write_lockdown.sql)
-- to three admin-configuration tables it did not cover.
--
-- Problem:
--   These three tables are edited ONLY from views under src/app/(admin)/, which are
--   wrapped by ProtectedRoute (admits Admin/User/Moderator; redirects Contractor and
--   Client to their own portals). But their write RLS admitted ANY authenticated
--   principal, so a Client- or Contractor-role session — or, since prod public signup
--   is open (GAPS.md G-SEC-01), anyone who self-registers — could write them via the
--   REST API even though the UI bounces those roles.
--
--     * inspection_templates — "All authenticated users full access to inspection_templates"
--       is FOR ALL with USING/WITH CHECK (auth.uid() IS NOT NULL). App writers:
--       src/components/TemplateBuilder.tsx (INSERT/UPDATE), src/views/InspectionTemplates.tsx (UPDATE).
--     * settings — "Authenticated users can update settings" (UPDATE) and "Authenticated
--       users can insert settings" (INSERT) are gated only by auth.role()='authenticated'.
--       App writer: src/views/Settings.tsx (company_name, qr_base_url, branding image URLs).
--     * validation_feedback — "All authenticated users full access to validation_feedback"
--       is FOR ALL with (auth.uid() IS NOT NULL); it buries a pre-existing (now dead)
--       "Admins can update feedback" UPDATE policy. App writer: src/views/ValidationFeedback.tsx
--       (status/notes UPDATE).
--
-- Fix:
--   Apply the same "staff" boundary as phase 1 (NOT Contractor AND NOT Client), which
--   mirrors the admin-portal guard in src/components/ProtectedRoute.tsx. Tier confirmed
--   with the repo owner (2026-06-11): STAFF for all three write-sides — most staff carry
--   the default 'User' role (handle_new_user), so an Admin-only gate would block the
--   majority of legitimate staff (notably feedback triage and template/settings editing).
--
-- Scope — WRITE side only:
--   * inspection_templates: SELECT is left as-is (auth_read_inspection_templates grants
--     read to all authenticated; contractors performing inspections need to read templates).
--   * settings: BOTH SELECT policies are left untouched. "Public can view branding only"
--     (anon, USING true) MUST remain so the login page can read company branding — settings
--     is deliberately excluded from the tier-2 anon-read lockdown.
--   * validation_feedback: dropping the blanket FOR ALL restores the original narrower
--     policies — SELECT (all authenticated) and INSERT (own-row, auth.uid()=created_by) —
--     and removes the blanket's incidental DELETE grant (no app code deletes feedback).
--     The dead "Admins can update feedback" policy is replaced by a staff UPDATE policy.

-- ============================================================
-- inspection_templates  (write -> staff; read unchanged)
-- ============================================================
DROP POLICY IF EXISTS "All authenticated users full access to inspection_templates" ON public.inspection_templates;
DROP POLICY IF EXISTS "Staff manage inspection_templates" ON public.inspection_templates;

CREATE POLICY "Staff manage inspection_templates"
ON public.inspection_templates
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
-- settings  (INSERT/UPDATE -> staff; SELECT policies untouched)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can update settings" ON public.settings;
DROP POLICY IF EXISTS "Authenticated users can insert settings" ON public.settings;
DROP POLICY IF EXISTS "Staff update settings" ON public.settings;
DROP POLICY IF EXISTS "Staff insert settings" ON public.settings;

CREATE POLICY "Staff update settings"
ON public.settings
FOR UPDATE
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

CREATE POLICY "Staff insert settings"
ON public.settings
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  AND NOT public.has_role(auth.uid(), 'Client'::app_role)
);

-- ============================================================
-- validation_feedback  (UPDATE -> staff; drop blanket FOR ALL)
-- ============================================================
-- Dropping the blanket restores the original SELECT (all authenticated, USING true) and
-- INSERT (own-row, WITH CHECK auth.uid()=created_by) policies, which remain in place.
DROP POLICY IF EXISTS "All authenticated users full access to validation_feedback" ON public.validation_feedback;
DROP POLICY IF EXISTS "Admins can update feedback" ON public.validation_feedback;
DROP POLICY IF EXISTS "Staff update validation_feedback" ON public.validation_feedback;

CREATE POLICY "Staff update validation_feedback"
ON public.validation_feedback
FOR UPDATE
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

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Post-apply verification (run manually against the live DB):
--   As a Client- or Contractor-portal session (these MUST fail / 0 rows / RLS denial):
--     UPDATE public.settings SET company_name = company_name WHERE id = '<row>';
--     INSERT INTO public.inspection_templates (name) VALUES ('x');
--     UPDATE public.validation_feedback SET status = status WHERE id = '<row>';
--   As an Admin/User staff session (these MUST succeed):
--     UPDATE public.settings SET company_name = company_name WHERE id = '<row>';
--     UPDATE public.inspection_templates SET name = name WHERE id = '<row>';
--     UPDATE public.validation_feedback SET status = 'reviewed' WHERE id = '<row>';
--   As anon (login-page branding MUST still read):
--     GET /rest/v1/settings?select=company_name,company_logo_url,primary_color   -- expect 200 + row
--   Confirm effective policies:
--     SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
--      WHERE tablename IN ('inspection_templates','settings','validation_feedback') ORDER BY 1,3;
-- ============================================================

-- ============================================================
-- Rollback (manual — recreates the pre-lockdown policies):
--   DROP POLICY IF EXISTS "Staff manage inspection_templates" ON public.inspection_templates;
--   CREATE POLICY "All authenticated users full access to inspection_templates"
--     ON public.inspection_templates FOR ALL
--     USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
--
--   DROP POLICY IF EXISTS "Staff update settings" ON public.settings;
--   DROP POLICY IF EXISTS "Staff insert settings" ON public.settings;
--   CREATE POLICY "Authenticated users can update settings"
--     ON public.settings FOR UPDATE USING (auth.role() = 'authenticated');
--   CREATE POLICY "Authenticated users can insert settings"
--     ON public.settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
--
--   DROP POLICY IF EXISTS "Staff update validation_feedback" ON public.validation_feedback;
--   CREATE POLICY "Admins can update feedback"
--     ON public.validation_feedback FOR UPDATE TO authenticated
--     USING (public.has_role(auth.uid(), 'Admin'::app_role));
--   CREATE POLICY "All authenticated users full access to validation_feedback"
--     ON public.validation_feedback FOR ALL
--     USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
--   NOTIFY pgrst, 'reload schema';
-- ============================================================
