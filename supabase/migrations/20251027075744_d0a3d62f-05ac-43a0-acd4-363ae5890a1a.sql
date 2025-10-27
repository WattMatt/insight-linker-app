-- Add OAuth and integration fields to settings table
ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS dropbox_connected boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS google_drive_refresh_token text,
ADD COLUMN IF NOT EXISTS google_drive_access_token text,
ADD COLUMN IF NOT EXISTS google_drive_token_expiry timestamp with time zone,
ADD COLUMN IF NOT EXISTS dropbox_refresh_token text,
ADD COLUMN IF NOT EXISTS dropbox_access_token text,
ADD COLUMN IF NOT EXISTS dropbox_token_expiry timestamp with time zone,
ADD COLUMN IF NOT EXISTS auto_backup_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS backup_frequency text DEFAULT 'daily',
ADD COLUMN IF NOT EXISTS last_backup_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS sync_enabled boolean DEFAULT false;

-- Create table for tracking file sync status
CREATE TABLE IF NOT EXISTS public.file_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  file_name text NOT NULL,
  sync_type text NOT NULL, -- 'upload', 'download', 'delete'
  service text NOT NULL, -- 'google_drive', 'dropbox'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  error_message text,
  synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.file_sync_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for file_sync_logs
CREATE POLICY "Authenticated users can view sync logs"
  ON public.file_sync_logs
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create sync logs"
  ON public.file_sync_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_file_sync_logs_created_at ON public.file_sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_sync_logs_service ON public.file_sync_logs(service);