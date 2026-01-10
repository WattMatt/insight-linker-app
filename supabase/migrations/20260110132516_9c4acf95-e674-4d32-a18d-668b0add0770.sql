-- Create table for PDF report templates
CREATE TABLE public.pdf_report_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL, -- 'site_summary', 'inspection', 'floor_plan', 'asset_verification', 'compliance'
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  customization JSONB NOT NULL DEFAULT '{}'::jsonb,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.pdf_report_templates ENABLE ROW LEVEL SECURITY;

-- Create policies - Admins can manage, others can view
CREATE POLICY "Admins can manage PDF templates" 
ON public.pdf_report_templates 
FOR ALL 
USING (public.has_role(auth.uid(), 'Admin'));

CREATE POLICY "Authenticated users can view PDF templates" 
ON public.pdf_report_templates 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_pdf_report_templates_updated_at
BEFORE UPDATE ON public.pdf_report_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create unique constraint for default templates per report type
CREATE UNIQUE INDEX idx_pdf_templates_default_per_type 
ON public.pdf_report_templates (report_type) 
WHERE is_default = true;

-- Insert default templates for each report type
INSERT INTO public.pdf_report_templates (name, report_type, description, is_default, customization, sections) VALUES
(
  'Default Site Summary',
  'site_summary',
  'Standard site summary report template',
  true,
  '{"coverTitle": "Site Summary Report", "coverSubtitle": "Comprehensive Site Analysis", "includeDate": true, "includeReference": true, "accentColor": "blue", "executiveSummary": "", "customNotes": "", "includeTableOfContents": false, "includePageNumbers": true, "includeWatermark": false, "watermarkText": "DRAFT"}'::jsonb,
  '[{"id": "site-info", "title": "Site Information", "type": "table", "enabled": true, "order": 0, "editable": true}, {"id": "subsections", "title": "Subsections Overview", "type": "table", "enabled": true, "order": 1, "editable": true}, {"id": "compliance", "title": "Compliance Summary", "type": "kpi", "enabled": true, "order": 2, "editable": true}, {"id": "documents", "title": "Documents", "type": "table", "enabled": true, "order": 3, "editable": true}, {"id": "inspections", "title": "Inspections", "type": "table", "enabled": true, "order": 4, "editable": true}]'::jsonb
),
(
  'Default Inspection Report',
  'inspection',
  'Standard inspection report template',
  true,
  '{"coverTitle": "Inspection Report", "coverSubtitle": "Detailed Inspection Findings", "includeDate": true, "includeReference": true, "accentColor": "green", "executiveSummary": "", "customNotes": "", "includeTableOfContents": true, "includePageNumbers": true, "includeWatermark": false, "watermarkText": "DRAFT"}'::jsonb,
  '[{"id": "inspection-details", "title": "Inspection Details", "type": "table", "enabled": true, "order": 0, "editable": true}, {"id": "findings", "title": "Findings", "type": "table", "enabled": true, "order": 1, "editable": true}, {"id": "photos", "title": "Photo Evidence", "type": "table", "enabled": true, "order": 2, "editable": true}, {"id": "signatures", "title": "Signatures", "type": "table", "enabled": true, "order": 3, "editable": true}]'::jsonb
),
(
  'Default Floor Plan Report',
  'floor_plan',
  'Standard floor plan annotation report template',
  true,
  '{"coverTitle": "Floor Plan Report", "coverSubtitle": "Annotation Summary", "includeDate": true, "includeReference": true, "accentColor": "orange", "executiveSummary": "", "customNotes": "", "includeTableOfContents": false, "includePageNumbers": true, "includeWatermark": false, "watermarkText": "DRAFT"}'::jsonb,
  '[{"id": "floor-plan-image", "title": "Floor Plan", "type": "table", "enabled": true, "order": 0, "editable": false}, {"id": "pins-summary", "title": "Pins Summary", "type": "kpi", "enabled": true, "order": 1, "editable": true}, {"id": "pins-table", "title": "Pin Details", "type": "table", "enabled": true, "order": 2, "editable": true}]'::jsonb
),
(
  'Default Asset Verification Report',
  'asset_verification',
  'Standard asset verification report template',
  true,
  '{"coverTitle": "Asset Verification Report", "coverSubtitle": "Asset Status Overview", "includeDate": true, "includeReference": true, "accentColor": "purple", "executiveSummary": "", "customNotes": "", "includeTableOfContents": false, "includePageNumbers": true, "includeWatermark": false, "watermarkText": "DRAFT"}'::jsonb,
  '[{"id": "asset-summary", "title": "Asset Summary", "type": "kpi", "enabled": true, "order": 0, "editable": true}, {"id": "electrical-meters", "title": "Electrical Meters", "type": "table", "enabled": true, "order": 1, "editable": true}, {"id": "water-meters", "title": "Water Meters", "type": "table", "enabled": true, "order": 2, "editable": true}, {"id": "equipment", "title": "Equipment", "type": "table", "enabled": true, "order": 3, "editable": true}]'::jsonb
),
(
  'Default Compliance Report',
  'compliance',
  'Standard compliance dashboard report template',
  true,
  '{"coverTitle": "Compliance Report", "coverSubtitle": "Regulatory Compliance Overview", "includeDate": true, "includeReference": true, "accentColor": "blue", "executiveSummary": "", "customNotes": "", "includeTableOfContents": true, "includePageNumbers": true, "includeWatermark": false, "watermarkText": "DRAFT"}'::jsonb,
  '[{"id": "compliance-summary", "title": "Compliance Summary", "type": "kpi", "enabled": true, "order": 0, "editable": true}, {"id": "coc-status", "title": "COC Status by Site", "type": "table", "enabled": true, "order": 1, "editable": true}, {"id": "expiring-cocs", "title": "Expiring Certificates", "type": "table", "enabled": true, "order": 2, "editable": true}, {"id": "non-compliant", "title": "Non-Compliant Items", "type": "table", "enabled": true, "order": 3, "editable": true}]'::jsonb
);