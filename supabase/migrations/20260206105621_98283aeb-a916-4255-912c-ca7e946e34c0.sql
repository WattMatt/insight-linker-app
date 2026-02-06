-- Add auto-logout settings columns to settings table
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS auto_logout_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_logout_time time DEFAULT '02:00:00';