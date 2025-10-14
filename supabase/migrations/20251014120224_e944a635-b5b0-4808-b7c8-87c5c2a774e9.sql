-- Create a temporary table to hold JSON import data
CREATE TABLE public.temp_import (
  id serial primary key,
  data jsonb,
  imported_at timestamp default now()
);

-- Enable RLS
ALTER TABLE public.temp_import ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert and select
CREATE POLICY "Authenticated users can insert import data"
ON public.temp_import
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can view import data"
ON public.temp_import
FOR SELECT
TO authenticated
USING (true);

-- Add comment
COMMENT ON TABLE public.temp_import IS 'Temporary table for importing JSON data from external sources';