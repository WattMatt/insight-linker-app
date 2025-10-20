-- Create QR codes tracking table
CREATE TABLE IF NOT EXISTS public.qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_url text NOT NULL,
  label text,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  subsection_id uuid REFERENCES public.subsections(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all QR codes"
ON public.qr_codes
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Clients can view their QR codes"
ON public.qr_codes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'Client'::app_role) 
  AND client_id = get_user_client_id()
);

CREATE POLICY "Contractors can view QR codes for their sites"
ON public.qr_codes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'Contractor'::app_role) 
  AND site_id IN (
    SELECT site_id FROM user_sites WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Public can view QR codes"
ON public.qr_codes
FOR SELECT
TO public
USING (true);

-- Create updated_at trigger
CREATE TRIGGER update_qr_codes_updated_at
BEFORE UPDATE ON public.qr_codes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better search performance
CREATE INDEX idx_qr_codes_client ON public.qr_codes(client_id);
CREATE INDEX idx_qr_codes_site ON public.qr_codes(site_id);
CREATE INDEX idx_qr_codes_subsection ON public.qr_codes(subsection_id);