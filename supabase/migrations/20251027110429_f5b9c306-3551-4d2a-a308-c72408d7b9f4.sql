-- Add status column to site_marking_checklist to support N/A items
ALTER TABLE public.site_marking_checklist 
ADD COLUMN status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'not_applicable'));