-- ============================================================================
-- DOWN — reverts Fortress RLS to the base blanket read (…200000 posture).
-- NOTE: reverting RE-OPENS cross-tenant read. Only roll back in non-prod.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'building_assets','ppm_tasks','ohs_compliance_items','building_condition_items',
    'utilities_readings','tenants','tenant_shop_specs','tenant_trading',
    'tenant_movements','security_incidents','masterfile_index','expense_recoveries'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "scoped_read_%1$s" ON public.%1$s;', t);
    EXECUTE format($f$
      CREATE POLICY "auth_read_%1$s" ON public.%1$s
        FOR SELECT TO authenticated USING (true);
    $f$, t);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
