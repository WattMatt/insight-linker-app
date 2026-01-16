-- Create coc_validation_settings table for storing validation configuration
CREATE TABLE public.coc_validation_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Technical Thresholds
  earth_continuity_max_ohms NUMERIC NOT NULL DEFAULT 5.0,
  insulation_resistance_min_mohms NUMERIC NOT NULL DEFAULT 0.25,
  rcd_trip_1x_max_ms INTEGER NOT NULL DEFAULT 300,
  rcd_trip_5x_max_ms INTEGER NOT NULL DEFAULT 150,
  rcd_trip_max_ms INTEGER NOT NULL DEFAULT 40,
  coc_expiry_domestic_years INTEGER NOT NULL DEFAULT 5,
  coc_expiry_commercial_years INTEGER NOT NULL DEFAULT 2,
  ai_confidence_threshold_percent INTEGER NOT NULL DEFAULT 30,
  
  -- Validation Rules (toggles)
  hierarchy_check_enabled BOOLEAN NOT NULL DEFAULT true,
  earth_continuity_check_enabled BOOLEAN NOT NULL DEFAULT true,
  insulation_resistance_check_enabled BOOLEAN NOT NULL DEFAULT true,
  protective_conductor_check_enabled BOOLEAN NOT NULL DEFAULT true,
  certificate_date_validation_enabled BOOLEAN NOT NULL DEFAULT true,
  rcd_function_check_enabled BOOLEAN NOT NULL DEFAULT true,
  signature_check_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_fail_missing_initial_ref BOOLEAN NOT NULL DEFAULT true,
  auto_fail_invalid_certificate BOOLEAN NOT NULL DEFAULT true,
  auto_fail_future_dated BOOLEAN NOT NULL DEFAULT true,
  auto_fail_earth_resistance_threshold BOOLEAN NOT NULL DEFAULT true,
  auto_fail_missing_signature BOOLEAN NOT NULL DEFAULT true,
  
  -- Pass/Fail Status Determination
  mandatory_failures_for_fail INTEGER NOT NULL DEFAULT 2,
  safety_critical_failures_for_fail INTEGER NOT NULL DEFAULT 1,
  
  -- AI Model Settings
  ai_model TEXT NOT NULL DEFAULT 'google/gemini-3-pro-preview',
  ai_temperature NUMERIC NOT NULL DEFAULT 0.1,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.coc_validation_settings ENABLE ROW LEVEL SECURITY;

-- Allow admins to read and write settings
CREATE POLICY "Admins can manage COC validation settings"
  ON public.coc_validation_settings
  FOR ALL
  USING (public.has_role(auth.uid(), 'Admin'))
  WITH CHECK (public.has_role(auth.uid(), 'Admin'));

-- Allow all authenticated users to read settings
CREATE POLICY "Authenticated users can read COC validation settings"
  ON public.coc_validation_settings
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_coc_validation_settings_updated_at
  BEFORE UPDATE ON public.coc_validation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings row
INSERT INTO public.coc_validation_settings (id) VALUES (gen_random_uuid());