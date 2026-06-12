-- ============================================================================
-- Fortress Building Report Pack — property/facilities-management layer
-- ----------------------------------------------------------------------------
-- Adds the building-operations data model that the three Fortress report types
-- (OPS monthly, CM monthly, Annual inspection) and the per-building dashboard
-- are generated from. Everything hangs off the existing public.sites table.
--
-- Conventions matched from existing migrations:
--   * gen_random_uuid() PKs, timestamptz created_at/updated_at default now()
--   * RLS enabled; authenticated SELECT; Admin/User manage via public.has_role()
--   * public.update_updated_at_column() BEFORE UPDATE triggers
--   * status/enum-like fields use CHECK constraints (as snags/coc do)
--
-- Depends on (already in schema): public.sites, public.clients,
--   public.app_role, public.has_role(uuid, app_role),
--   public.update_updated_at_column().
--
-- Reviewed-not-applied: this migration has NOT been run against the live DB.
-- Pre-audit live sites/subsections/snags schemas before applying.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Building profile fields on sites (building identity header)
-- ----------------------------------------------------------------------------
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS gla_m2            numeric,
  ADD COLUMN IF NOT EXISTS vacancy_m2        numeric,
  ADD COLUMN IF NOT EXISTS parking_bays      integer,
  ADD COLUMN IF NOT EXISTS taxi_bays         integer,
  ADD COLUMN IF NOT EXISTS disabled_bays     integer,
  ADD COLUMN IF NOT EXISTS tenant_count      integer,
  ADD COLUMN IF NOT EXISTS national_tenants  integer,
  ADD COLUMN IF NOT EXISTS anchor_tenants    text,
  ADD COLUMN IF NOT EXISTS asset_manager     text,
  ADD COLUMN IF NOT EXISTS ops_manager       text,
  ADD COLUMN IF NOT EXISTS centre_manager    text,
  ADD COLUMN IF NOT EXISTS completion_date   date,
  ADD COLUMN IF NOT EXISTS property_fund     text;

COMMENT ON COLUMN public.sites.gla_m2 IS 'Gross lettable area (m2) — Fortress building profile';
COMMENT ON COLUMN public.sites.anchor_tenants IS 'Comma-separated anchor tenant names';

-- ----------------------------------------------------------------------------
-- Helper: shared RLS policy shape applied to every new table below.
--   SELECT  -> any authenticated user
--   ALL     -> Admin or User (manage)
-- (Tenant-scoped narrowing tracked separately as GAPS G-SEC-13; out of scope.)
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 1. building_assets — the spine (Annual report §4–28)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.building_assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id            uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  section_code       text,                       -- e.g. '4.1', '6.4' (Annual report section)
  category           text NOT NULL,              -- Fire / Electrical / HVAC / Security / Fabric ...
  name               text NOT NULL,
  make_model         text,
  quantity           text,
  install_date       text,
  service_freq       text,
  last_service       text,
  next_service_due   text,
  service_cost       numeric,
  contractor         text,
  cost_recovery      text,                       -- 'OPS cost' / 'Tenant' / 'Tenant + OPS'
  condition          text CHECK (condition IN ('Good','Fair','Poor','N/A')),
  as_built_available boolean,
  inspection_freq    text,                       -- Daily / Weekly / Monthly
  general_comment    text,
  meta               jsonb DEFAULT '{}'::jsonb,  -- system-specific extras (run-hours, panel counts…)
  created_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_building_assets_site     ON public.building_assets(site_id);
CREATE INDEX IF NOT EXISTS idx_building_assets_category ON public.building_assets(category);
COMMENT ON TABLE public.building_assets IS 'Building asset & equipment register — source for Annual report and PPM/service KPIs.';

-- ============================================================================
-- 2. ppm_tasks — planned preventative maintenance (OPS "PPM")
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ppm_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  asset_id        uuid REFERENCES public.building_assets(id) ON DELETE SET NULL,
  service_type    text NOT NULL,
  scheduled_month date,
  status          text NOT NULL DEFAULT 'due'
                    CHECK (status IN ('due','done','missed','na')),
  cost            numeric,
  certificate_url text,
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ppm_tasks_site  ON public.ppm_tasks(site_id);
CREATE INDEX IF NOT EXISTS idx_ppm_tasks_month ON public.ppm_tasks(scheduled_month);
COMMENT ON TABLE public.ppm_tasks IS 'Planned preventative maintenance schedule grid (OPS PPM sheet).';

