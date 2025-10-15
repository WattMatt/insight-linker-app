-- Add jsonData column to inspections table to store section/item data
ALTER TABLE public.inspections 
ADD COLUMN IF NOT EXISTS json_data jsonb DEFAULT '{}'::jsonb;

-- Add template_id column to link to inspection_templates
ALTER TABLE public.inspections 
ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.inspection_templates(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_inspections_template_id ON public.inspections(template_id);
CREATE INDEX IF NOT EXISTS idx_inspections_json_data ON public.inspections USING gin(json_data);