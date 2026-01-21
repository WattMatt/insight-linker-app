-- Add calibration fields to site_schematics
ALTER TABLE public.site_schematics 
ADD COLUMN IF NOT EXISTS calibrated_width numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS calibrated_height numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_calibrated boolean DEFAULT false;