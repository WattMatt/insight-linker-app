-- Add detected_regions column to store AI-detected rectangle coordinates
ALTER TABLE public.site_schematics
ADD COLUMN IF NOT EXISTS detected_regions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS regions_detected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS detection_status TEXT DEFAULT 'pending';

-- Add index for quick lookup of detection status
CREATE INDEX IF NOT EXISTS idx_site_schematics_detection_status ON public.site_schematics(detection_status);

COMMENT ON COLUMN public.site_schematics.detected_regions IS 'AI-detected rectangular regions with coordinates [{x, y, width, height, label?}]';
COMMENT ON COLUMN public.site_schematics.regions_detected_at IS 'Timestamp when regions were last detected';
COMMENT ON COLUMN public.site_schematics.detection_status IS 'Detection status: pending, processing, completed, failed';