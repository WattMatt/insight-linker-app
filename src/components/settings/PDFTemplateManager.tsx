import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  GripVertical,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { ReportCustomization, ReportSection, DEFAULT_CUSTOMIZATION } from "@/components/pdf-editor/types";
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

const ACCENT_COLORS = [
  { value: 'blue', label: 'Blue', color: 'hsl(var(--primary))' },
  { value: 'green', label: 'Green', color: '#22c55e' },
  { value: 'orange', label: 'Orange', color: '#f97316' },
  { value: 'red', label: 'Red', color: '#ef4444' },
  { value: 'purple', label: 'Purple', color: '#a855f7' },
];

const getDefaultTemplates = (): Record<string, { customization: Omit<ReportCustomization, 'sections'>; sections: ReportSection[] }> => ({
  site_summary: {
    customization: {
      ...DEFAULT_CUSTOMIZATION,
      coverTitle: "Site Summary Report",
      coverSubtitle: "Comprehensive Site Analysis",
      accentColor: "blue"
    },
    sections: [
      { id: "site-info", title: "Site Information", type: "table", enabled: true, order: 0, editable: true },
      { id: "subsections", title: "Subsections Overview", type: "table", enabled: true, order: 1, editable: true },
      { id: "compliance", title: "Compliance Summary", type: "kpi", enabled: true, order: 2, editable: true },
      { id: "documents", title: "Documents", type: "table", enabled: true, order: 3, editable: true },
      { id: "inspections", title: "Inspections", type: "table", enabled: true, order: 4, editable: true }
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
      { id: "inspection-details", title: "Inspection Details", type: "table", enabled: true, order: 0, editable: true },
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
      { id: "pins-summary", title: "Pins Summary", type: "kpi", enabled: true, order: 1, editable: true },
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
      { id: "asset-summary", title: "Asset Summary", type: "kpi", enabled: true, order: 0, editable: true },
      { id: "electrical-meters", title: "Electrical Meters", type: "table", enabled: true, order: 1, editable: true },
      { id: "water-meters", title: "Water Meters", type: "table", enabled: true, order: 2, editable: true },
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
      { id: "compliance-summary", title: "Compliance Summary", type: "kpi", enabled: true, order: 0, editable: true },
      { id: "coc-status", title: "COC Status by Site", type: "table", enabled: true, order: 1, editable: true },
      { id: "expiring-cocs", title: "Expiring Certificates", type: "table", enabled: true, order: 2, editable: true },
      { id: "non-compliant", title: "Non-Compliant Items", type: "table", enabled: true, order: 3, editable: true }
    ]
  }
});

