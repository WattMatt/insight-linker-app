-- Create table for storing site schematic diagrams
CREATE TABLE public.site_schematics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(site_id) -- One schematic per site
);

-- Create table for storing block-to-subsection mappings
CREATE TABLE public.schematic_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schematic_id UUID NOT NULL REFERENCES public.site_schematics(id) ON DELETE CASCADE,
  subsection_id UUID REFERENCES public.subsections(id) ON DELETE SET NULL,
  block_identifier TEXT NOT NULL, -- e.g., "DB-001", "DB-050"
  block_name TEXT, -- e.g., "SHOPRITE", "KFC"
  x_position NUMERIC NOT NULL,
  y_position NUMERIC NOT NULL,
  width NUMERIC DEFAULT 120,
  height NUMERIC DEFAULT 80,
  is_auto_matched BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_schematics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schematic_blocks ENABLE ROW LEVEL SECURITY;

-- Create policies for site_schematics
CREATE POLICY "Anyone can view site schematics"
ON public.site_schematics
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert site schematics"
ON public.site_schematics
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update site schematics"
ON public.site_schematics
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete site schematics"
ON public.site_schematics
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Create policies for schematic_blocks
CREATE POLICY "Anyone can view schematic blocks"
ON public.schematic_blocks
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert schematic blocks"
ON public.schematic_blocks
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update schematic blocks"
ON public.schematic_blocks
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete schematic blocks"
ON public.schematic_blocks
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Create indexes
CREATE INDEX idx_site_schematics_site_id ON public.site_schematics(site_id);
CREATE INDEX idx_schematic_blocks_schematic_id ON public.schematic_blocks(schematic_id);
CREATE INDEX idx_schematic_blocks_subsection_id ON public.schematic_blocks(subsection_id);

-- Update trigger for timestamps
CREATE TRIGGER update_site_schematics_updated_at
BEFORE UPDATE ON public.site_schematics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_schematic_blocks_updated_at
BEFORE UPDATE ON public.schematic_blocks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();