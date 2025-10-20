-- Add qr_base_url column to settings table
ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS qr_base_url TEXT;

COMMENT ON COLUMN public.settings.qr_base_url IS 'Base URL for QR code links (e.g., your published URL or custom domain)';
