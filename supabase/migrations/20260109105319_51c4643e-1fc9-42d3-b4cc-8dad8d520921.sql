-- Create asset_types enum for categorizing assets
CREATE TYPE asset_category AS ENUM ('electrical_meter', 'water_meter', 'equipment', 'other');

-- Create site_assets table to store asset register data
CREATE TABLE public.site_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  
  -- Common fields
  premises_id TEXT NOT NULL,
  trade_as TEXT,
  asset_category asset_category NOT NULL DEFAULT 'other',
  meter_serial_number TEXT,
  comments TEXT,
  
  -- Electrical meter specific fields
  meter_type TEXT, -- Direct (D) / Current Transformer (CT), 1PH DIRECT, 3PH DIRECT
  ct_ratio TEXT,
  breaker_size TEXT,
  reading_at_commissioning TEXT,
  old_meter_serial_number TEXT,
  last_meter_read_old TEXT,
  
  -- Water meter specific fields
  tag TEXT,
  mbus_gateway_index TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  import_batch_id UUID -- To track bulk imports
);

-- Enable Row Level Security
ALTER TABLE public.site_assets ENABLE ROW LEVEL SECURITY;

-- Create policies for access control
CREATE POLICY "Admins can manage all assets"
ON public.site_assets
FOR ALL
USING (public.has_role(auth.uid(), 'Admin'))
WITH CHECK (public.has_role(auth.uid(), 'Admin'));

CREATE POLICY "Users can view assets"
ON public.site_assets
FOR SELECT
USING (public.has_role(auth.uid(), 'User') OR public.has_role(auth.uid(), 'Moderator'));

CREATE POLICY "Contractors can view assets for assigned sites"
ON public.site_assets
FOR SELECT
USING (
  public.has_role(auth.uid(), 'Contractor') 
  AND EXISTS (
    SELECT 1 FROM public.user_sites 
    WHERE user_sites.user_id = auth.uid() 
    AND user_sites.site_id = site_assets.site_id
  )
);

CREATE POLICY "Clients can view assets for their sites"
ON public.site_assets
FOR SELECT
USING (
  public.has_role(auth.uid(), 'Client')
  AND EXISTS (
    SELECT 1 FROM public.sites s
    JOIN public.user_clients uc ON uc.client_id = s.client_id
    WHERE s.id = site_assets.site_id
    AND uc.user_id = auth.uid()
  )
);

-- Create trigger for updating updated_at
CREATE TRIGGER update_site_assets_updated_at
BEFORE UPDATE ON public.site_assets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_site_assets_site_id ON public.site_assets(site_id);
CREATE INDEX idx_site_assets_category ON public.site_assets(asset_category);
CREATE INDEX idx_site_assets_premises_id ON public.site_assets(premises_id);