-- Create table to store COC extraction results
CREATE TABLE public.coc_extractions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.subsection_documents(id) ON DELETE CASCADE,
  subsection_id UUID NOT NULL REFERENCES public.subsections(id) ON DELETE CASCADE,
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  extraction_method TEXT DEFAULT 'gemini-full',
  extraction_notes TEXT,
  extracted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  extracted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to ensure one extraction per document
CREATE UNIQUE INDEX coc_extractions_document_id_unique ON public.coc_extractions(document_id);

-- Enable Row Level Security
ALTER TABLE public.coc_extractions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own organization extractions" 
ON public.coc_extractions 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create extractions" 
ON public.coc_extractions 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update extractions" 
ON public.coc_extractions 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete extractions" 
ON public.coc_extractions 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Create index for fast lookups
CREATE INDEX coc_extractions_subsection_id_idx ON public.coc_extractions(subsection_id);
CREATE INDEX coc_extractions_extracted_at_idx ON public.coc_extractions(extracted_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_coc_extractions_updated_at
BEFORE UPDATE ON public.coc_extractions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();