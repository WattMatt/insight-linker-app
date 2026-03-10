
-- Create coc_compliance_photos table
CREATE TABLE public.coc_compliance_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsection_id uuid NOT NULL REFERENCES public.subsections(id) ON DELETE CASCADE,
  coc_validation_id uuid REFERENCES public.coc_validations(id) ON DELETE SET NULL,
  photo_type text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid NOT NULL REFERENCES auth.users(id),
  latitude numeric,
  longitude numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_coc_photos_subsection ON public.coc_compliance_photos(subsection_id);
CREATE INDEX idx_coc_photos_validation ON public.coc_compliance_photos(coc_validation_id);
CREATE INDEX idx_coc_photos_captured_by ON public.coc_compliance_photos(captured_by);

-- Enable RLS
ALTER TABLE public.coc_compliance_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage all COC photos"
  ON public.coc_compliance_photos FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'Admin'))
  WITH CHECK (public.has_role(auth.uid(), 'Admin'));

CREATE POLICY "Users can manage all COC photos"
  ON public.coc_compliance_photos FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'User'))
  WITH CHECK (public.has_role(auth.uid(), 'User'));

CREATE POLICY "Contractors can view COC photos for assigned sites"
  ON public.coc_compliance_photos FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Contractor') AND
    subsection_id IN (
      SELECT s.id FROM public.subsections s
      WHERE s.site_id IN (
        SELECT us.site_id FROM public.user_sites us WHERE us.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage their own COC photos"
  ON public.coc_compliance_photos FOR ALL
  TO authenticated
  USING (captured_by = auth.uid())
  WITH CHECK (captured_by = auth.uid());

-- Create coc-photos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('coc-photos', 'coc-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for coc-photos bucket
CREATE POLICY "Authenticated users can upload COC photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'coc-photos');

CREATE POLICY "Anyone can view COC photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'coc-photos');

CREATE POLICY "Users can delete their own COC photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'coc-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
