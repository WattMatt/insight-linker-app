-- Create suggestions table
CREATE TABLE public.suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reported_by UUID REFERENCES auth.users(id),
  user_name TEXT,
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'feature',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'new',
  page_url TEXT NOT NULL,
  screenshot_url TEXT,
  browser_info JSONB DEFAULT '{}'::jsonb,
  admin_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

-- Users can create their own suggestions
CREATE POLICY "Users can create their own suggestions"
ON public.suggestions
FOR INSERT
WITH CHECK (auth.uid() = reported_by);

-- Users can view their own suggestions
CREATE POLICY "Users can view their own suggestions"
ON public.suggestions
FOR SELECT
USING (auth.uid() = reported_by);

-- Admins can view all suggestions
CREATE POLICY "Admins can view all suggestions"
ON public.suggestions
FOR SELECT
USING (has_role(auth.uid(), 'Admin'::app_role));

-- Admins can update suggestions
CREATE POLICY "Admins can update suggestions"
ON public.suggestions
FOR UPDATE
USING (has_role(auth.uid(), 'Admin'::app_role));

-- Admins can delete suggestions
CREATE POLICY "Admins can delete suggestions"
ON public.suggestions
FOR DELETE
USING (has_role(auth.uid(), 'Admin'::app_role));