import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  FileText, 
  ClipboardCheck, 
  Map, 
  Package, 
  Shield,
  Edit,
  RotateCcw,
  Loader2,
  Save,
  Database,
  CheckCircle2,
  Building2,
  Eye,
} from "lucide-react";
import { ReportCustomization, ReportSection, DEFAULT_CUSTOMIZATION } from "@/components/pdf-editor/types";
import { PDFWYSIWYGEditor } from "./PDFWYSIWYGEditor";
import { InspectionTemplatePreview } from "./preview-renderers/InspectionTemplatePreview";
import { SiteSummaryFullPreview } from "./preview-renderers/SiteSummaryFullPreview";
import { useAvailableSites, useSampleReportData, SiteWithStats } from "@/hooks/useSampleReportData";
import { Json } from "@/integrations/supabase/types";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";

interface PDFTemplate {
  id: string;
  name: string;
  report_type: string;
  description: string | null;
  is_default: boolean;
  customization: ReportCustomization;
  sections: ReportSection[];
  created_at: string;
  updated_at: string;
}

const REPORT_TYPES = [
  { id: 'site_summary', label: 'Site Summary', icon: FileText, description: 'Comprehensive site overview reports' },
  { id: 'inspection', label: 'Inspection', icon: ClipboardCheck, description: 'Detailed inspection findings' },
  { id: 'floor_plan', label: 'Floor Plan', icon: Map, description: 'Floor plan annotation reports' },
  { id: 'asset_verification', label: 'Asset Verification', icon: Package, description: 'Asset status and verification' },
  { id: 'compliance', label: 'Compliance', icon: Shield, description: 'Regulatory compliance reports' },
];


