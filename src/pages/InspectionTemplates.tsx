import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Download, ChevronLeft, ChevronRight, Eye, Edit, Zap, Sun, Gauge, HardDrive, ClipboardList, Map, Settings, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  generatePdfBlob,
  createCoverPage,
  createSectionHeader,
  createInfoTable,
  COLORS,
  DEFAULT_STYLES,
} from "@/lib/pdfMakeUtils";
import { TemplatePreviewRenderer } from "@/components/templates/TemplatePreviewRenderer";
import PDFTemplateUploader from "@/components/PDFTemplateUploader";
import PDFTemplateExportDialog from "@/components/PDFTemplateExportDialog";

type Content = any;
type TDocumentDefinitions = any;

const PDF_COLORS = COLORS;

interface TemplateSection {
  id: string;
  name: string;
  order_index: number;
  items?: Array<{
    id: string;
    name: string;
    type: string;
    required: boolean;
    options?: string[];
  }>;
}

interface Tenant {
  id: string;
  shopNumber: string;
  shopName: string;
  breakerSize: string;
  breakerImage: string;
  ctSizeAndRatio: string;
  ctRatioImage: string;
}

interface InspectionTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sections_count: number;
  pages_count: number;
  created_at?: string;
  sections?: TemplateSection[];
  tenants?: Tenant[];
  cover_page?: {
    title: string;
    subtitle: string;
    company_name: string;
    logo_url?: string;
  };
}

const ITEMS_PER_PAGE = 9;

// Predefined template categories with icons and descriptions
const TEMPLATE_CATEGORIES = [
  { value: "all", label: "All", icon: ClipboardList, description: "All inspection templates", color: "bg-gray-500" },
  { value: "General", label: "General", icon: FileText, description: "General purpose inspections", color: "bg-blue-500" },
  { value: "Medium Voltage", label: "MV", icon: Zap, description: "11kV+ equipment inspections", color: "bg-red-500" },
  { value: "Low Voltage", label: "LV", icon: Gauge, description: "Distribution boards & meters", color: "bg-blue-600" },
  { value: "Generator", label: "Generator", icon: HardDrive, description: "Genset FAT & commissioning", color: "bg-green-600" },
  { value: "Solar", label: "Solar", icon: Sun, description: "PV system inspections", color: "bg-orange-500" },
  { value: "Progress", label: "Progress", icon: ClipboardList, description: "Project progress reports", color: "bg-purple-600" },
  { value: "Site Drawing", label: "Drawings", icon: Map, description: "Site drawing inspections", color: "bg-cyan-600" },
] as const;

