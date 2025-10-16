-- Create snags table for tracking inspection issues
CREATE TABLE IF NOT EXISTS public.snags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsection_id uuid NOT NULL REFERENCES public.subsections(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES public.inspections(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
  notes text,
  photos jsonb DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.snags ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view snags"
  ON public.snags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create snags"
  ON public.snags FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update their own snags"
  ON public.snags FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Authenticated users can delete their own snags"
  ON public.snags FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Create index for better query performance
CREATE INDEX idx_snags_subsection_id ON public.snags(subsection_id);
CREATE INDEX idx_snags_inspection_id ON public.snags(inspection_id);
CREATE INDEX idx_snags_status ON public.snags(status);

-- Add updated_at trigger
CREATE TRIGGER update_snags_updated_at
  BEFORE UPDATE ON public.snags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add quality_rating column to inspections table
ALTER TABLE public.inspections
ADD COLUMN IF NOT EXISTS quality_rating integer CHECK (quality_rating >= 1 AND quality_rating <= 5);