-- ============================================================================
-- 3. ohs_compliance_items — OHS Act compliance (OPS "OHS Act Report")
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ohs_compliance_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  period       date,                              -- reporting month
  section      text,                              -- '1 Building Compliance', '2 Critical Equipment'...
  item_code    text,                              -- '1.1.1', '2.1.4' ...
  question     text NOT NULL,
  answer       text CHECK (answer IN ('Y','N','N/A')),
  weight       numeric DEFAULT 1,
  evidence_url text,
  comment      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ohs_items_site   ON public.ohs_compliance_items(site_id);
CREATE INDEX IF NOT EXISTS idx_ohs_items_period ON public.ohs_compliance_items(period);
COMMENT ON TABLE public.ohs_compliance_items IS 'OHS Act compliance checklist; weighted rollup -> building compliance %.';

-- ============================================================================
-- 4. building_condition_items — condition audit (OPS Building Inspection,
--    Annual §10–17). May be folded into inspection_items in prod (Decision D4).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.building_condition_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  inspected_on  date,
  inspector     text,
  area          text,                             -- STRUCTURE / ROOF / ELECTRICAL ...
  element       text NOT NULL,                    -- 'Covering', 'Road markings' ...
  acceptable    text CHECK (acceptable IN ('Y','N','N/A')),
  action_level  text CHECK (action_level IN ('none','3_months','immediate')),
  condition     text CHECK (condition IN ('Good','Fair','Poor','N/A')),
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cond_items_site ON public.building_condition_items(site_id);
COMMENT ON TABLE public.building_condition_items IS 'Building-fabric condition audit (Good/Fair/Poor + action timeframe).';

-- ============================================================================
-- 5. utilities_readings — utilities reconciliation (OPS "Utilities", CM Page 3)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.utilities_readings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  period            date NOT NULL,
  -- water
  water_council_bulk    numeric,
  water_bulk_check      numeric,
  water_site_daily      numeric,
  water_common_area_pct numeric,
  water_tenant_pct      numeric,
  water_unmetered_pct   numeric,
  water_night_usage_kl  numeric,
  borehole_actual_kl    numeric,
  borehole_predicted_kl numeric,
  -- electrical / solar
  elec_council_bulk     numeric,
  elec_bulk_check       numeric,
  solar_predicted_kwh   numeric,
  solar_actual_kwh      numeric,
  -- resilience
  loadshed_hours        numeric,
  diesel_litres         numeric,
  comment               text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_utilities_site_period ON public.utilities_readings(site_id, period);
COMMENT ON TABLE public.utilities_readings IS 'Monthly utilities reconciliation: water balance, solar/borehole yield, loadshedding.';

-- ============================================================================
-- 6. tenants — first-class tenant register (CM "OHS & HK")
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  shop_no         text,
  name            text NOT NULL,
  gla             numeric,
  category        text,                            -- Anchor / Line / Food / ATM / Bank ...
  is_anchor       boolean DEFAULT false,
  occupancy_cert  text,
  coc_date        text,
  hvac_responsibility text,                         -- LL / Tenant
  hvac_service_current boolean,
  fire_equipment_ok    boolean,
  evac_displayed       boolean,
  flammable_cert       text,                        -- food/gas tenants
  lease_clause         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenants_site ON public.tenants(site_id);
COMMENT ON TABLE public.tenants IS 'Per-tenant register + OHS/compliance flags (CM OHS & HK sheet).';

-- ============================================================================
-- 7. tenant_shop_specs — physical shop spec (CM "Shop Spec")
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_shop_specs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id             uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  db_phase            text,                         -- '1 - Single' / '3 - Three'
  amps_actual         text,
  amps_lease          text,
  generator_connected text,                         -- Yes / No
  hvac                text,
  hvac_btu            text,
  lighting            text,
  shopfront           text,
  roller_shutter      text,
  ceiling             text,
  floor_finish        text,
  walls               text,
  plumbing            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_specs_tenant ON public.tenant_shop_specs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_specs_site   ON public.tenant_shop_specs(site_id);
