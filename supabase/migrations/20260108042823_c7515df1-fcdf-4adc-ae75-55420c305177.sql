-- Create table for storing inspection signatures
CREATE TABLE public.inspection_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  signer_type TEXT NOT NULL CHECK (signer_type IN ('inspector', 'contractor', 'client', 'witness')),
  signer_name TEXT NOT NULL,
  signer_email TEXT,
  signature_data TEXT NOT NULL, -- Base64 encoded signature image
  signature_url TEXT, -- Storage URL after upload
  signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(inspection_id, signer_type)
);

-- Enable RLS
ALTER TABLE public.inspection_signatures ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view signatures for inspections they have access to"
ON public.inspection_signatures
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM inspections i
    JOIN sites s ON i.site_id = s.id
    WHERE i.id = inspection_signatures.inspection_id
  )
);

CREATE POLICY "Authenticated users can create signatures"
ON public.inspection_signatures
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own signatures"
ON public.inspection_signatures
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete signatures"
ON public.inspection_signatures
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'Admin'
  )
);

-- Create index for faster lookups
CREATE INDEX idx_inspection_signatures_inspection_id ON public.inspection_signatures(inspection_id);