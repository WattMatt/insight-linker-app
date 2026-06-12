-- ============================================================================
-- DOWN — reverses 20260612210000_fortress_layer_hardening.sql
-- Idempotent (IF EXISTS). Drops only what the up-migration added.
-- ============================================================================
BEGIN;

-- SV-4 · created_by
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ppm_tasks','ohs_compliance_items','building_condition_items','utilities_readings',
    'tenants','tenant_shop_specs','masterfile_index','expense_recoveries','security_incidents'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS created_by;', t);
  END LOOP;
END $$;

-- SV-5 · soft delete
DROP INDEX IF EXISTS public.idx_building_assets_live;
DROP INDEX IF EXISTS public.idx_tenants_live;
ALTER TABLE public.building_assets DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.tenants         DROP COLUMN IF EXISTS deleted_at;

-- SV-2 / SV-6 · indexes
DROP INDEX IF EXISTS public.idx_ppm_tasks_asset;
DROP INDEX IF EXISTS public.idx_trading_tenant;
DROP INDEX IF EXISTS public.idx_trading_period;
DROP INDEX IF EXISTS public.idx_recoveries_period;

-- SV-1 · parsed service date
DROP INDEX IF EXISTS public.idx_building_assets_next_service;
ALTER TABLE public.building_assets DROP COLUMN IF EXISTS next_service_date;

COMMIT;
NOTIFY pgrst, 'reload schema';