COMMENT ON TABLE public.tenant_shop_specs IS 'Physical shop specification per tenant (CM Shop Spec sheet).';

-- ============================================================================
-- 8. tenant_trading — commercial performance (CM "Page 2") — import-only (D5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_trading (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  tenant_id       uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  period          date,
  tenant_name     text,
  rank_band       text,                             -- 'anchor' / 'top5' / 'bottom5' / 'building'
  turnover        numeric,
  trading_density numeric,
  coo             numeric,                          -- cost of occupancy ratio
  annual_growth   numeric,
  footcount       numeric,
  arrears         numeric,
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trading_site ON public.tenant_trading(site_id);
COMMENT ON TABLE public.tenant_trading IS 'Trading/turnover/density/COO (CM Page 2). Import-only in v1 (Decision D5).';

-- ============================================================================
-- 9. tenant_movements — leasing churn (CM "Tenant Movement")
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  tenant_name   text NOT NULL,
  movement_type text CHECK (movement_type IN ('New','Vacate')),
  vacate_date          text,
  prelim_inspection    text,
  takeon_takeback_date text,
  first_trade_date     text,
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_movements_site ON public.tenant_movements(site_id);
COMMENT ON TABLE public.tenant_movements IS 'Tenant take-on / take-back movements (CM Tenant Movement).';

-- ============================================================================
-- 10. security_incidents — centre incidents (CM "Centre Incidents")
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.security_incidents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  period      date NOT NULL,                        -- month
  month_label text,
  category    text,
  count       integer DEFAULT 0,
  narrative   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidents_site   ON public.security_incidents(site_id);
CREATE INDEX IF NOT EXISTS idx_incidents_period ON public.security_incidents(period);
COMMENT ON TABLE public.security_incidents IS 'Monthly centre security incidents by category (CM Centre Incidents).';

-- ============================================================================
-- 11. masterfile_index — controlled document register (OPS "Masterfile index")
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.masterfile_index (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  doc_type    text NOT NULL,
  on_file     boolean,
  responsible text,
  comment     text,
  file_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_masterfile_site ON public.masterfile_index(site_id);
COMMENT ON TABLE public.masterfile_index IS 'Building masterfile / controlled-document checklist (OPS Masterfile).';

-- ============================================================================
-- 12. expense_recoveries — contractual recoveries (OPS "Expense Recoveries")
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.expense_recoveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  period        date,
  service       text NOT NULL,
  ytd_expense   numeric,
  ytd_recovery  numeric,
  recovery_pct  numeric,
  budget_pct    numeric,
  fault_reported text,
  fault_repaired text,
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recoveries_site ON public.expense_recoveries(site_id);
COMMENT ON TABLE public.expense_recoveries IS 'Contractual expense vs recovery per service (OPS Expense Recoveries).';

-- ============================================================================
-- updated_at triggers
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'building_assets','ppm_tasks','ohs_compliance_items','building_condition_items',
    'utilities_readings','tenants','tenant_shop_specs','tenant_trading',
    'tenant_movements','security_incidents','masterfile_index','expense_recoveries'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
       CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s
       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t);
  END LOOP;
END $$;

-- ============================================================================
-- RLS — authenticated read; Admin/User manage (consistent with sites posture)
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'building_assets','ppm_tasks','ohs_compliance_items','building_condition_items',
    'utilities_readings','tenants','tenant_shop_specs','tenant_trading',
    'tenant_movements','security_incidents','masterfile_index','expense_recoveries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format($f$
      DROP POLICY IF EXISTS "auth_read_%1$s" ON public.%1$s;
      CREATE POLICY "auth_read_%1$s" ON public.%1$s
        FOR SELECT TO authenticated USING (true);
    $f$, t);

    EXECUTE format($f$
      DROP POLICY IF EXISTS "manage_%1$s" ON public.%1$s;
      CREATE POLICY "manage_%1$s" ON public.%1$s
        FOR ALL TO authenticated
        USING  (public.has_role(auth.uid(), 'Admin'::app_role)
             OR public.has_role(auth.uid(), 'User'::app_role))
        WITH CHECK (public.has_role(auth.uid(), 'Admin'::app_role)
             OR public.has_role(auth.uid(), 'User'::app_role));
    $f$, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