export const PDFTemplateManager = () => {
  const [templates, setTemplates] = useState<PDFTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState('site_summary');
  const [editingTemplate, setEditingTemplate] = useState<PDFTemplate | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [customization, setCustomization] = useState<ReportCustomization>(DEFAULT_CUSTOMIZATION);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchTemplates();
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

  const getAccentColor = (color: string) => {
    return ACCENT_COLORS.find(c => c.value === color)?.color || 'hsl(var(--primary))';
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

                    {/* Template Preview */}
                    <div className="grid gap-6 md:grid-cols-2">
                      {/* Cover Page Preview */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <h4 className="font-medium text-sm text-muted-foreground">Cover Page</h4>
                        <div className="bg-muted/30 rounded-lg p-4 min-h-[200px] flex flex-col items-center justify-center text-center">
                          <h2 className="text-xl font-bold">{template.customization.coverTitle}</h2>
                          <p className="text-muted-foreground">{template.customization.coverSubtitle}</p>
                          <div className="flex gap-2 mt-4">
                            {template.customization.includeDate && (
                              <Badge variant="secondary">Date</Badge>
                            )}
                            {template.customization.includeReference && (
                              <Badge variant="secondary">Reference #</Badge>
                            )}
                          </div>
                          <Badge 
                            className="mt-4 text-white" 
                            style={{ backgroundColor: getAccentColor(template.customization.accentColor) }}
                          >
                            {template.customization.accentColor} theme
                          </Badge>
                        </div>
                      </div>

                      {/* Sections Preview */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <h4 className="font-medium text-sm text-muted-foreground">
                          Sections ({template.sections.filter(s => s.enabled).length} enabled)
                        </h4>
                        <div className="space-y-2">
                          {template.sections
                            .sort((a, b) => a.order - b.order)
                            .map(section => (
                              <div
                                key={section.id}
                                className={`flex items-center justify-between p-2 rounded-lg ${
                                  section.enabled ? 'bg-muted/50' : 'bg-muted/20 opacity-50'
                                }`}
                              >
                                <span className={section.enabled ? '' : 'line-through'}>
                                  {section.title}
                                </span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {section.type}
                                  </Badge>
                                  {section.enabled ? (
                                    <Badge variant="default" className="text-xs">On</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs">Off</Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* Options Preview */}
                    <div className="border rounded-lg p-4 space-y-3">
                      <h4 className="font-medium text-sm text-muted-foreground">Document Options</h4>
                      <div className="flex flex-wrap gap-2">
                        {template.customization.includeTableOfContents && (
                          <Badge variant="outline">Table of Contents</Badge>
                        )}
                        {template.customization.includePageNumbers && (
                          <Badge variant="outline">Page Numbers</Badge>
                        )}
                        {template.customization.includeWatermark && (
                          <Badge variant="outline">Watermark: {template.customization.watermarkText}</Badge>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Last updated: {new Date(template.updated_at).toLocaleString()}
                    </p>
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

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit {editingTemplate?.name}</DialogTitle>
              <DialogDescription>
                Customize this template. Changes will apply to all future reports of this type.
              </DialogDescription>
            </DialogHeader>

            {editingTemplate && (
              <Tabs defaultValue="cover" className="mt-4">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="cover">Cover Page</TabsTrigger>
                  <TabsTrigger value="sections">Sections</TabsTrigger>
                  <TabsTrigger value="options">Options</TabsTrigger>
                </TabsList>

                <TabsContent value="cover" className="mt-4 space-y-4">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="coverTitle">Report Title</Label>
                      <Input
                        id="coverTitle"
                        value={customization.coverTitle}
                        onChange={(e) => {
                          setCustomization(prev => ({ ...prev, coverTitle: e.target.value }));
                          setHasChanges(true);
                        }}
                        placeholder="Enter report title"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="coverSubtitle">Subtitle</Label>
                      <Input
                        id="coverSubtitle"
                        value={customization.coverSubtitle}
                        onChange={(e) => {
                          setCustomization(prev => ({ ...prev, coverSubtitle: e.target.value }));
                          setHasChanges(true);
                        }}
                        placeholder="Enter subtitle"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="includeDate"
                          checked={customization.includeDate}
                          onCheckedChange={(checked) => {
                            setCustomization(prev => ({ ...prev, includeDate: checked }));
                            setHasChanges(true);
                          }}
                        />
                        <Label htmlFor="includeDate">Include Date</Label>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Switch
                          id="includeReference"
                          checked={customization.includeReference}
                          onCheckedChange={(checked) => {
                            setCustomization(prev => ({ ...prev, includeReference: checked }));
                            setHasChanges(true);
                          }}
                        />
                        <Label htmlFor="includeReference">Include Reference #</Label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Accent Color</Label>
                      <Select
                        value={customization.accentColor}
                        onValueChange={(value: 'blue' | 'green' | 'orange' | 'red' | 'purple') => {
                          setCustomization(prev => ({ ...prev, accentColor: value }));
                          setHasChanges(true);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCENT_COLORS.map(color => (
                            <SelectItem key={color.value} value={color.value}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-4 h-4 rounded-full" 
                                  style={{ backgroundColor: color.color }}
                                />
                                {color.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="sections" className="mt-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Toggle sections on/off and reorder them by using the arrows.
                  </p>
                  <div className="space-y-2">
                    {sections
                      .sort((a, b) => a.order - b.order)
                      .map((section, index) => (
                        <div
                          key={section.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border ${
                            section.enabled ? 'bg-card' : 'bg-muted/50 opacity-60'
                          }`}
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          
                          <Switch
                            checked={section.enabled}
                            onCheckedChange={() => handleSectionToggle(section.id)}
                          />
                          
                          <div className="flex-1">
                            <p className={`font-medium ${!section.enabled && 'text-muted-foreground'}`}>
                              {section.title}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {section.type} section
                            </p>
                          </div>
                          
                          <div className="flex flex-col">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-8"
                              onClick={() => handleSectionReorder(index, 'up')}
                              disabled={index === 0}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-8"
                              onClick={() => handleSectionReorder(index, 'down')}
                              disabled={index === sections.length - 1}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </TabsContent>

                <TabsContent value="options" className="mt-4 space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="includeTableOfContents"
                        checked={customization.includeTableOfContents}
                        onCheckedChange={(checked) => {
                          setCustomization(prev => ({ ...prev, includeTableOfContents: checked }));
                          setHasChanges(true);
                        }}
                      />
                      <Label htmlFor="includeTableOfContents">Include Table of Contents</Label>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        id="includePageNumbers"
                        checked={customization.includePageNumbers}
                        onCheckedChange={(checked) => {
                          setCustomization(prev => ({ ...prev, includePageNumbers: checked }));
                          setHasChanges(true);
                        }}
                      />
                      <Label htmlFor="includePageNumbers">Include Page Numbers</Label>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="includeWatermark"
                          checked={customization.includeWatermark}
                          onCheckedChange={(checked) => {
                            setCustomization(prev => ({ ...prev, includeWatermark: checked }));
                            setHasChanges(true);
                          }}
                        />
                        <Label htmlFor="includeWatermark">Include Watermark</Label>
                      </div>
                      {customization.includeWatermark && (
                        <Input
                          value={customization.watermarkText}
                          onChange={(e) => {
                            setCustomization(prev => ({ ...prev, watermarkText: e.target.value }));
                            setHasChanges(true);
                          }}
                          placeholder="DRAFT"
                          className="ml-6"
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="executiveSummary">Default Executive Summary</Label>
                      <Textarea
                        id="executiveSummary"
                        value={customization.executiveSummary}
                        onChange={(e) => {
                          setCustomization(prev => ({ ...prev, executiveSummary: e.target.value }));
                          setHasChanges(true);
                        }}
                        placeholder="Enter default executive summary text..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="customNotes">Default Report Notes</Label>
                      <Textarea
                        id="customNotes"
                        value={customization.customNotes}
                        onChange={(e) => {
                          setCustomization(prev => ({ ...prev, customNotes: e.target.value }));
                          setHasChanges(true);
                        }}
                        placeholder="Enter default notes to include in reports..."
                        rows={3}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
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
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
