-- Add rectification photo support to floor_plan_pins
ALTER TABLE public.floor_plan_pins 
ADD COLUMN IF NOT EXISTS rectification_photo_url TEXT,
ADD COLUMN IF NOT EXISTS rectification_notes TEXT,
ADD COLUMN IF NOT EXISTS rectified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rectified_by TEXT;

-- Add rectification photo support to snags table
ALTER TABLE public.snags 
ADD COLUMN IF NOT EXISTS rectification_photos JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS rectification_notes TEXT,
ADD COLUMN IF NOT EXISTS rectified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rectified_by TEXT;