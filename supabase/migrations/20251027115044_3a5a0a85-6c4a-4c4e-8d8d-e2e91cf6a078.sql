-- Create table for floor plan uploads
CREATE TABLE IF NOT EXISTS public.subsection_floor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subsection_id UUID NOT NULL REFERENCES public.subsections(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for floor plan pins (snags/observations)
CREATE TABLE IF NOT EXISTS public.floor_plan_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id UUID NOT NULL REFERENCES public.subsection_floor_plans(id) ON DELETE CASCADE,
  pin_number INTEGER NOT NULL,
  x_position DECIMAL NOT NULL,
  y_position DECIMAL NOT NULL,
  pin_type TEXT NOT NULL CHECK (pin_type IN ('snag', 'observation')),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  title TEXT,
  notes TEXT,
  photo_url TEXT,
  assigned_contractor TEXT,
  due_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.subsection_floor_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floor_plan_pins ENABLE ROW LEVEL SECURITY;

-- RLS Policies for floor plans
CREATE POLICY "Users can view floor plans for their subsections"
  ON public.subsection_floor_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subsections s
      WHERE s.id = subsection_floor_plans.subsection_id
    )
  );

CREATE POLICY "Authenticated users can insert floor plans"
  ON public.subsection_floor_plans FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their floor plans"
  ON public.subsection_floor_plans FOR UPDATE
  USING (uploaded_by = auth.uid());

CREATE POLICY "Users can delete their floor plans"
  ON public.subsection_floor_plans FOR DELETE
  USING (uploaded_by = auth.uid());

-- RLS Policies for pins
CREATE POLICY "Users can view pins for accessible floor plans"
  ON public.floor_plan_pins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subsection_floor_plans fp
      WHERE fp.id = floor_plan_pins.floor_plan_id
    )
  );

CREATE POLICY "Authenticated users can insert pins"
  ON public.floor_plan_pins FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update pins"
  ON public.floor_plan_pins FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete pins"
  ON public.floor_plan_pins FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Create indexes for performance
CREATE INDEX idx_floor_plans_subsection ON public.subsection_floor_plans(subsection_id);
CREATE INDEX idx_pins_floor_plan ON public.floor_plan_pins(floor_plan_id);

-- Add trigger for updated_at
CREATE TRIGGER update_floor_plans_updated_at
  BEFORE UPDATE ON public.subsection_floor_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pins_updated_at
  BEFORE UPDATE ON public.floor_plan_pins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();