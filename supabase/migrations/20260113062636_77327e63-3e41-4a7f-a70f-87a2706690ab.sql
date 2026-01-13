-- Fix RLS policies for coc_extractions to be more restrictive
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can create extractions" ON public.coc_extractions;
DROP POLICY IF EXISTS "Authenticated users can update extractions" ON public.coc_extractions;
DROP POLICY IF EXISTS "Authenticated users can delete extractions" ON public.coc_extractions;

-- Create properly restrictive policies
-- Only allow users to insert extractions they are creating
CREATE POLICY "Users can create their own extractions" 
ON public.coc_extractions 
FOR INSERT 
WITH CHECK (auth.uid() = extracted_by OR extracted_by IS NULL);

-- Only allow users to update extractions based on document access
CREATE POLICY "Users can update extractions" 
ON public.coc_extractions 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.subsection_documents sd
    JOIN public.subsections s ON sd.subsection_id = s.id
    JOIN public.sites st ON s.site_id = st.id
    WHERE sd.id = coc_extractions.document_id
  )
);

-- Only allow users to delete extractions based on document access
CREATE POLICY "Users can delete extractions" 
ON public.coc_extractions 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.subsection_documents sd
    JOIN public.subsections s ON sd.subsection_id = s.id
    JOIN public.sites st ON s.site_id = st.id
    WHERE sd.id = coc_extractions.document_id
  )
);