const getDefaultTemplates = (): Record<string, { customization: Omit<ReportCustomization, 'sections'>; sections: ReportSection[] }> => ({
  site_summary: {
    customization: {
      ...DEFAULT_CUSTOMIZATION,
      coverTitle: "Site Summary Report",
      coverSubtitle: "Comprehensive Site Health & Compliance Overview",
      accentColor: "blue"
    },
    sections: [
      { 
        id: "health-metrics", 
        title: "Health Metrics", 
        type: "kpi", 
        enabled: true, 
        order: 0, 
        editable: true,
        kpiItems: [
          { id: "health", label: "Overall Health", field: "overallHealth", visible: true, color: "green" },
          { id: "coc", label: "COC Compliance", field: "cocCompliance", visible: true, color: "orange" },
          { id: "metering", label: "Metering Data", field: "meteringData", visible: true, color: "blue" },
          { id: "snags", label: "Snag Free", field: "snagFree", visible: true, color: "red" },
        ]
      },
      { 
        id: "health-by-category", 
        title: "Health by Category", 
        type: "kpi", 
        enabled: true, 
        order: 1, 
        editable: true,
      },
      { 
        id: "summary-statistics", 
        title: "Summary Statistics", 
        type: "table", 
        enabled: true, 
        order: 2, 
        editable: true,
        columns: [
          { id: "metric", label: "Metric", field: "metric", visible: true },
          { id: "value", label: "Value", field: "value", visible: true },
        ]
      },
      { 
        id: "subsection-details", 
        title: "Subsection Details", 
        type: "table", 
        enabled: true, 
        order: 3, 
        editable: true,
        columns: [
          { id: "name", label: "Shop Name", field: "name", visible: true },
          { id: "category", label: "Category", field: "category", visible: true },
          { id: "cocStatus", label: "COC Status", field: "cocStatus", visible: true },
          { id: "metering", label: "Metering", field: "metering", visible: true },
          { id: "snags", label: "Snags", field: "snags", visible: true },
          { id: "compliance", label: "Compliance", field: "compliance", visible: true },
        ]
      },
      { 
        id: "subsection-qr-codes", 
        title: "Subsection QR Codes", 
        type: "table", 
        enabled: true, 
        order: 4, 
        editable: true,
      },
      { 
        id: "coc-validations", 
        title: "COC Validation Summary", 
        type: "table", 
        enabled: true, 
        order: 5, 
        editable: true,
        columns: [
          { id: "subsection", label: "Subsection", field: "subsection", visible: true },
          { id: "cocNumber", label: "COC Number", field: "cocNumber", visible: true },
          { id: "status", label: "Status", field: "status", visible: true },
          { id: "date", label: "Date", field: "date", visible: true },
        ]
      },
      { 
        id: "inspections", 
        title: "Recent Inspections", 
        type: "table", 
        enabled: false, 
        order: 6, 
        editable: true,
        columns: [
          { id: "title", label: "Title", field: "title", visible: true },
          { id: "status", label: "Status", field: "status", visible: true },
          { id: "inspector", label: "Inspector", field: "inspector", visible: true },
          { id: "date", label: "Date", field: "date", visible: true },
        ]
      }
    ]
  },
  inspection: {
    customization: {
      ...DEFAULT_CUSTOMIZATION,
      coverTitle: "Inspection Report",
      coverSubtitle: "Detailed Inspection Findings",
      accentColor: "green",
      includeTableOfContents: true
    },
    sections: [
      { 
        id: "inspection-details", 
        title: "Inspection Details", 
        type: "table", 
        enabled: true, 
        order: 0, 
        editable: true,
        columns: [
          { id: "title", label: "Title", field: "title", visible: true },
          { id: "status", label: "Status", field: "status", visible: true },
          { id: "inspector", label: "Inspector", field: "inspector", visible: true },
          { id: "date", label: "Date", field: "date", visible: true },
        ]
      },
      { id: "findings", title: "Findings", type: "table", enabled: true, order: 1, editable: true },
      { id: "photos", title: "Photo Evidence", type: "table", enabled: true, order: 2, editable: true },
      { id: "signatures", title: "Signatures", type: "table", enabled: true, order: 3, editable: true }
    ]
  },
  floor_plan: {
    customization: {
      ...DEFAULT_CUSTOMIZATION,
      coverTitle: "Floor Plan Report",
      coverSubtitle: "Annotation Summary",
      accentColor: "orange"
    },
    sections: [
      { id: "floor-plan-image", title: "Floor Plan", type: "table", enabled: true, order: 0, editable: false },
      { 
        id: "pins-summary", 
        title: "Pins Summary", 
        type: "kpi", 
        enabled: true, 
        order: 1, 
        editable: true,
        kpiItems: [
          { id: "total", label: "Total Pins", field: "totalSubsections", visible: true, color: "blue" },
          { id: "open", label: "Open", field: "cocMissing", visible: true, color: "orange" },
          { id: "resolved", label: "Resolved", field: "cocPass", visible: true, color: "green" },
        ]
      },
      { id: "pins-table", title: "Pin Details", type: "table", enabled: true, order: 2, editable: true }
    ]
  },
  asset_verification: {
    customization: {
      ...DEFAULT_CUSTOMIZATION,
      coverTitle: "Asset Verification Report",
      coverSubtitle: "Asset Status Overview",
      accentColor: "purple"
    },
    sections: [
      { 
        id: "asset-summary", 
        title: "Asset Summary", 
        type: "kpi", 
        enabled: true, 
        order: 0, 
        editable: true,
        kpiItems: [
          { id: "total", label: "Total Assets", field: "totalAssets", visible: true, color: "blue" },
          { id: "verified", label: "Verified", field: "cocPass", visible: true, color: "green" },
          { id: "pending", label: "Pending", field: "cocPending", visible: true, color: "orange" },
        ]
      },
      { 
        id: "electrical-meters", 
        title: "Electrical Meters", 
        type: "table", 
        enabled: true, 
        order: 1, 
        editable: true,
        columns: [
          { id: "serial", label: "Serial Number", field: "serial", visible: true },
          { id: "premises", label: "Premises ID", field: "premises", visible: true },
          { id: "trade", label: "Trade As", field: "trade", visible: true },
          { id: "breaker", label: "Breaker Size", field: "breaker", visible: true },
          { id: "ct", label: "CT Ratio", field: "ct", visible: true },
        ]
      },
      { 
        id: "water-meters", 
        title: "Water Meters", 
        type: "table", 
        enabled: true, 
        order: 2, 
        editable: true,
        columns: [
          { id: "serial", label: "Serial Number", field: "serial", visible: true },
          { id: "premises", label: "Premises ID", field: "premises", visible: true },
          { id: "trade", label: "Trade As", field: "trade", visible: true },
          { id: "type", label: "Meter Type", field: "type", visible: true },
        ]
      },
      { id: "equipment", title: "Equipment", type: "table", enabled: true, order: 3, editable: true }
    ]
  },
  compliance: {
    customization: {
      ...DEFAULT_CUSTOMIZATION,
      coverTitle: "Compliance Report",
      coverSubtitle: "Regulatory Compliance Overview",
      accentColor: "blue",
      includeTableOfContents: true
    },
    sections: [
      { 
        id: "compliance-summary", 
        title: "Compliance Summary", 
        type: "kpi", 
        enabled: true, 
        order: 0, 
        editable: true,
        kpiItems: [
          { id: "total", label: "Total Subsections", field: "totalSubsections", visible: true, color: "blue" },
          { id: "compliant", label: "Compliant", field: "cocPass", visible: true, color: "green" },
          { id: "non-compliant", label: "Non-Compliant", field: "cocMissing", visible: true, color: "red" },
          { id: "rate", label: "Compliance Rate", field: "complianceRate", visible: true, color: "purple" },
        ]
      },
      { 
        id: "coc-status", 
        title: "COC Status by Site", 
        type: "table", 
        enabled: true, 
        order: 1, 
        editable: true,
        columns: [
          { id: "name", label: "Shop Name", field: "name", visible: true },
          { id: "tenant", label: "Tenant", field: "tenant", visible: true },
          { id: "cocStatus", label: "COC Status", field: "cocStatus", visible: true },
        ]
      },
      { id: "expiring-cocs", title: "Expiring Certificates", type: "table", enabled: true, order: 2, editable: true },
      { id: "non-compliant", title: "Non-Compliant Items", type: "table", enabled: true, order: 3, editable: true }
    ]
  }
});

