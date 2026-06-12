-- ============================================================================
-- Fortress layer — RLS hardening (security review · addresses G-SEC-13)
-- ----------------------------------------------------------------------------
-- The base migration shipped every Fortress table with a blanket
--   "auth_read_*"  SELECT TO authenticated USING (true)
-- policy. That lets ANY authenticated user (including Client- and Contractor-
-- role portal users) read EVERY building's assets, tenants, trading, incidents,
-- etc. — cross-tenant data exposure.
--
-- This migration replaces the blanket SELECT with a membership-scoped policy
-- that mirrors the existing `sites` posture:
--   * Admin / User           → full read (back-office)
--   * Contractor             → only sites in user_sites
--   * Client                 → only sites under their client (get_user_client_id())
-- Writes ("manage_*") remain Admin/User only (unchanged).
--
-- Uses (select auth.uid()) so the planner evaluates it once per query (SV-3).
-- Idempotent · reversible (see .down.sql) · depends on …200000.
-- Pre-audit: confirm public.get_user_client_id() and public.user_sites exist
-- (they back the existing sites policies) before applying.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_user_client_id') THEN
    RAISE EXCEPTION 'get_user_client_id() not found — required by client-scoped policy.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='user_sites') THEN
    RAISE EXCEPTION 'public.user_sites not found — required by contractor-scoped policy.';
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'building_assets','ppm_tasks','ohs_compliance_items','building_condition_items',
    'utilities_readings','tenants','tenant_shop_specs','tenant_trading',
    'tenant_movements','security_incidents','masterfile_index','expense_recoveries'
  ] LOOP
    -- drop the blanket read
    EXECUTE format('DROP POLICY IF EXISTS "auth_read_%1$s" ON public.%1$s;', t);

    -- membership-scoped read (all 12 tables carry site_id)
    EXECUTE format($f$
      CREATE POLICY "scoped_read_%1$s" ON public.%1$s
        FOR SELECT TO authenticated
        USING (
          public.has_role((select auth.uid()), 'Admin'::app_role)
          OR public.has_role((select auth.uid()), 'User'::app_role)
          OR (
            public.has_role((select auth.uid()), 'Contractor'::app_role)
            AND site_id IN (SELECT site_id FROM public.user_sites WHERE user_id = (select auth.uid()))
          )
          OR (
            public.has_role((select auth.uid()), 'Client'::app_role)
            AND site_id IN (SELECT id FROM public.sites WHERE client_id = public.get_user_client_id())
          )
        );
    $f$, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
