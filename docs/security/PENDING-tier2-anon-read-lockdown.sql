-- ============================================================================
-- PENDING — DO NOT APPLY YET.  Tier 2: close anonymous full-dataset READ.
-- ============================================================================
-- This is intentionally OUTSIDE supabase/migrations/ so it is NOT auto-applied.
--
-- PREREQUISITE (or your actively-used QR codes break):
--   1. Ship the `get_public_subsection(subsection_id)` SECURITY DEFINER RPC.
--   2. Repoint src/pages/PublicSubsection.tsx to call that RPC instead of
--      reading subsections/snags/coc_validations/document_categories directly.
--   3. Verify a QR scan still renders the public subsection view.
-- THEN move this into supabase/migrations/ (or paste into the SQL editor).
--
-- Demotes every anon/public USING(true) SELECT policy to authenticated-only.
-- Scans ALL public tables (no hardcoded list). Excludes `settings` (login
-- branding). Atomic + idempotent.
-- ============================================================================

BEGIN;
DO $$
DECLARE t record; p record;
BEGIN
  FOR t IN
    SELECT DISTINCT tablename FROM pg_policies
    WHERE schemaname='public' AND cmd='SELECT' AND qual='true'
      AND (roles='{public}' OR 'anon'=ANY(roles))
      AND tablename NOT IN ('settings')
  LOOP
    FOR p IN
      SELECT polname FROM pg_policies
      WHERE schemaname='public' AND tablename=t.tablename AND cmd='SELECT' AND qual='true'
        AND (roles='{public}' OR 'anon'=ANY(roles))
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.polname, t.tablename);
      RAISE NOTICE 'Removed anon SELECT policy "%" on %', p.polname, t.tablename;
    END LOOP;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_read_'||t.tablename, t.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
                   'auth_read_'||t.tablename, t.tablename);
  END LOOP;
END $$;
COMMIT;

-- POST-APPLY VERIFICATION (expect ZERO rows):
--   SELECT tablename, polname FROM pg_policies
--   WHERE schemaname='public' AND cmd='SELECT' AND qual='true'
--     AND (roles='{public}' OR 'anon'=ANY(roles)) AND tablename <> 'settings';