// Inspection form template types
interface InspectionFormTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sections: any[];
  created_at: string;
  updated_at: string;
}

// Convert inspection template sections to PDF preview sections
const convertInspectionToPreviewSections = (template: InspectionFormTemplate): ReportSection[] => {
  return (template.sections || []).map((section: any, idx: number) => ({
    id: section.id || `section_${idx}`,
    title: section.name || `Section ${idx + 1}`,
    type: 'table' as const,
    enabled: true,
    order: idx,
    editable: true,
    columns: (section.items || []).map((item: any, itemIdx: number) => ({
      id: item.id || `item_${itemIdx}`,
      label: item.name || `Field ${itemIdx + 1}`,
      field: (item.name || '').toLowerCase().replace(/\s+/g, '_'),
      visible: true,
    }))
  }));
};

// Convert preview sections back to inspection template format
const convertPreviewToInspectionSections = (previewSections: ReportSection[]): any[] => {
  return previewSections.map((section, idx) => ({
    id: section.id,
    name: section.title,
    order_index: idx,
    items: (section.columns || []).map((col, itemIdx) => ({
      id: col.id,
      name: col.label,
      type: 'text',
      required: false
    }))
  }));
};

// Wrapper component for Site Summary preview that fetches real sample data
interface SiteSummaryPreviewWrapperProps {
  template: PDFTemplate;
  referenceSiteId: string | null;
  availableSites: SiteWithStats[];
}

