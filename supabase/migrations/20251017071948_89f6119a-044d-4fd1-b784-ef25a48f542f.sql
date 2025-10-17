-- Add tenants column to inspection_templates table
ALTER TABLE public.inspection_templates 
ADD COLUMN IF NOT EXISTS tenants jsonb DEFAULT NULL;

-- Add comment to describe the column
COMMENT ON COLUMN public.inspection_templates.tenants IS 'Array of tenant information including shop details, breaker info, and CT ratio data';