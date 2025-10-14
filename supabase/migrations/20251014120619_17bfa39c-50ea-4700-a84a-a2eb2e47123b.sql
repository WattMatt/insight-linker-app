-- Add missing fields to inspections table for calendar functionality
ALTER TABLE public.inspections 
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'Medium',
ADD COLUMN IF NOT EXISTS end_date date,
ADD COLUMN IF NOT EXISTS assigned_to text[];

-- Add index for faster date queries
CREATE INDEX IF NOT EXISTS idx_inspections_inspection_date ON public.inspections(inspection_date);
CREATE INDEX IF NOT EXISTS idx_inspections_end_date ON public.inspections(end_date);