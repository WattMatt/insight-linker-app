-- ============================================================================
-- Fortress layer — hardening follow-up (schema-review fixes SV-1, SV-2, SV-4, SV-5)
-- ----------------------------------------------------------------------------
-- Classification : Schema change (DDL only) · Risk: LOW · Downtime: none
-- Rows affected  : 0 (Fortress tables are new/empty at this point in history)
-- Locking        : ADD COLUMN ... DEFAULT NULL is instant (PG 11+). Plain
--                  CREATE INDEX is safe here because every target table is empty.
--                  >>> If this is ever applied AFTER the Fortress tables are
--                      populated, switch the CREATE INDEX statements to
--                      CREATE INDEX CONCURRENTLY and remove the BEGIN/COMMIT
--                      wrapper (CONCURRENTLY cannot run inside a transaction).
-- Idempotent     : YES (IF NOT EXISTS throughout)
-- Reversible     : YES — see 20260612210000_fortress_layer_hardening.down.sql
-- Depends on     : 20260612200000_fortress_building_layer.sql (must run first)
-- ============================================================================

-- Pre-audit guard: fail loudly if the base migration hasn't been applied.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='building_assets') THEN
    RAISE EXCEPTION 'Base migration 20260612200000_fortress_building_layer.sql must run first.';
  END IF;
END $$;

BEGIN;

-- SV-1 · parsed service date for the "due ≤30d / overdue" KPI (text columns stay as evidence)
ALTER TABLE public.building_assets ADD COLUMN IF NOT EXISTS next_service_date date;
CREATE INDEX IF NOT EXISTS idx_building_assets_next_service
  ON public.building_assets(next_service_date);
COMMENT ON COLUMN public.building_assets.next_service_date IS
  'Parsed from next_service_due text by the importer; powers PPM due/overdue KPIs.';

-- SV-2 / SV-6 · missing FK + trend indexes
CREATE INDEX IF NOT EXISTS idx_ppm_tasks_asset   ON public.ppm_tasks(asset_id);
CREATE INDEX IF NOT EXISTS idx_trading_tenant     ON public.tenant_trading(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trading_period     ON public.tenant_trading(period);
CREATE INDEX IF NOT EXISTS idx_recoveries_period  ON public.expense_recoveries(period);

-- SV-5 · soft-delete on the editable registers (import-replace tables stay hard-delete)
ALTER TABLE public.building_assets ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.tenants         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_building_assets_live ON public.building_assets(site_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_live         ON public.tenants(site_id)         WHERE deleted_at IS NULL;

-- SV-4 · created_by audit on the captured (not import-only commercial) tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ppm_tasks','ohs_compliance_items','building_condition_items','utilities_readings',
    'tenants','tenant_shop_specs','masterfile_index','expense_recoveries','security_incidents'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);', t);
  END LOOP;
END $$;

-- Verify
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='building_assets'
                   AND column_name='next_service_date') THEN
    RAISE EXCEPTION 'Verification failed: building_assets.next_service_date missing';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verification query (run after apply):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='building_assets'
--     AND column_name IN ('next_service_date','deleted_at');
--   SELECT indexname FROM pg_indexes WHERE schemaname='public'
--     AND indexname IN ('idx_ppm_tasks_asset','idx_trading_tenant',
--                       'idx_trading_period','idx_recoveries_period');
-- ============================================================================
