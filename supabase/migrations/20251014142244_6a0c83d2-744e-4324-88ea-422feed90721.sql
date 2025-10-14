-- Add firebase_id columns for migration tracking
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS firebase_id TEXT UNIQUE;

ALTER TABLE public.sites
ADD COLUMN IF NOT EXISTS firebase_id TEXT;

ALTER TABLE public.subsections
ADD COLUMN IF NOT EXISTS firebase_id TEXT;

ALTER TABLE public.inspections
ADD COLUMN IF NOT EXISTS firebase_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clients_firebase_id ON public.clients(firebase_id);
CREATE INDEX IF NOT EXISTS idx_sites_firebase_id ON public.sites(firebase_id);
CREATE INDEX IF NOT EXISTS idx_subsections_firebase_id ON public.subsections(firebase_id);
CREATE INDEX IF NOT EXISTS idx_inspections_firebase_id ON public.inspections(firebase_id);
