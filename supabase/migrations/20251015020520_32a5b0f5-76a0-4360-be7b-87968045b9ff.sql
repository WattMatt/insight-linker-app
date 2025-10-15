-- Add inspection_template_id to subsections table
ALTER TABLE public.subsections 
ADD COLUMN inspection_template_id uuid REFERENCES public.inspection_templates(id);

-- Create index for better query performance
CREATE INDEX idx_subsections_template_id ON public.subsections(inspection_template_id);

-- Add comment
COMMENT ON COLUMN public.subsections.inspection_template_id IS 'Links subsection to its inspection template type';