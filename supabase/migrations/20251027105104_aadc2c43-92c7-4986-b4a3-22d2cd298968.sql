-- Create table for Fortress site marking checklists
CREATE TABLE IF NOT EXISTS public.site_marking_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  section_name TEXT NOT NULL,
  is_checked BOOLEAN DEFAULT false,
  checked_by UUID REFERENCES auth.users(id),
  checked_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(site_id, item_id)
);

-- Enable RLS
ALTER TABLE public.site_marking_checklist ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view marking checklists"
  ON public.site_marking_checklist
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create marking checklists"
  ON public.site_marking_checklist
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update marking checklists"
  ON public.site_marking_checklist
  FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete marking checklists"
  ON public.site_marking_checklist
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- Create index for better performance
CREATE INDEX idx_site_marking_checklist_site_id ON public.site_marking_checklist(site_id);

-- Add trigger for updated_at
CREATE TRIGGER update_site_marking_checklist_updated_at
  BEFORE UPDATE ON public.site_marking_checklist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();