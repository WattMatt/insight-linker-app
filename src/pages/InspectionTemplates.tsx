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
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);

      // Mock data for realistic preview
      const mockDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const mockData = {
        projectName: 'Preview Project',
        inspectorName: 'Preview Inspector',
        clientRep: 'Mock Client Rep',
        consultant: 'Mock Consultant',
        contractor: 'Mock Contractor',
        location: 'Site Location Address',
        date: mockDate
      };

      // Cover Page
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      // Logo placeholder
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(2);
      doc.rect(pageWidth / 2 - 25, 30, 50, 30);
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('COMPANY LOGO', pageWidth / 2, 48, { align: 'center' });
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(32);
      doc.setFont(undefined, 'bold');
      doc.text(template.name, pageWidth / 2, 95, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setFont(undefined, 'normal');
      doc.text(template.cover_page?.subtitle || template.category, pageWidth / 2, 110, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text(`Date of Report: ${mockDate}`, pageWidth / 2, 130, { align: 'center' });
      doc.text(`Inspector: ${mockData.inspectorName}`, pageWidth / 2, 140, { align: 'center' });
      doc.text(`Project Name: ${mockData.projectName}`, pageWidth / 2, 150, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(template.cover_page?.company_name || 'Watson Mattheus', pageWidth / 2, pageHeight - 20, { align: 'center' });

      // General Information Page
      doc.addPage();
      doc.setTextColor(0, 0, 0);
      
      // Section header with background
      doc.setFillColor(240, 240, 240);
      doc.rect(0, 10, pageWidth, 15, 'F');
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text('General Information', pageWidth / 2, 20, { align: 'center' });
      
      // General info table
      let yPos = 35;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      
      const genInfo = [
        ['PROJECT NAME:', mockData.projectName],
        ['INSPECTOR NAME:', mockData.inspectorName],
        ['INSPECTION DATE:', mockDate],
        ['CLIENT REPRESENTATIVE:', mockData.clientRep],
        ['CONSULTANT NAME:', mockData.consultant],
        ['CONTRACTOR NAME:', mockData.contractor],
        ['LOCATION:', mockData.location]
      ];
      
      genInfo.forEach(([label, value]) => {
        doc.setFont(undefined, 'bold');
        doc.text(label, margin, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(value, margin + 60, yPos);
        yPos += 8;
      });

      // Section pages with mock data
      template.sections?.forEach((section, sectionIdx) => {
        doc.addPage();
        
        // Section header
        doc.setFillColor(41, 128, 185);
        doc.rect(0, 10, pageWidth, 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(section.name.toUpperCase(), pageWidth / 2, 20, { align: 'center' });
        
        doc.setTextColor(0, 0, 0);
        yPos = 35;
        
        section.items?.forEach((item, itemIdx) => {
          // Check if we need a new page
          if (yPos > pageHeight - 60) {
            doc.addPage();
            
            // Continuation header
            doc.setFillColor(240, 240, 240);
            doc.rect(0, 10, pageWidth, 10, 'F');
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text(`${section.name} (cont)`, pageWidth / 2, 17, { align: 'center' });
            
            yPos = 30;
          }
          
          // Item box
          const boxHeight = item.type === 'image' ? 50 : (item.type === 'textarea' ? 35 : 25);
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.5);
          doc.rect(margin, yPos, contentWidth, boxHeight);
          
          // Item number and label
          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          const itemLabel = `${itemIdx + 1}. ${item.name}`;
          const splitLabel = doc.splitTextToSize(itemLabel, contentWidth - 10);
          doc.text(splitLabel, margin + 5, yPos + 6);
          
          const labelHeight = splitLabel.length * 5;
          
          // Mock value based on type
          doc.setFont(undefined, 'normal');
          doc.setFontSize(9);
          
          if (item.type === 'checklist') {
            const mockStatus = ['Pass', 'N/A', 'Pass'][itemIdx % 3];
            doc.setFillColor(mockStatus === 'Pass' ? 220 : 240, mockStatus === 'Pass' ? 240 : 240, mockStatus === 'Pass' ? 220 : 240);
            doc.rect(margin + 5, yPos + labelHeight + 5, 30, 6, 'F');
            doc.setFont(undefined, 'bold');
            doc.text(`Value for ${mockStatus}`, margin + 7, yPos + labelHeight + 9);
            doc.setFont(undefined, 'normal');
            doc.text(`Notes: This is a mock note for ${item.name}`, margin + 5, yPos + labelHeight + 16);
          } else if (item.type === 'text' || item.type === 'number') {
            doc.text(`Value for ${item.name}`, margin + 5, yPos + labelHeight + 8);
          } else if (item.type === 'textarea') {
            doc.text('Notes:', margin + 5, yPos + labelHeight + 8);
            doc.text(`This is a mock note for ${item.name}`, margin + 5, yPos + labelHeight + 14);
          } else if (item.type === 'image') {
            doc.setDrawColor(150, 150, 150);
            doc.setFillColor(250, 250, 250);
            doc.rect(margin + 5, yPos + labelHeight + 5, 40, 30, 'FD');
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('Photo', margin + 25, yPos + labelHeight + 22, { align: 'center' });
            doc.text('Placeholder', margin + 25, yPos + labelHeight + 27, { align: 'center' });
            doc.setTextColor(0, 0, 0);
          }
          
          yPos += boxHeight + 5;
        });
      });

      // Add page numbers to all content pages
      const totalPages = doc.getNumberOfPages();
      for (let i = 2; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `${template.name} - Page ${i - 1}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }

      doc.save(`${template.name.replace(/\s+/g, '_')}_Preview.pdf`);
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

      {/* Template Preview Dialog - WYSIWYG PDF Preview */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              PDF Preview: {previewTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Exact preview of the generated PDF report
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[65vh]">
            <div className="space-y-4 pb-4">
              {previewTemplate && (
                <>
                  {/* Cover Page */}
                  <div className="bg-[#2980b9] text-white aspect-[210/297] p-8 flex flex-col items-center justify-center relative shadow-lg">
                    {/* Logo placeholder */}
                    <div className="absolute top-8 border-2 border-white w-20 h-12 flex items-center justify-center">
                      <span className="text-[8px]">COMPANY LOGO</span>
                    </div>
                    
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                      <h1 className="text-3xl font-bold text-center">{previewTemplate.name}</h1>
                      <p className="text-lg text-center">{previewTemplate.cover_page?.subtitle || previewTemplate.category}</p>
                      <div className="space-y-1 text-center mt-6">
                        <p className="text-sm">Date of Report: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p className="text-sm">Inspector: Preview Inspector</p>
                        <p className="text-sm">Project Name: Preview Project</p>
                      </div>
                    </div>
                    
                    <p className="text-xs absolute bottom-6">{previewTemplate.cover_page?.company_name || 'Watson Mattheus'}</p>
                  </div>

                  {/* General Information Page */}
                  <div className="bg-white aspect-[210/297] p-8 border shadow-lg relative">
                    <div className="bg-gray-100 -mx-8 px-8 py-3 mb-6">
                      <h2 className="text-lg font-bold text-center">General Information</h2>
                    </div>
                    
                    <div className="space-y-3 text-sm">
                      <div className="flex">
                        <span className="font-bold w-48">PROJECT NAME:</span>
                        <span>Preview Project</span>
                      </div>
                      <div className="flex">
                        <span className="font-bold w-48">INSPECTOR NAME:</span>
                        <span>Preview Inspector</span>
                      </div>
                      <div className="flex">
                        <span className="font-bold w-48">INSPECTION DATE:</span>
                        <span>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                      </div>
                      <div className="flex">
                        <span className="font-bold w-48">CLIENT REPRESENTATIVE:</span>
                        <span>Mock Client Rep</span>
                      </div>
                      <div className="flex">
                        <span className="font-bold w-48">CONSULTANT NAME:</span>
                        <span>Mock Consultant</span>
                      </div>
                      <div className="flex">
                        <span className="font-bold w-48">CONTRACTOR NAME:</span>
                        <span>Mock Contractor</span>
                      </div>
                      <div className="flex">
                        <span className="font-bold w-48">LOCATION:</span>
                        <span>Site Location Address</span>
                      </div>
                    </div>
                    
                    <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-gray-500">
                      {previewTemplate.name} - Page 1
                    </div>
                  </div>

                  {/* Section Pages */}
                  {previewTemplate.sections?.map((section, sectionIdx) => (
                    <div key={section.id} className="bg-white aspect-[210/297] p-8 border shadow-lg relative">
                      <div className="bg-[#2980b9] text-white -mx-8 px-8 py-3 mb-6">
                        <h2 className="text-sm font-bold text-center uppercase">{section.name}</h2>
                      </div>
                      
                      <div className="space-y-3">
                        {section.items?.slice(0, 4).map((item, itemIdx) => (
                          <div key={item.id} className="border border-gray-300 p-3">
                            <div className="font-bold text-xs mb-2">
                              {itemIdx + 1}. {item.name}
                            </div>
                            
                            {item.type === 'checklist' && (
                              <div className="space-y-1">
                                <div className="bg-green-50 inline-block px-3 py-1 text-xs font-bold">
                                  Value for {['Pass', 'N/A', 'Pass'][itemIdx % 3]}
                                </div>
                                <p className="text-xs text-gray-600 mt-2">
                                  Notes: This is a mock note for {item.name}
                                </p>
                              </div>
                            )}
                            
                            {(item.type === 'text' || item.type === 'number') && (
                              <div className="text-xs">
                                Value for {item.name}
                              </div>
                            )}
                            
                            {item.type === 'textarea' && (
                              <div className="space-y-1">
                                <p className="text-xs font-semibold">Notes:</p>
                                <p className="text-xs text-gray-600">
                                  This is a mock note for {item.name}
                                </p>
                              </div>
                            )}
                            
                            {item.type === 'image' && (
                              <div className="border border-gray-300 bg-gray-50 w-32 h-24 flex flex-col items-center justify-center">
                                <span className="text-[10px] text-gray-400">Photo</span>
                                <span className="text-[10px] text-gray-400">Placeholder</span>
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {section.items && section.items.length > 4 && (
                          <div className="text-center text-xs text-gray-500 italic py-2">
                            ... and {section.items.length - 4} more items
                          </div>
                        )}
                      </div>
                      
                      <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-gray-500">
                        {previewTemplate.name} - Page {sectionIdx + 2}
                      </div>
                    </div>
                  ))}
                </>
              )}
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
