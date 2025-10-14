import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Plus, Download, ChevronLeft, ChevronRight, Eye } from "lucide-react";
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
  sections_count: number;
  pages_count: number;
  created_at?: string;
  sections?: TemplateSection[];
  cover_page?: {
    title: string;
    subtitle: string;
    company_name: string;
    logo_url?: string;
  };
}

const ITEMS_PER_PAGE = 9;

const InspectionTemplates = () => {
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewTemplate, setPreviewTemplate] = useState<InspectionTemplate | null>(null);

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
      
      // Type cast the data to match our interface
      const typedData = (data || []).map(template => ({
        ...template,
        sections: template.sections as unknown as TemplateSection[],
        cover_page: template.cover_page as unknown as {
          title: string;
          subtitle: string;
          company_name: string;
          logo_url?: string;
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

  const generatePDF = async (template: InspectionTemplate) => {
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
      doc.text(template.cover_page?.title || 'Inspection Report', pageWidth / 2, 80, { align: 'center' });
      
      doc.setFontSize(18);
      doc.setFont(undefined, 'normal');
      doc.text(template.cover_page?.subtitle || template.name, pageWidth / 2, 100, { align: 'center' });
      
      doc.setFontSize(14);
      doc.text(template.cover_page?.company_name || 'Watson Mattheus', pageWidth / 2, 120, { align: 'center' });
      
      doc.setFontSize(12);
      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      doc.text(`Generated: ${date}`, pageWidth / 2, 140, { align: 'center' });

      // Add new page for content
      doc.addPage();
      doc.setTextColor(0, 0, 0);
      
      // Template Details
      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      doc.text(template.name, 20, 20);
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      doc.text(`Category: ${template.category}`, 20, 35);
      
      if (template.description) {
        doc.setFontSize(11);
        const splitDescription = doc.splitTextToSize(template.description, pageWidth - 40);
        doc.text(splitDescription, 20, 45);
      }

      // Template Statistics
      let yPosition = template.description ? 65 : 50;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('Template Overview', 20, yPosition);
      
      yPosition += 10;
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.text(`• Total Sections: ${template.sections_count}`, 25, yPosition);
      yPosition += 7;
      doc.text(`• Estimated Pages: ${template.pages_count}`, 25, yPosition);
      yPosition += 7;
      doc.text(`• Template ID: ${template.id}`, 25, yPosition);

      // Sections Table
      if (template.sections && template.sections.length > 0) {
        yPosition += 15;
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Inspection Sections', 20, yPosition);
        
        yPosition += 5;
        const tableData = template.sections.map((section, index) => [
          (index + 1).toString(),
          section.name,
          section.items?.length.toString() || '0',
          section.items?.filter(i => i.required).length.toString() || '0'
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [['#', 'Section Name', 'Items', 'Required']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [41, 128, 185], textColor: 255 },
          styles: { fontSize: 10 },
          margin: { left: 20, right: 20 },
        });
      }

      // Footer on all pages
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(128, 128, 128);
        if (i > 1) { // Skip footer on cover page
          doc.text(
            `Page ${i - 1} of ${totalPages - 1}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
        }
      }

      doc.save(`${template.name.replace(/\s+/g, '_')}_Template.pdf`);
      toast.success("PDF exported successfully");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const groupedTemplates = templates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, InspectionTemplate[]>);

  // Pagination
  const totalPages = Math.ceil(templates.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentTemplates = templates.slice(startIndex, endIndex);

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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first inspection template to streamline your workflow
            </p>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {currentTemplates.map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <Badge variant="secondary">{template.category}</Badge>
                  </div>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  {template.description && (
                    <CardDescription className="line-clamp-2">
                      {template.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <div>
                      <span className="font-semibold text-foreground">
                        {template.sections_count}
                      </span>{" "}
                      Sections
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        {template.pages_count}
                      </span>{" "}
                      Pages
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => setPreviewTemplate(template)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => generatePDF(template)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
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
            Showing {startIndex + 1}-{Math.min(endIndex, templates.length)} of {templates.length} templates
          </div>
        </>
      )}

      {/* Template Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {previewTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              {previewTemplate?.description}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Cover Page Preview */}
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                  <CardTitle className="text-base">Cover Page</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="text-sm font-medium">Title:</span>
                    <p className="text-sm text-muted-foreground">{previewTemplate?.cover_page?.title}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Subtitle:</span>
                    <p className="text-sm text-muted-foreground">{previewTemplate?.cover_page?.subtitle}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Company:</span>
                    <p className="text-sm text-muted-foreground">{previewTemplate?.cover_page?.company_name}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Template Metadata */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{previewTemplate?.sections_count}</p>
                      <p className="text-sm text-muted-foreground">Sections</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{previewTemplate?.pages_count}</p>
                      <p className="text-sm text-muted-foreground">Est. Pages</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <Badge variant="secondary" className="text-sm">{previewTemplate?.category}</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Category</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sections Preview */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Template Sections</h3>
                {previewTemplate?.sections?.map((section, idx) => (
                  <Card key={section.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          {idx + 1}. {section.name}
                        </CardTitle>
                        <Badge variant="outline">
                          {section.items?.length || 0} items
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {section.items?.map((item, itemIdx) => (
                          <div 
                            key={item.id} 
                            className="flex items-start gap-3 p-2 rounded border bg-muted/30"
                          >
                            <span className="text-xs font-medium text-muted-foreground min-w-[24px]">
                              {itemIdx + 1}.
                            </span>
                            <div className="flex-1">
                              <p className="text-sm">{item.name}</p>
                              <div className="flex gap-2 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {item.type}
                                </Badge>
                                {item.required && (
                                  <Badge variant="outline" className="text-xs">
                                    Required
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
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
