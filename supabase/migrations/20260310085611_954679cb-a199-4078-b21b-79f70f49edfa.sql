
-- CRITICAL 2: Create offline_photos table for all non-COC photo contexts
CREATE TABLE public.offline_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  context_type text NOT NULL,
  context_id uuid NOT NULL,
  secondary_context_id uuid,
  photo_type text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid NOT NULL,
  latitude numeric,
  longitude numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offline_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies matching coc_compliance_photos pattern
CREATE POLICY "Admins can manage all offline photos"
  ON public.offline_photos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'Admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Users can manage all offline photos"
  ON public.offline_photos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'User'::app_role));

CREATE POLICY "Users can manage their own offline photos"
  ON public.offline_photos FOR ALL TO authenticated
  USING (captured_by = auth.uid())
  WITH CHECK (captured_by = auth.uid());

CREATE POLICY "Contractors can view offline photos for assigned sites"
  ON public.offline_photos FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'Contractor'::app_role) 
    AND context_id IN (
      SELECT s.id FROM subsections s
      WHERE s.site_id IN (SELECT us.site_id FROM user_sites us WHERE us.user_id = auth.uid())
      UNION
      SELECT si.id FROM sites si
      WHERE si.id IN (SELECT us.site_id FROM user_sites us WHERE us.user_id = auth.uid())
      UNION
      SELECT i.id FROM inspections i
      WHERE i.site_id IN (SELECT us.site_id FROM user_sites us WHERE us.user_id = auth.uid())
    )
  );

-- CRITICAL 3: Fix storage delete policy on coc-photos bucket
-- Drop the broken delete policy and create one that allows authenticated users to delete their own uploads
DROP POLICY IF EXISTS "Authenticated users can delete coc-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON storage.objects;

CREATE POLICY "Authenticated users can delete own coc-photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'coc-photos' 
    AND (
      has_role(auth.uid(), 'Admin'::app_role)
      OR has_role(auth.uid(), 'User'::app_role)
      OR auth.uid()::text = owner::text
    )
  );
