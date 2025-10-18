-- Create issue_reports table
CREATE TABLE public.issue_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'new',
  screenshot_url TEXT,
  page_url TEXT NOT NULL,
  browser_info JSONB DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_notes TEXT
);

-- Create storage bucket for issue screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('issue-screenshots', 'issue-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can create their own issue reports"
ON public.issue_reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reported_by);

CREATE POLICY "Users can view their own issue reports"
ON public.issue_reports
FOR SELECT
TO authenticated
USING (auth.uid() = reported_by);

CREATE POLICY "Admins can view all issue reports"
ON public.issue_reports
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Admins can update issue reports"
ON public.issue_reports
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'Admin'::app_role));

CREATE POLICY "Admins can delete issue reports"
ON public.issue_reports
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'Admin'::app_role));

-- Storage policies for issue screenshots
CREATE POLICY "Users can upload their own issue screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'issue-screenshots' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own issue screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'issue-screenshots' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can view all issue screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'issue-screenshots' AND
  has_role(auth.uid(), 'Admin'::app_role)
);

-- Trigger for updated_at
CREATE TRIGGER update_issue_reports_updated_at
BEFORE UPDATE ON public.issue_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();