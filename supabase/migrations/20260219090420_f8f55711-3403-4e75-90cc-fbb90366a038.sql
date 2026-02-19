-- Allow contractors to update inspections on their assigned sites
CREATE POLICY "Contractors can update inspections for assigned sites"
ON public.inspections
FOR UPDATE
USING (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND site_id IN (
    SELECT site_id FROM public.user_sites WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND site_id IN (
    SELECT site_id FROM public.user_sites WHERE user_id = auth.uid()
  )
);

-- Also allow contractors to insert inspections for their assigned sites
CREATE POLICY "Contractors can insert inspections for assigned sites"
ON public.inspections
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND site_id IN (
    SELECT site_id FROM public.user_sites WHERE user_id = auth.uid()
  )
);