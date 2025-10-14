-- Add QR scan tracking table
CREATE TABLE public.qr_scans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subsection_id uuid NOT NULL REFERENCES public.subsections(id) ON DELETE CASCADE,
  scanned_at timestamp with time zone NOT NULL DEFAULT now(),
  scanned_by uuid REFERENCES auth.users(id),
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scans"
  ON public.qr_scans FOR SELECT
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Anyone can insert scans"
  ON public.qr_scans FOR INSERT
  WITH CHECK (true);

-- Add document categories table
CREATE TABLE public.document_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subsection_id uuid NOT NULL REFERENCES public.subsections(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.document_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage document categories"
  ON public.document_categories FOR ALL
  USING (auth.role() = 'authenticated'::text);

-- Add subsection documents table
CREATE TABLE public.subsection_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subsection_id uuid NOT NULL REFERENCES public.subsections(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.document_categories(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.subsection_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage subsection documents"
  ON public.subsection_documents FOR ALL
  USING (auth.role() = 'authenticated'::text);

-- Add COC details to subsections
ALTER TABLE public.subsections
ADD COLUMN coc_number text,
ADD COLUMN coc_issue_date date,
ADD COLUMN coc_type text,
ADD COLUMN meter_serial_number text,
ADD COLUMN ct_ratio text;

-- Add site documents table
CREATE TABLE public.site_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  category text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_count integer DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.site_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage site documents"
  ON public.site_documents FOR ALL
  USING (auth.role() = 'authenticated'::text);

-- Add inspection templates table
CREATE TABLE public.inspection_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  sections_count integer DEFAULT 0,
  pages_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates"
  ON public.inspection_templates FOR SELECT
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can create templates"
  ON public.inspection_templates FOR INSERT
  WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can update templates"
  ON public.inspection_templates FOR UPDATE
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can delete templates"
  ON public.inspection_templates FOR DELETE
  USING (auth.role() = 'authenticated'::text);

-- Add triggers for updated_at
CREATE TRIGGER update_site_documents_updated_at
  BEFORE UPDATE ON public.site_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inspection_templates_updated_at
  BEFORE UPDATE ON public.inspection_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();