
-- Table for local COC validation records (strict empirical engine)
CREATE TABLE public.coc_local_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  coc_reference_number text NOT NULL,
  certificate_type text NOT NULL,
  installation_address text NOT NULL,
  registered_person_name text NOT NULL,
  registration_number text NOT NULL,
  registration_category text NOT NULL,
  date_of_issue date NOT NULL,
  installation_type text NOT NULL,
  phase_configuration text NOT NULL,
  supply_voltage numeric NOT NULL DEFAULT 230,
  supply_frequency numeric NOT NULL DEFAULT 50,
  insulation_resistance numeric,
  earth_loop_impedance numeric,
  rcd_trip_time numeric,
  rcd_rated_current numeric NOT NULL DEFAULT 30,
  pscc numeric,
  earth_continuity numeric,
  voltage_at_main_db numeric,
  polarity_correct boolean NOT NULL DEFAULT false,
  has_signature boolean NOT NULL DEFAULT false,
  signature_date date,
  has_solar_pv boolean NOT NULL DEFAULT false,
  has_bess boolean NOT NULL DEFAULT false,
  solar_grounding_verified boolean,
  inverter_sync_verified boolean,
  bess_fire_protection boolean,
  spd_operational boolean,
  afdd_installed boolean,
  validation_status text NOT NULL DEFAULT 'INVALID',
  fraud_risk_score text NOT NULL DEFAULT 'LOW',
  validation_results_json jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coc_local_validations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all COC local validations"
  ON public.coc_local_validations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Users can manage all COC local validations"
  ON public.coc_local_validations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'User'::app_role));

CREATE POLICY "Contractors can view COC local validations for assigned sites"
  ON public.coc_local_validations FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Contractor'::app_role) 
    AND site_id IN (SELECT us.site_id FROM public.user_sites us WHERE us.user_id = auth.uid())
  );

CREATE POLICY "Users can view own COC local validations"
  ON public.coc_local_validations FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Auto-update updated_at
CREATE TRIGGER update_coc_local_validations_updated_at
  BEFORE UPDATE ON public.coc_local_validations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