// Inline template editor component
const InlineTemplateEditor = ({ 
  template, 
  onSave, 
  onCancel 
}: { 
  template: InspectionTemplate; 
  onSave: () => void; 
  onCancel: () => void;
}) => {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description || "");
  const [category, setCategory] = useState(template.category);
  const [sections, setSections] = useState<TemplateSection[]>(template.sections || []);
  const [saving, setSaving] = useState(false);

  const addSection = () => {
    setSections([...sections, {
      id: `section_${Date.now()}`,
      name: "New Section",
      order_index: sections.length,
      items: []
    }]);
  };

  const updateSection = (sectionId: string, updates: Partial<TemplateSection>) => {
    setSections(sections.map(s => s.id === sectionId ? { ...s, ...updates } : s));
  };

  const deleteSection = (sectionId: string) => {
    setSections(sections.filter(s => s.id !== sectionId));
  };

  const addItem = (sectionId: string) => {
    setSections(sections.map(s => {
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
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          items: (s.items || []).map(i => i.id === itemId ? { ...i, ...updates } : i)
        };
      }
      return s;
    }));
  };

  const deleteItem = (sectionId: string, itemId: string) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return { ...s, items: (s.items || []).filter(i => i.id !== itemId) };
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
          sections: sections as any,
          sections_count: sections.length,
          pages_count: sections.length + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", template.id);

      if (error) throw error;
      onSave();
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
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
              {["General", "Medium Voltage", "Low Voltage", "Generator", "Solar", "Progress", "Site Drawing"].map(cat => (
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

        {sections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            No sections defined. Click "Add Section" to start.
          </div>
        ) : (
          <div className="space-y-3">
            {sections.map((section, idx) => (
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
                  {(section.items || []).map((item, itemIdx) => (
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
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
};

const InspectionTemplates = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [previewTemplate, setPreviewTemplate] = useState<InspectionTemplate | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [exportTemplate, setExportTemplate] = useState<InspectionTemplate | null>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("inspection_templates")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      
      // Type cast and parse the data to match our interface
      const typedData = (data || []).map(template => {
        // Ensure sections is an array
        let sections: TemplateSection[] = [];
        if (Array.isArray(template.sections)) {
          sections = template.sections as unknown as TemplateSection[];
        } else if (typeof template.sections === 'string') {
          try {
            sections = JSON.parse(template.sections) as TemplateSection[];
          } catch (e) {
            console.error('Failed to parse sections:', e);
          }
        }

        // Ensure tenants is an array
        let tenants: Tenant[] = [];
        if (Array.isArray((template as any).tenants)) {
          tenants = (template as any).tenants as unknown as Tenant[];
        } else if (typeof (template as any).tenants === 'string') {
          try {
            tenants = JSON.parse((template as any).tenants) as Tenant[];
          } catch (e) {
            console.error('Failed to parse tenants:', e);
          }
        }

        return {
          ...template,
          sections,
          tenants,
          cover_page: template.cover_page as unknown as {
            title: string;
            subtitle: string;
            company_name: string;
            logo_url?: string;
          },
        };
      }) as InspectionTemplate[];
      
      setTemplates(typedData);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to fetch templates");
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async (template: InspectionTemplate) => {
    try {
      const content: Content[] = [];
      const mockDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      // Cover page
      const coverPage = createCoverPage({
        title: template.name,
        subtitle: template.cover_page?.subtitle || template.category,
        siteName: 'Preview Project',
        reportType: 'Inspection Template',
        organizationName: template.cover_page?.company_name || 'Watson Mattheus',
        reportDate: new Date(),
      });
      content.push(coverPage);

      // General Information
      content.push(createSectionHeader('General Information', 'secondary'));
      const infoData: [string, string][] = [
        ['PROJECT NAME:', 'Preview Project'],
        ['INSPECTOR NAME:', 'Preview Inspector'],
        ['INSPECTION DATE:', mockDate],
        ['CLIENT REPRESENTATIVE:', 'Mock Client Rep'],
        ['CONSULTANT NAME:', 'Mock Consultant'],
        ['CONTRACTOR NAME:', 'Mock Contractor'],
        ['LOCATION:', 'Site Location Address']
      ];
      content.push(createInfoTable(infoData));

      // Template sections
      template.sections?.forEach((section) => {
        content.push({ text: '', pageBreak: 'before' } as Content);
        content.push(createSectionHeader(section.name.toUpperCase(), 'primary'));

        section.items?.forEach((item, idx) => {
          content.push({
            text: `${idx + 1}. ${item.name}`,
            bold: true,
            fontSize: 10,
            margin: [0, 8, 0, 4]
          } as Content);
          content.push({
            text: `Type: ${item.type} | Required: ${item.required ? 'Yes' : 'No'}`,
            fontSize: 9,
            color: PDF_COLORS.textMuted,
            margin: [10, 0, 0, 4]
          } as Content);
        });
      });

      // Build document
      const docDefinition: TDocumentDefinitions = {
        content,
        styles: DEFAULT_STYLES,
        defaultStyle: { font: 'Roboto', fontSize: 10 },
        pageMargins: [40, 40, 40, 60],
        footer: (currentPage: number, pageCount: number) => {
          if (currentPage === 1) return null;
          return {
            text: `${template.name} - Page ${currentPage - 1}`,
            fontSize: 9,
            alignment: 'center',
            color: PDF_COLORS.textMuted,
            margin: [0, 20, 0, 0]
          };
        }
      };

      const blob = await generatePdfBlob(docDefinition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name.replace(/\s+/g, '_')}_Preview.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success("PDF exported successfully");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  // Filter templates by selected category
  const filteredTemplates = selectedCategory === "all" 
    ? templates 
    : templates.filter(template => template.category === selectedCategory);

  // Pagination
  const totalPages = Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentTemplates = filteredTemplates.slice(startIndex, endIndex);

  // Reset to page 1 when category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inspection Templates</h1>
          <p className="text-muted-foreground mt-2">
            {templates.length} reusable templates for common inspection types
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowUploader(!showUploader)}>
            <Upload className="mr-2 h-4 w-4" />
            Import PDF
          </Button>
          <Button variant="outline" onClick={() => navigate("/inspection-templates/validate")}>
            <FileText className="mr-2 h-4 w-4" />
            Validate
          </Button>
          <Button onClick={() => navigate("/inspection-templates/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>
      </div>

      {/* PDF Uploader */}
      {showUploader && (
        <PDFTemplateUploader 
          onTemplateSaved={() => {
            fetchTemplates();
            setShowUploader(false);
          }}
        />
      )}

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="space-y-4">
        <TabsList className="grid w-full grid-cols-8 h-auto p-1">
          {TEMPLATE_CATEGORIES.map((category) => {
            const Icon = category.icon;
            return (
              <TabsTrigger 
                key={category.value} 
                value={category.value}
                className="flex flex-col gap-1 py-2 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs">{category.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TEMPLATE_CATEGORIES.map((category) => (
          <TabsContent key={category.value} value={category.value} className="space-y-4">
            {currentTemplates.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {templates.length === 0 
                      ? "No templates yet" 
                      : `No ${category.label} templates`}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {templates.length === 0 
                      ? "Create your first inspection template to streamline your workflow"
                      : `No templates found in the ${category.label} category`}
                  </p>
                  {templates.length === 0 && (
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Create First Template
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
          {/* Full list of all templates with expand/edit capability */}
          <div className="space-y-4">
            {currentTemplates.map((template) => {
              const categoryConfig = TEMPLATE_CATEGORIES.find(c => c.value === template.category);
              const CategoryIcon = categoryConfig?.icon || FileText;
              const isExpanded = expandedTemplateId === template.id;
              
              return (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${categoryConfig?.color || 'bg-gray-500'} text-white`}>
                          <CategoryIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {template.category}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {template.sections_count} sections • {template.pages_count} pages
                            </span>
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setPreviewTemplate(template)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Preview
                        </Button>
                        <Button
                          variant={isExpanded ? "default" : "outline"}
                          size="sm"
                          onClick={() => setExpandedTemplateId(isExpanded ? null : template.id)}
                        >
                          <Settings className={`mr-2 h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          {isExpanded ? 'Close' : 'Tweak'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generatePDF(template)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                  {/* Expanded inline editor */}
                  {isExpanded && (
                    <CardContent className="border-t pt-6">
                      <InlineTemplateEditor 
                        template={template} 
                        onSave={() => {
                          fetchTemplates();
                          setExpandedTemplateId(null);
                          toast.success("Template updated");
                        }}
                        onCancel={() => setExpandedTemplateId(null)}
                      />
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => goToPage(page)}
                    className="w-10"
                  >
                    {page}
                  </Button>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="text-center text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredTemplates.length)} of {filteredTemplates.length} templates
          </div>
            </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              PDF Preview: {previewTemplate?.name}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {previewTemplate && (
                <>
                  <Badge 
                    variant="secondary" 
                    className={`${TEMPLATE_CATEGORIES.find(c => c.value === previewTemplate.category)?.color || 'bg-gray-500'} text-white`}
                  >
                    {previewTemplate.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {previewTemplate.sections_count || 0} sections • {previewTemplate.pages_count || 0} pages
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[65vh]">
            {previewTemplate && <TemplatePreviewRenderer template={previewTemplate} />}
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Close
            </Button>
            <Button onClick={() => {
              if (previewTemplate) {
                generatePDF(previewTemplate);
                setPreviewTemplate(null);
              }
            }}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InspectionTemplates;
