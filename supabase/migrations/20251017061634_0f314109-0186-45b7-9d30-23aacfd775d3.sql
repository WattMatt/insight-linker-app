-- Create user_sites mapping table for contractors
CREATE TABLE IF NOT EXISTS public.user_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, site_id)
);

ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_sites
CREATE POLICY "Admins can manage user-site mappings"
ON public.user_sites
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Users can view their own site assignments"
ON public.user_sites
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Update inspections RLS to allow contractors to view/update inspections for their sites
CREATE POLICY "Contractors can view inspections for their sites"
ON public.inspections
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND site_id IN (
    SELECT site_id 
    FROM public.user_sites 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Contractors can update inspections for their sites"
ON public.inspections
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND site_id IN (
    SELECT site_id 
    FROM public.user_sites 
    WHERE user_id = auth.uid()
  )
);

-- Allow contractors to view subsections for their assigned sites
CREATE POLICY "Contractors can view subsections for their sites"
ON public.subsections
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND site_id IN (
    SELECT site_id 
    FROM public.user_sites 
    WHERE user_id = auth.uid()
  )
);

-- Allow contractors to view sites they're assigned to
CREATE POLICY "Contractors can view their assigned sites"
ON public.sites
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND id IN (
    SELECT site_id 
    FROM public.user_sites 
    WHERE user_id = auth.uid()
  )
);