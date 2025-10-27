-- Create table for user cloud storage connections
CREATE TABLE IF NOT EXISTS public.user_storage_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'dropbox')),
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  account_email TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT false,
  auto_backup_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.user_storage_connections ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own connections
CREATE POLICY "Users can view their own storage connections"
  ON public.user_storage_connections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own storage connections"
  ON public.user_storage_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own storage connections"
  ON public.user_storage_connections
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own storage connections"
  ON public.user_storage_connections
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_storage_connections_updated_at
  BEFORE UPDATE ON public.user_storage_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Remove company-wide storage fields from settings table (if they exist)
ALTER TABLE public.settings 
  DROP COLUMN IF EXISTS dropbox_connected,
  DROP COLUMN IF EXISTS google_drive_connected,
  DROP COLUMN IF EXISTS google_drive_refresh_token,
  DROP COLUMN IF EXISTS google_drive_access_token,
  DROP COLUMN IF EXISTS google_drive_token_expiry,
  DROP COLUMN IF EXISTS dropbox_refresh_token,
  DROP COLUMN IF EXISTS dropbox_access_token,
  DROP COLUMN IF EXISTS dropbox_token_expiry,
  DROP COLUMN IF EXISTS auto_backup_enabled,
  DROP COLUMN IF EXISTS backup_frequency,
  DROP COLUMN IF EXISTS last_backup_at,
  DROP COLUMN IF EXISTS sync_enabled;