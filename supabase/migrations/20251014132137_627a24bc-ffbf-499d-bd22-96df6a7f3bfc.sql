-- Create storage buckets for file uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('company-logos', 'company-logos', true),
  ('client-logos', 'client-logos', true),
  ('site-images', 'site-images', true),
  ('inspection-photos', 'inspection-photos', true),
  ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for company logos (Settings page)
CREATE POLICY "Anyone can view company logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

CREATE POLICY "Authenticated users can upload company logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'company-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update company logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete company logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');

-- Storage policies for client logos
CREATE POLICY "Anyone can view client logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'client-logos');

CREATE POLICY "Authenticated users can upload client logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'client-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update client logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'client-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete client logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'client-logos' AND auth.role() = 'authenticated');

-- Storage policies for site images
CREATE POLICY "Anyone can view site images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-images');

CREATE POLICY "Authenticated users can upload site images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'site-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update site images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'site-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete site images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'site-images' AND auth.role() = 'authenticated');

-- Storage policies for inspection photos
CREATE POLICY "Authenticated users can view inspection photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inspection-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload inspection photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'inspection-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update inspection photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'inspection-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete inspection photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'inspection-photos' AND auth.role() = 'authenticated');

-- Storage policies for documents
CREATE POLICY "Authenticated users can view documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- Settings table for app branding and configuration
CREATE TABLE IF NOT EXISTS public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_logo_url text,
  login_hero_image_url text,
  company_name text DEFAULT 'Watson Mattheus',
  primary_color text DEFAULT '#3B82F6',
  google_drive_connected boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view settings"
  ON public.settings FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can update settings"
  ON public.settings FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert settings"
  ON public.settings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Activity log table for dashboard recent activity
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  action text NOT NULL,
  details text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view activity logs"
  ON public.activity_logs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert activity logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Calendar events table
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  site_name text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  status text DEFAULT 'Scheduled',
  priority text DEFAULT 'High',
  event_type text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view calendar events"
  ON public.calendar_events FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create calendar events"
  ON public.calendar_events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update calendar events"
  ON public.calendar_events FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete calendar events"
  ON public.calendar_events FOR DELETE
  USING (auth.role() = 'authenticated');

-- Add logo_url to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS primary_contact_email text;

-- Add additional fields to sites table
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS supply_authority text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS nominated_max_demand text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS consultant_name text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS consultant_company text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS consultant_contact text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS site_image_url text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS client_logo_url text;

-- Add tenant_name to subsections table
ALTER TABLE public.subsections ADD COLUMN IF NOT EXISTS tenant_name text;

-- Update inspections table with additional fields
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS project_name text;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS shop_number text;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS shop_name text;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS inspector_name text;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS client_rep text;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS consultant text;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS contractor text;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS testing_party text;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS qr_code_url text;

-- Create trigger for settings updated_at
CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for calendar_events updated_at
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings row
INSERT INTO public.settings (company_name)
VALUES ('Watson Mattheus')
ON CONFLICT DO NOTHING;