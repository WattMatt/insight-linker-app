import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import {
  generatePdfBlob,
  buildDocument,
  createSectionHeader,
  createDataTable,
  logComplianceCheck,
  COLORS,
  PDFComplianceCheck,
} from "@/lib/pdfMakeUtils";

interface TemplateSection {
  id: string;
  name: string;
  order_index: number;
  items?: Array<{
    id: string;
    name: string;
    type: string;
    required: boolean;
  }>;
}

interface InspectionTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sections?: TemplateSection[];
  cover_page?: {
    title: string;
    subtitle: string;
    company_name: string;
  };
}

interface ReportData {
  [sectionId: string]: {
    [itemId: string]: {
      status?: string;
      notes?: string;
    };
  };
}

interface TemplateBasedReportProps {
  subsectionId: string;
  subsectionName: string;
  siteName: string;
}

export const TemplateBasedReport = ({ subsectionId, subsectionName, siteName }: TemplateBasedReportProps) => {
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<InspectionTemplate | null>(null);
  const [reportData, setReportData] = useState<ReportData>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("inspection_templates")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      const typedData = (data || []).map(template => ({
        ...template,
        sections: template.sections as unknown as TemplateSection[],
        cover_page: template.cover_page as unknown as {
          title: string;
          subtitle: string;
          company_name: string;
        },
      })) as InspectionTemplate[];

      setTemplates(typedData);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to fetch templates");
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    setSelectedTemplate(template || null);
    setReportData({});
  };

  const handleItemChange = (sectionId: string, itemId: string, field: 'status' | 'notes', value: string) => {
    setReportData(prev => {
      const sectionData = prev[sectionId] || {};
      const itemData = sectionData[itemId] || {};

      return {
        ...prev,
        [sectionId]: {
          ...sectionData,
          [itemId]: {
            ...itemData,
            [field]: value
          }
        }
      };
    });
  };

  const generatePDFDocument = async (): Promise<{ blob: Blob; fileName: string; complianceChecks: PDFComplianceCheck } | null> => {
    if (!selectedTemplate) return null;

    try {
      const content: any[] = [];

      // Build sections
      selectedTemplate.sections?.forEach((section) => {
        content.push(createSectionHeader(section.name));

        const tableData = section.items?.map((item) => {
          const itemData = reportData[section.id]?.[item.id];
          return {
            item: item.name,
            status: itemData?.status || 'N/A',
            notes: itemData?.notes || '',
          };
        }) || [];

        if (tableData.length > 0) {
          content.push(createDataTable(
            [
              { header: 'Item', field: 'item', width: '*' },
              { header: 'Status', field: 'status', width: 60, alignment: 'center' },
              { header: 'Notes', field: 'notes', width: 150 },
            ],
            tableData
          ));
        }
      });

      // Build document
      const docDefinition = buildDocument({
        title: selectedTemplate.name,
        coverPage: {
          title: selectedTemplate.cover_page?.title || selectedTemplate.name,
          subtitle: selectedTemplate.cover_page?.subtitle || selectedTemplate.category,
          siteName,
          reportType: 'Inspection Report',
          organizationName: selectedTemplate.cover_page?.company_name || 'Watson Mattheus',
          reportDate: new Date(),
        },
        content,
      });

      // Generate blob
      const blob = await generatePdfBlob(docDefinition);

      // Log compliance
      const complianceChecks = logComplianceCheck('TemplateBasedReport', {
        hasCoverPage: true,
        logoPlacement: false,
        standardMargins: true,
        typographyScale: true,
        brandColors: true,
        pageHeaders: true,
        pageFooters: true,
        tableStyles: true,
        pageBreaks: true,
      });

      const fileName = `${subsectionName}_${selectedTemplate.name}_Report.pdf`;
      return { blob, fileName, complianceChecks };
    } catch (error) {
      console.error("Error generating PDF:", error);
      return null;
    }
  };

  const handlePreviewReport = async () => {
    try {
      setGenerating(true);
      const result = await generatePDFDocument();

      if (!result) {
        toast.error("Failed to generate report");
        return;
      }

      const url = URL.createObjectURL(result.blob);
      setPreviewUrl(url);
      setPreviewFileName(result.fileName);
      setPdfBlob(result.blob);
      setPreviewOpen(true);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!pdfBlob || !subsectionId) {
      toast.error("Cannot save: missing data");
      return;
    }

    try {
      setSaving(true);
      const result = await savePDFToDocuments({
        blob: pdfBlob,
        fileName: previewFileName,
        subsectionId,
        categoryName: getReportCategoryName("inspection"),
      });

      if (result.success) {
        toast.success("Report saved to documents!");
      } else {
        toast.error(result.error || "Failed to save report");
      }
    } catch (error) {
      console.error("Error saving report:", error);
      toast.error("Failed to save report");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!selectedTemplate ? (
        <Card>
          <CardHeader>
            <CardTitle>Select an Inspection Template</CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose a template to generate a structured inspection report
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select onValueChange={handleTemplateSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{template.category}</Badge>
                      <span>{template.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No templates available. Please create templates first.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{selectedTemplate.name}</h3>
              <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                Change Template
              </Button>
              <Button onClick={handlePreviewReport} disabled={generating}>
                <Eye className="mr-2 h-4 w-4" />
                {generating ? "Generating..." : "Preview Report"}
              </Button>
            </div>
          </div>

          {selectedTemplate.sections?.map((section) => (
            <Card key={section.id}>
              <CardHeader>
                <CardTitle className="text-base">{section.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {section.items?.map((item) => {
                  const sectionData = reportData[section.id] || {};
                  const itemData = sectionData[item.id] || { status: '', notes: '' };
                  return (
                    <div key={item.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium">{item.name}</h4>
                        {item.required && (
                          <Badge variant="outline" className="text-xs">Required</Badge>
                        )}
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label>Status</Label>
                          <Select
                            value={itemData.status || ''}
                            onValueChange={(value) => handleItemChange(section.id, item.id, 'status', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pass">Pass</SelectItem>
                              <SelectItem value="Fail">Fail</SelectItem>
                              <SelectItem value="N/A">N/A</SelectItem>
                              <SelectItem value="Pending">Pending</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Textarea
                            value={itemData.notes || ''}
                            onChange={(e) => handleItemChange(section.id, item.id, 'notes', e.target.value)}
                            placeholder="Add notes..."
                            rows={3}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </>
      )}

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open && previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl("");
          }
        }}
        fileUrl={previewUrl}
        fileName={previewFileName}
        onSaveToDocuments={handleSaveToDocuments}
        saveLocation="subsection"
        contextName={subsectionName}
        isSaving={saving}
      />
    </div>
  );
};
