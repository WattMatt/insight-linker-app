-- Create table for COC validation results
CREATE TABLE IF NOT EXISTS public.coc_validations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.subsection_documents(id) ON DELETE CASCADE,
  subsection_id UUID NOT NULL REFERENCES public.subsections(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('Pass', 'Fail', 'Pending', 'Error')),
  violations JSONB DEFAULT '[]'::jsonb,
  validated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  validated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);

-- Enable RLS
ALTER TABLE public.coc_validations ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view validations
CREATE POLICY "Authenticated users can view COC validations"
  ON public.coc_validations
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy for authenticated users to insert validations
CREATE POLICY "Authenticated users can create COC validations"
  ON public.coc_validations
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy for authenticated users to update validations
CREATE POLICY "Authenticated users can update COC validations"
  ON public.coc_validations
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Add index for faster queries
CREATE INDEX idx_coc_validations_document_id ON public.coc_validations(document_id);
CREATE INDEX idx_coc_validations_subsection_id ON public.coc_validations(subsection_id);