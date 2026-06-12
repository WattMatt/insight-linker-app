-- =============================================================================
-- 20260611110000_emergency_triage_lockdown.sql
-- Phase-2 emergency triage (GAPS.md G-SEC-13 quick wins + G-SEC-14). Closes the
-- worst anon/over-permissive holes WITHOUT the full RLS redesign.
--
-- NOTE ON THE "Staff" MODEL: the existing "Staff …" policies gate to
-- (authenticated AND NOT Contractor AND NOT Client) — i.e. Staff = Admin OR User.
-- Because signup is currently OPEN (G-SEC-01) and handle_new_user makes every
-- signup a 'User', a self-registered account counts as Staff. So templates/feedback
-- below are only fully protected once signup is disabled. settings is hardened to
-- Admin-only here regardless.
-- =============================================================================

-- ── G-SEC-14: storage — remove blanket anon write/delete on ALL buckets ──────
-- "Anyone can upload/update/delete to all storage" (defined 20251120083932, never
-- dropped) lets any anon caller overwrite/delete every object in every bucket.
-- No legitimate anon writes exist (uploads are authenticated or via service-role
-- edge fns). Replace with authenticated-only writes. Anon SELECT is left for now
-- (public buckets already expose reads via their public URL; making `documents`
-- private + signed-URL is the G-SEC-14 follow-up).
DROP POLICY IF EXISTS "Anyone can upload to all storage"   ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update all storage"      ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete from all storage" ON storage.objects;

CREATE POLICY "authenticated upload storage" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update storage" ON storage.objects
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete storage" ON storage.objects
  FOR DELETE TO authenticated USING (true);

-- ── G-SEC-13: settings — Admin-only writes (branding/qr_base_url = phishing risk) ─
DROP POLICY IF EXISTS "Authenticated users can insert settings" ON public.settings;
DROP POLICY IF EXISTS "Authenticated users can update settings" ON public.settings;
DROP POLICY IF EXISTS "Staff insert settings" ON public.settings;
DROP POLICY IF EXISTS "Staff update settings" ON public.settings;
CREATE POLICY "Admin insert settings" ON public.settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'Admin'::app_role));
CREATE POLICY "Admin update settings" ON public.settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'Admin'::app_role));

-- ── G-SEC-13: inspection_templates — remove Client/Contractor write (keep Staff+Admin) ─
DROP POLICY IF EXISTS "All authenticated users full access to inspection_templates" ON public.inspection_templates;
DROP POLICY IF EXISTS "Authenticated users can create templates" ON public.inspection_templates;
DROP POLICY IF EXISTS "Authenticated users can update templates" ON public.inspection_templates;
DROP POLICY IF EXISTS "Authenticated users can delete templates" ON public.inspection_templates;

-- ── G-SEC-13: validation_feedback — remove blanket full-access (keep Staff update + submitter create) ─
DROP POLICY IF EXISTS "All authenticated users full access to validation_feedback" ON public.validation_feedback;

NOTIFY pgrst, 'reload schema';

-- VERIFY AFTER APPLYING:
--   storage:  logged-in user can still upload an inspection photo; anon REST INSERT
--             to storage.objects -> denied; a public report page still loads images.
--   settings: an Admin can still save Settings; a non-Admin (User/Client/Contractor) cannot.
--   templates/feedback: a Client/Contractor cannot write; staff can. (User can until signup is closed.)
