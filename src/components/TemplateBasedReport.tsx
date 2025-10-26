import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  const generatePDFDocument = async (): Promise<{ doc: jsPDF, fileName: string } | null> => {
    if (!selectedTemplate) return null;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Cover Page
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(32);
      doc.setFont(undefined, 'bold');
      doc.text(selectedTemplate.cover_page?.title || 'Inspection Report', pageWidth / 2, 80, { align: 'center' });
      
      doc.setFontSize(18);
      doc.setFont(undefined, 'normal');
      doc.text(subsectionName, pageWidth / 2, 100, { align: 'center' });
      doc.text(siteName, pageWidth / 2, 115, { align: 'center' });
      
      doc.setFontSize(14);
      doc.text(selectedTemplate.cover_page?.company_name || 'Watson Mattheus', pageWidth / 2, 135, { align: 'center' });
      
      doc.setFontSize(12);
      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      doc.text(`Generated: ${date}`, pageWidth / 2, 155, { align: 'center' });

      // Content Pages
      doc.addPage();
      doc.setTextColor(0, 0, 0);
      
      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      doc.text(selectedTemplate.name, 20, 20);
      
      let yPosition = 40;

      selectedTemplate.sections?.forEach((section) => {
        if (yPosition > pageHeight - 60) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text(section.name, 20, yPosition);
        yPosition += 10;

        const tableData: any[] = [];
        section.items?.forEach((item) => {
          const itemData = reportData[section.id]?.[item.id];
          tableData.push([
            item.name,
            itemData?.status || 'N/A',
            itemData?.notes || ''
          ]);
        });

        if (tableData.length > 0) {
          autoTable(doc, {
            startY: yPosition,
            head: [['Item', 'Status', 'Notes']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 3 },
            margin: { left: 20, right: 20 },
            didDrawPage: (data) => {
              yPosition = data.cursor?.y || yPosition;
            }
          });
          yPosition += 15;
        }
      });

      // Footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(128, 128, 128);
        if (i > 1) {
          doc.text(
            `Page ${i - 1} of ${totalPages - 1}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
        }
      }

      const fileName = `${subsectionName}_${selectedTemplate.name}_Report.pdf`;
      return { doc, fileName };
    } catch (error) {
      console.error("Error generating PDF:", error);
      return null;
    }
  };

  const generatePDF = async () => {
    try {
      setGenerating(true);
      const result = await generatePDFDocument();
      
      if (!result) {
        toast.error("Failed to generate report");
        return;
      }
      
      result.doc.save(result.fileName);
      toast.success("Report exported successfully");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const saveToDocuments = async () => {
    if (!subsectionId) {
      toast.error("Cannot save: subsection ID missing");
      return;
    }

    try {
      setSaving(true);
      toast.info("Saving report to documents...");

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Generate PDF
      const result = await generatePDFDocument();
      if (!result) {
        toast.error("Failed to generate report");
        return;
      }

      // Find or create "Inspection Reports" category
      const { data: categories } = await supabase
        .from("document_categories")
        .select("id, name")
        .eq("subsection_id", subsectionId);
      
      let categoryId = categories?.find(c => c.name === "Inspection Reports")?.id;
      
      if (!categoryId) {
        const { data: newCategory, error: categoryError } = await supabase
          .from("document_categories")
          .insert({ 
            name: "Inspection Reports", 
            subsection_id: subsectionId,
            order_index: (categories?.length || 0) + 1
          })
          .select()
          .single();
        
        if (categoryError) throw categoryError;
        categoryId = newCategory.id;
      }

      // Convert PDF to blob
      const pdfBlob = result.doc.output('blob');
      
      // Upload to storage
      const storagePath = `${subsectionId}/Inspection Reports/${result.fileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);

      // Create document record
      const { error: docError } = await supabase
        .from('subsection_documents')
        .insert({
          subsection_id: subsectionId,
          category_id: categoryId,
          file_name: result.fileName,
          file_url: urlData.publicUrl,
          file_size: pdfBlob.size,
          uploaded_by: user.id
        });

      if (docError) throw docError;

      toast.success("Inspection report saved to documents!");
    } catch (error) {
      console.error("Error saving report:", error);
      toast.error("Failed to save report to documents");
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
              <Button onClick={saveToDocuments} disabled={generating || saving} variant="outline">
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save to Documents"}
              </Button>
              <Button onClick={generatePDF} disabled={generating || saving}>
                <Download className="mr-2 h-4 w-4" />
                {generating ? "Generating..." : "Export PDF"}
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
    </div>
  );
};
