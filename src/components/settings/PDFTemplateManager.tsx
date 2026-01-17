import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Settings
} from "lucide-react";
import { ReportCustomization, ReportSection, DEFAULT_CUSTOMIZATION } from "@/components/pdf-editor/types";
import { PDFWYSIWYGEditor } from "./PDFWYSIWYGEditor";
import { Json } from "@/integrations/supabase/types";

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

// Inline inspection template editor card component
const InspectionTemplateCard = ({ 
  template, 
  isExpanded, 
  onToggle, 
  onSave 
}: { 
  template: InspectionFormTemplate;
  isExpanded: boolean;
  onToggle: () => void;
  onSave: () => void;
}) => {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description || "");
  const [category, setCategory] = useState(template.category);
  const [templateSections, setTemplateSections] = useState<any[]>(template.sections || []);
  const [saving, setSaving] = useState(false);

  const CATEGORIES = ["General", "Medium Voltage", "Low Voltage", "Generator", "Solar", "Progress", "Site Drawing"];

  const addSection = () => {
    setTemplateSections([...templateSections, {
      id: `section_${Date.now()}`,
      name: "New Section",
      order_index: templateSections.length,
      items: []
    }]);
  };

  const updateSection = (sectionId: string, updates: any) => {
    setTemplateSections(templateSections.map(s => s.id === sectionId ? { ...s, ...updates } : s));
  };

  const deleteSection = (sectionId: string) => {
    setTemplateSections(templateSections.filter(s => s.id !== sectionId));
  };

  const addItem = (sectionId: string) => {
    setTemplateSections(templateSections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          items: [...(s.items || []), {
            id: `item_${Date.now()}`,
            name: "New Field",
            type: "text",
            required: false
          }]
        };
      }
      return s;
    }));
  };

  const updateItem = (sectionId: string, itemId: string, updates: any) => {
    setTemplateSections(templateSections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          items: (s.items || []).map((i: any) => i.id === itemId ? { ...i, ...updates } : i)
        };
      }
      return s;
    }));
  };

  const deleteItem = (sectionId: string, itemId: string) => {
    setTemplateSections(templateSections.map(s => {
      if (s.id === sectionId) {
        return { ...s, items: (s.items || []).filter((i: any) => i.id !== itemId) };
      }
      return s;
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("inspection_templates")
        .update({
          name,
          description,
          category,
          sections: templateSections,
          sections_count: templateSections.length,
          pages_count: templateSections.length + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", template.id);

      if (error) throw error;
      toast.success("Template saved");
      onSave();
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg bg-card">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <h4 className="font-medium">{template.name}</h4>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="text-xs">{template.category}</Badge>
              <span>{template.sections?.length || 0} sections</span>
            </div>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <Settings className="h-4 w-4 mr-2" />
          {isExpanded ? 'Close' : 'Tweak'}
        </Button>
      </div>

      {isExpanded && (
        <div className="border-t p-4 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                className="h-[38px] min-h-[38px]"
              />
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Sections & Fields</h4>
              <Button variant="outline" size="sm" onClick={addSection}>
                <Plus className="mr-2 h-4 w-4" />
                Add Section
              </Button>
            </div>

            {templateSections.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                No sections defined. Click "Add Section" to start.
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {templateSections.map((section, idx) => (
                  <div key={section.id} className="border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-sm font-medium text-muted-foreground w-6">{idx + 1}.</span>
                      <Input 
                        value={section.name} 
                        onChange={(e) => updateSection(section.id, { name: e.target.value })}
                        className="flex-1 font-medium"
                      />
                      <Button variant="ghost" size="sm" onClick={() => deleteSection(section.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    
                    {/* Fields */}
                    <div className="space-y-2 ml-9">
                      {(section.items || []).map((item: any, itemIdx: number) => (
                        <div key={item.id} className="flex items-center gap-2 p-2 bg-background rounded border">
                          <span className="text-xs text-muted-foreground w-6">{idx + 1}.{itemIdx + 1}</span>
                          <Input 
                            value={item.name} 
                            onChange={(e) => updateItem(section.id, item.id, { name: e.target.value })}
                            className="flex-1 h-8 text-sm"
                            placeholder="Field name"
                          />
                          <Select 
                            value={item.type} 
                            onValueChange={(v) => updateItem(section.id, item.id, { type: v })}
                          >
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="textarea">Text Area</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="checkbox">Checkbox</SelectItem>
                              <SelectItem value="image">Image</SelectItem>
                              <SelectItem value="select">Dropdown</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="sm" onClick={() => deleteItem(section.id, item.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full text-muted-foreground"
                        onClick={() => addItem(section.id)}
                      >
                        <Plus className="mr-2 h-3 w-3" />
                        Add field
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onToggle}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
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
  const [expandedInspectionId, setExpandedInspectionId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
    fetchInspectionTemplates();
  }, []);

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

                    {/* Visual PDF Preview - Read-only using WYSIWYG component */}
                    <PDFWYSIWYGEditor
                      customization={template.customization}
                      sections={template.sections}
                      reportType={type.id}
                      onCustomizationChange={() => {}} // Read-only on main view
                      onSectionsChange={() => {}} // Read-only on main view
                    />

                    <p className="text-sm text-muted-foreground">
                      Last updated: {new Date(template.updated_at).toLocaleString()}
                    </p>

                    {/* Show ALL inspection form templates when on Inspection tab */}
                    {type.id === 'inspection' && inspectionTemplates.length > 0 && (
                      <div className="mt-8 pt-6 border-t">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="font-semibold text-lg">Inspection Form Templates</h3>
                            <p className="text-sm text-muted-foreground">
                              {inspectionTemplates.length} templates available for customization
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {inspectionTemplates.map(insp => (
                            <InspectionTemplateCard
                              key={insp.id}
                              template={insp}
                              isExpanded={expandedInspectionId === insp.id}
                              onToggle={() => setExpandedInspectionId(
                                expandedInspectionId === insp.id ? null : insp.id
                              )}
                              onSave={() => {
                                fetchInspectionTemplates();
                                setExpandedInspectionId(null);
                              }}
                            />
                          ))}
                        </div>
                      </div>
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
