-- Add qr_code_url column to subsections table
ALTER TABLE public.subsections 
ADD COLUMN IF NOT EXISTS qr_code_url text;

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subsections_qr_code_url ON public.subsections(qr_code_url);

-- Add comment to document the column
COMMENT ON COLUMN public.subsections.qr_code_url IS 'URL to the pre-generated QR code image in storage';