-- Create site_document_categories table
CREATE TABLE IF NOT EXISTS public.site_document_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_document_categories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can manage site document categories"
ON public.site_document_categories
FOR ALL
USING (auth.role() = 'authenticated');

CREATE POLICY "Public users can view site document categories"
ON public.site_document_categories
FOR SELECT
USING (true);

-- Add category_id to site_documents if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'site_documents' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.site_documents ADD COLUMN category_id UUID REFERENCES public.site_document_categories(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update existing site_documents to use category based on their category text field
-- First, create default categories for all existing sites that have documents
INSERT INTO public.site_document_categories (site_id, name, order_index)
SELECT DISTINCT sd.site_id, sd.category, 
  CASE sd.category
    WHEN '01 COC' THEN 1
    WHEN '02 Manuals' THEN 2
    WHEN '03 Line Diagram' THEN 3
    WHEN '04 Metering' THEN 4
    WHEN '05 Thermal Reports' THEN 5
    WHEN '06 Other' THEN 6
    ELSE 99
  END as order_index
FROM public.site_documents sd
WHERE sd.category IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update site_documents to link to the new category_id
UPDATE public.site_documents sd
SET category_id = sdc.id
FROM public.site_document_categories sdc
WHERE sd.site_id = sdc.site_id 
  AND sd.category = sdc.name
  AND sd.category_id IS NULL;