const SiteSummaryPreviewWrapper: React.FC<SiteSummaryPreviewWrapperProps> = ({
  template,
  referenceSiteId,
  availableSites,
}) => {
  const { site, subsections, inspections, cocValidations, kpis, loading } = useSampleReportData('site_summary', referenceSiteId || undefined);
  
  const getAccentColors = (color: string) => ({
    primary: color === 'green' ? '#16a34a' : color === 'orange' ? '#ea580c' : color === 'red' ? '#dc2626' : color === 'purple' ? '#9333ea' : '#2563eb',
    light: color === 'green' ? '#dcfce7' : color === 'orange' ? '#ffedd5' : color === 'red' ? '#fee2e2' : color === 'purple' ? '#f3e8ff' : '#dbeafe',
    text: color === 'green' ? '#166534' : color === 'orange' ? '#c2410c' : color === 'red' ? '#b91c1c' : color === 'purple' ? '#7e22ce' : '#1e40af',
  });
  
  const colors = getAccentColors(template.customization.accentColor || 'blue');
  const selectedSite = availableSites.find(s => s.id === referenceSiteId);
  
  if (loading) {
    return (
      <div className="border rounded-lg bg-gray-100 p-4 flex items-center justify-center" style={{ minHeight: 400 }}>
        <div className="text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p>Loading preview data...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="border rounded-lg overflow-auto bg-gray-100 p-4 max-h-[600px]">
      <SiteSummaryFullPreview
        sections={template.sections}
        customization={template.customization}
        zoom={0.65}
        colors={colors}
        siteName={site?.name || selectedSite?.name || 'Sample Site'}
        clientName={site?.clientName || selectedSite?.clientName || 'Sample Client'}
        siteAddress={site?.address || '123 Sample Address, City'}
        clientLogoUrl={site?.clientLogoUrl || null}
        subsections={subsections}
        kpis={kpis}
        inspections={inspections}
        cocValidations={cocValidations}
      />
    </div>
  );
};

export const PDFTemplateManager = () => {
  const [templates, setTemplates] = useState<PDFTemplate[]>([]);
  const [inspectionTemplates, setInspectionTemplates] = useState<InspectionFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState('site_summary');
  const [editingTemplate, setEditingTemplate] = useState<PDFTemplate | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [customization, setCustomization] = useState<ReportCustomization>(DEFAULT_CUSTOMIZATION);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Reference site selection for realistic previews
  const { sites: availableSites, loading: loadingSites } = useAvailableSites();
  const [referenceSiteId, setReferenceSiteId] = useState<string | null>(null);
  
  // Inspection template selection state
  const [selectedInspectionTemplateId, setSelectedInspectionTemplateId] = useState<string | null>(null);
  const [inspectionPreviewSections, setInspectionPreviewSections] = useState<ReportSection[]>([]);
  const [inspectionHasChanges, setInspectionHasChanges] = useState(false);
  const [savingInspection, setSavingInspection] = useState(false);

  // Auto-select best reference site when available
  useEffect(() => {
    if (availableSites.length > 0 && !referenceSiteId) {
      setReferenceSiteId(availableSites[0].id);
    }
  }, [availableSites, referenceSiteId]);

  useEffect(() => {
    fetchTemplates();
    fetchInspectionTemplates();
  }, []);

  // Update inspection preview when template is selected
  useEffect(() => {
    if (selectedInspectionTemplateId) {
      const selected = inspectionTemplates.find(t => t.id === selectedInspectionTemplateId);
      if (selected) {
        setInspectionPreviewSections(convertInspectionToPreviewSections(selected));
        setInspectionHasChanges(false);
      }
    }
  }, [selectedInspectionTemplateId, inspectionTemplates]);
  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("pdf_report_templates")
        .select("*")
        .order("report_type");

      if (error) throw error;
      
      const parsed = (data || []).map(t => ({
        ...t,
        customization: (typeof t.customization === 'string' 
          ? JSON.parse(t.customization) 
          : t.customization) as unknown as ReportCustomization,
        sections: (typeof t.sections === 'string'
          ? JSON.parse(t.sections)
          : t.sections) as unknown as ReportSection[]
      }));
      
      setTemplates(parsed);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load PDF templates");
    } finally {
      setLoading(false);
    }
  };

  const fetchInspectionTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("inspection_templates")
        .select("*")
        .order("category")
        .order("name");

      if (error) throw error;
      
      const parsed = (data || []).map(t => ({
        ...t,
        sections: Array.isArray(t.sections) ? t.sections : 
          (typeof t.sections === 'string' ? JSON.parse(t.sections) : [])
      }));
      
      setInspectionTemplates(parsed as InspectionFormTemplate[]);
    } catch (error) {
      console.error("Error fetching inspection templates:", error);
    }
  };

  const handleEditTemplate = (template: PDFTemplate) => {
    setEditingTemplate(template);
    setCustomization(template.customization);
    setSections(template.sections);
    setHasChanges(false);
    setEditDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("pdf_report_templates")
        .update({
          customization: customization as unknown as Json,
          sections: sections as unknown as Json
        })
        .eq("id", editingTemplate.id);

      if (error) throw error;

      toast.success("Template saved successfully");
      setHasChanges(false);
      setEditDialogOpen(false);
      fetchTemplates();
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast.error(error.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleResetTemplate = async (template: PDFTemplate) => {
    const defaults = getDefaultTemplates()[template.report_type];
    if (!defaults) return;

    try {
      const { error } = await supabase
        .from("pdf_report_templates")
        .update({
          customization: defaults.customization as unknown as Json,
          sections: defaults.sections as unknown as Json
        })
        .eq("id", template.id);

      if (error) throw error;

      toast.success("Template reset to defaults");
      fetchTemplates();
    } catch (error: any) {
      console.error("Error resetting template:", error);
      toast.error(error.message || "Failed to reset template");
    }
  };

  const handleSaveInspectionTemplate = async () => {
    if (!selectedInspectionTemplateId) return;
    
    setSavingInspection(true);
    try {
      const convertedSections = convertPreviewToInspectionSections(inspectionPreviewSections);
      
      const { error } = await supabase
        .from("inspection_templates")
        .update({
          sections: convertedSections,
          sections_count: convertedSections.length,
          pages_count: convertedSections.length + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", selectedInspectionTemplateId);

      if (error) throw error;
      toast.success("Inspection template saved");
      setInspectionHasChanges(false);
      fetchInspectionTemplates();
    } catch (error: any) {
      console.error("Error saving inspection template:", error);
      toast.error(error.message || "Failed to save template");
    } finally {
      setSavingInspection(false);
    }
  };

  const handleSectionToggle = (sectionId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, enabled: !s.enabled } : s
    ));
    setHasChanges(true);
  };

  const handleSectionReorder = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= sections.length) return;
    
    const newSections = [...sections];
    [newSections[fromIndex], newSections[toIndex]] = [newSections[toIndex], newSections[fromIndex]];
    const reordered = newSections.map((s, i) => ({ ...s, order: i }));
    setSections(reordered);
    setHasChanges(true);
  };


  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>PDF Report Templates</CardTitle>
        <CardDescription>
          Configure default templates for all PDF reports. These settings will be used as the base for every report generated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Reference Project Selector */}
        <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-primary">
              <Database className="h-5 w-5" />
              <div>
                <Label className="text-sm font-medium">Reference Project</Label>
                <p className="text-xs text-muted-foreground">
                  Select a project with complete data to see realistic previews
                </p>
              </div>
            </div>
            <Select 
              value={referenceSiteId || ""} 
              onValueChange={setReferenceSiteId}
              disabled={loadingSites}
            >
              <SelectTrigger className="w-[350px]">
                <SelectValue placeholder={loadingSites ? "Loading sites..." : "Choose a reference project..."} />
              </SelectTrigger>
              <SelectContent>
                {availableSites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{site.name}</span>
                      <Badge variant="outline" className="text-xs ml-2">
                        {site.subsectionCount} shops
                      </Badge>
                      {site.inspectionCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {site.inspectionCount} inspections
                        </Badge>
                      )}
                      {site.completenessScore >= 80 && (
                        <CheckCircle2 className="h-3 w-3 text-green-600 ml-1" />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {referenceSiteId && availableSites.find(s => s.id === referenceSiteId)?.completenessScore >= 80 && (
              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Best for previews
              </Badge>
            )}
          </div>
        </div>

        <Tabs value={selectedType} onValueChange={setSelectedType}>
          <TabsList className="grid grid-cols-5 w-full mb-6">
            {REPORT_TYPES.map(type => {
              const Icon = type.icon;
              return (
                <TabsTrigger key={type.id} value={type.id} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{type.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {REPORT_TYPES.map(type => {
            const template = templates.find(t => t.report_type === type.id && t.is_default);
            const Icon = type.icon;
            
            return (
              <TabsContent key={type.id} value={type.id}>
                {template ? (
                  <div className="space-y-6">
                    {/* Template Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-primary/10 rounded-lg">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{template.name}</h3>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResetTemplate(template)}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reset
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleEditTemplate(template)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Template
                        </Button>
                      </div>
                    </div>

                    {/* For Inspection tab: Template selector with dynamic preview */}
                    {type.id === 'inspection' && inspectionTemplates.length > 0 ? (
                      <div className="space-y-4">
                        {/* Template Selector */}
                        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border">
                          <Label className="text-sm font-medium whitespace-nowrap">Preview Template:</Label>
                          <Select 
                            value={selectedInspectionTemplateId || ""} 
                            onValueChange={(value) => setSelectedInspectionTemplateId(value)}
                          >
                            <SelectTrigger className="w-[300px]">
                              <SelectValue placeholder="Select an inspection template to preview & edit" />
                            </SelectTrigger>
                            <SelectContent>
                              {inspectionTemplates.map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                  <div className="flex items-center gap-2">
                                    <span>{t.name}</span>
                                    <Badge variant="outline" className="text-xs ml-2">{t.category}</Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          {selectedInspectionTemplateId && inspectionHasChanges && (
                            <Button 
                              size="sm" 
                              onClick={handleSaveInspectionTemplate}
                              disabled={savingInspection}
                            >
                              {savingInspection ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Save className="h-4 w-4 mr-2" />
                                  Save Changes
                                </>
                              )}
                            </Button>
                          )}
                          
                          {inspectionHasChanges && (
                            <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
                              Unsaved changes
                            </Badge>
                          )}
                        </div>

                        {/* Dynamic Preview based on selected template - Use InspectionTemplatePreview */}
                        {selectedInspectionTemplateId ? (
                          <div className="border rounded-lg overflow-hidden bg-gray-100 p-4">
                            <InspectionTemplatePreview
                              template={inspectionTemplates.find(t => t.id === selectedInspectionTemplateId)!}
                              sampleData={
                                referenceSiteId && availableSites.find(s => s.id === referenceSiteId)
                                  ? {
                                      siteName: availableSites.find(s => s.id === referenceSiteId)?.name,
                                      clientName: availableSites.find(s => s.id === referenceSiteId)?.clientName,
                                    }
                                  : undefined
                              }
                              zoom={0.7}
                              colors={{ 
                                primary: '#16a34a', 
                                light: '#dcfce7', 
                                text: '#166534' 
                              }}
                            />
                          </div>
                        ) : (
                          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                            <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="font-medium">Select a template above to preview and edit</p>
                            <p className="text-sm mt-1">The preview will show the actual template structure</p>
                          </div>
                        )}
                      </div>
                    ) : type.id === 'site_summary' ? (
                      /* Site Summary uses specialized full preview matching actual PDF output */
                      <SiteSummaryPreviewWrapper
                        template={template}
                        referenceSiteId={referenceSiteId}
                        availableSites={availableSites}
                      />
                    ) : (
                      <>
                        {/* Visual PDF Preview - Read-only for other report types */}
                        <PDFWYSIWYGEditor
                          customization={template.customization}
                          sections={template.sections}
                          reportType={type.id}
                          referenceSiteId={referenceSiteId}
                          onCustomizationChange={() => {}}
                          onSectionsChange={() => {}}
                        />
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Icon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No template found for {type.label} reports</p>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>

        {/* Edit Dialog - Full WYSIWYG */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit {editingTemplate?.name}</DialogTitle>
              <DialogDescription>
                Click directly on the preview to edit. Changes will apply to all future reports of this type.
              </DialogDescription>
            </DialogHeader>

            {editingTemplate && (
              <div className="flex-1 overflow-auto mt-4">
                <PDFWYSIWYGEditor
                  customization={customization}
                  sections={sections}
                  reportType={editingTemplate.report_type}
                  referenceSiteId={referenceSiteId}
                  onCustomizationChange={(updates) => {
                    setCustomization(prev => ({ ...prev, ...updates }));
                    setHasChanges(true);
                  }}
                  onSectionsChange={(newSections) => {
                    setSections(newSections);
                    setHasChanges(true);
                  }}
                />
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t">
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
                    Unsaved changes
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveTemplate} disabled={saving || !hasChanges}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Template
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
