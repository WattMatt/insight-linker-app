-- Create storage bucket for suggestion screenshots
INSERT INTO storage.buckets (id, name, public) 
VALUES ('suggestion-screenshots', 'suggestion-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for authenticated users to upload
CREATE POLICY "Users can upload their own suggestion screenshots"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'suggestion-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create storage policy for authenticated users to view
CREATE POLICY "Users can view their own suggestion screenshots"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'suggestion-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admins can view all suggestion screenshots
CREATE POLICY "Admins can view all suggestion screenshots"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'suggestion-screenshots'
  AND has_role(auth.uid(), 'Admin'::app_role)
);