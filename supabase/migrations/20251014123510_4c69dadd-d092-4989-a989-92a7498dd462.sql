-- Add subsections table to reflect the hierarchy: Client -> Site -> Subsection -> Inspection
-- Subsections are like electrical boards/panels within a site

CREATE TABLE IF NOT EXISTS public.subsections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- e.g., "EE" for Electrical Engineering
  coc_status TEXT DEFAULT 'Missing', -- Certificate of Compliance status
  metering_status TEXT DEFAULT 'Missing',
  is_coc_required BOOLEAN DEFAULT true,
  is_compliant BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subsections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subsections
CREATE POLICY "Authenticated users can view subsections"
ON public.subsections
FOR SELECT
TO authenticated
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can create subsections"
ON public.subsections
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can update subsections"
ON public.subsections
FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can delete subsections"
ON public.subsections
FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated'::text);

-- Add subsection_id to inspections table to link inspections to subsections
ALTER TABLE public.inspections 
ADD COLUMN IF NOT EXISTS subsection_id UUID REFERENCES public.subsections(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_subsections_site_id ON public.subsections(site_id);
CREATE INDEX IF NOT EXISTS idx_inspections_subsection_id ON public.inspections(subsection_id);

-- Trigger for updated_at
CREATE TRIGGER update_subsections_updated_at
BEFORE UPDATE ON public.subsections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();