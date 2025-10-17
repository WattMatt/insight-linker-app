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
import { FileText, Plus, Download, ChevronLeft, ChevronRight, Eye, Edit } from "lucide-react";
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

// Predefined template categories
const TEMPLATE_CATEGORIES = [
  { value: "all", label: "All Templates" },
  { value: "General", label: "General" },
  { value: "Medium Voltage", label: "Medium Voltage" },
  { value: "Low Voltage", label: "Low Voltage" },
  { value: "Generator", label: "Generator" },
  { value: "Solar", label: "Solar" },
  { value: "Progress", label: "Progress" },
  { value: "Site Drawing", label: "Site Drawing" },
] as const;

const InspectionTemplates = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("all");
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

      // Cover Page - Professional & Ink-Friendly
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      
      // Top border accent
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, 8, 'F');
      
      // Logo placeholder
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(1);
      doc.rect(pageWidth / 2 - 30, 25, 60, 30, 'S');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('COMPANY LOGO', pageWidth / 2, 43, { align: 'center' });
      
      // Main title
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(28);
      doc.setFont(undefined, 'bold');
      const titleLines = doc.splitTextToSize(template.name, pageWidth - 40);
      doc.text(titleLines, pageWidth / 2, 75, { align: 'center' });
      
      // Subtitle with light background
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, 95, contentWidth, 12, 'F');
      doc.setFontSize(14);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(template.cover_page?.subtitle || template.category, pageWidth / 2, 103, { align: 'center' });
      
      // Information box
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(margin + 10, 120, contentWidth - 20, 55, 'S');
      
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      let infoY = 130;
      
      doc.text('Report Date:', margin + 15, infoY);
      doc.setFont(undefined, 'normal');
      doc.text(mockDate, margin + 60, infoY);
      
      infoY += 10;
      doc.setFont(undefined, 'bold');
      doc.text('Inspector:', margin + 15, infoY);
      doc.setFont(undefined, 'normal');
      doc.text(mockData.inspectorName, margin + 60, infoY);
      
      infoY += 10;
      doc.setFont(undefined, 'bold');
      doc.text('Project:', margin + 15, infoY);
      doc.setFont(undefined, 'normal');
      doc.text(mockData.projectName, margin + 60, infoY);
      
      infoY += 10;
      doc.setFont(undefined, 'bold');
      doc.text('Location:', margin + 15, infoY);
      doc.setFont(undefined, 'normal');
      doc.text(mockData.location, margin + 60, infoY);
      
      // Bottom section
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, pageHeight - 35, pageWidth - margin, pageHeight - 35);
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(template.cover_page?.company_name || 'Watson Mattheus', pageWidth / 2, pageHeight - 25, { align: 'center' });
      
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('Inspection & Compliance Report', pageWidth / 2, pageHeight - 18, { align: 'center' });
      
      // Bottom border accent
      doc.setFillColor(41, 128, 185);
      doc.rect(0, pageHeight - 8, pageWidth, 8, 'F');

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

      // Tenants section if template has tenants
      if (template.tenants && template.tenants.length > 0) {
        doc.addPage();
        
        // Tenants header
        doc.setFillColor(41, 128, 185);
        doc.rect(0, 10, pageWidth, 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('TENANT INFORMATION', pageWidth / 2, 20, { align: 'center' });
        
        doc.setTextColor(0, 0, 0);
        yPos = 35;
        
        template.tenants.forEach((tenant, tenantIdx) => {
          // Check if we need a new page
          if (yPos > pageHeight - 100) {
            doc.addPage();
            doc.setFillColor(240, 240, 240);
            doc.rect(0, 10, pageWidth, 10, 'F');
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text('Tenant Information (cont)', pageWidth / 2, 17, { align: 'center' });
            yPos = 30;
          }
          
          // Tenant box
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.5);
          doc.rect(margin, yPos, contentWidth, 60);
          
          // Tenant header
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.text(`Tenant ${tenantIdx + 1}: ${tenant.shopName || 'N/A'}`, margin + 5, yPos + 7);
          
          // Tenant details
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          let detailY = yPos + 15;
          
          doc.setFont(undefined, 'bold');
          doc.text('Shop Number:', margin + 5, detailY);
          doc.setFont(undefined, 'normal');
          doc.text(tenant.shopNumber || 'N/A', margin + 40, detailY);
          
          detailY += 7;
          doc.setFont(undefined, 'bold');
          doc.text('Breaker Size:', margin + 5, detailY);
          doc.setFont(undefined, 'normal');
          doc.text(tenant.breakerSize || 'N/A', margin + 40, detailY);
          
          detailY += 7;
          doc.setFont(undefined, 'bold');
          doc.text('CT Size & Ratio:', margin + 5, detailY);
          doc.setFont(undefined, 'normal');
          doc.text(tenant.ctSizeAndRatio || 'N/A', margin + 40, detailY);
          
          // Image placeholders
          detailY += 10;
          doc.setDrawColor(150, 150, 150);
          doc.setFillColor(250, 250, 250);
          
          // Breaker image placeholder
          doc.rect(margin + 5, detailY, 30, 20, 'FD');
          doc.setFontSize(7);
          doc.setTextColor(150, 150, 150);
          doc.text('Breaker', margin + 20, detailY + 8, { align: 'center' });
          doc.text('Image', margin + 20, detailY + 12, { align: 'center' });
          
          // CT Ratio image placeholder
          doc.rect(margin + 40, detailY, 30, 20, 'FD');
          doc.text('CT Ratio', margin + 55, detailY + 8, { align: 'center' });
          doc.text('Image', margin + 55, detailY + 12, { align: 'center' });
          
          doc.setTextColor(0, 0, 0);
          yPos += 65;
        });
      }

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
        <Button onClick={() => navigate("/inspection-templates/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="space-y-4">
        <TabsList className="grid w-full grid-cols-8">
          {TEMPLATE_CATEGORIES.map((category) => (
            <TabsTrigger key={category.value} value={category.value}>
              {category.label}
            </TabsTrigger>
          ))}
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {currentTemplates.map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
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
                  {/* Uniform template preview image */}
                  <div className="w-full h-40 bg-muted rounded-md overflow-hidden flex items-center justify-center">
                    {template.cover_page?.logo_url ? (
                      <img 
                        src={template.cover_page.logo_url} 
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FileText className="h-16 w-16 text-muted-foreground" />
                    )}
                  </div>
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
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/inspection-templates/${template.id}/edit`)}
                    >
                      <Edit className="h-4 w-4" />
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
            Showing {startIndex + 1}-{Math.min(endIndex, filteredTemplates.length)} of {filteredTemplates.length} templates
          </div>
            </>
            )}
          </TabsContent>
        ))}
      </Tabs>

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
                  {/* Cover Page - Professional & Ink-Friendly */}
                  <div className="bg-white aspect-[210/297] border shadow-lg relative">
                    {/* Top accent bar */}
                    <div className="bg-[#2980b9] h-2 w-full"></div>
                    
                    {/* Logo placeholder */}
                    <div className="absolute top-6 left-1/2 transform -translate-x-1/2 border-2 border-gray-300 w-24 h-12 flex items-center justify-center">
                      <span className="text-[10px] text-gray-400">COMPANY LOGO</span>
                    </div>
                    
                    <div className="pt-24 px-12 flex flex-col items-center">
                      <h1 className="text-3xl font-bold text-center text-gray-900 mb-4">{previewTemplate.name}</h1>
                      
                      <div className="bg-gray-50 w-full py-3 text-center mb-8">
                        <p className="text-base text-gray-700">{previewTemplate.cover_page?.subtitle || previewTemplate.category}</p>
                      </div>
                      
                      {/* Information box */}
                      <div className="border border-gray-300 w-full p-6 space-y-3 text-sm">
                        <div className="flex">
                          <span className="font-bold text-gray-900 w-32">Report Date:</span>
                          <span className="text-gray-700">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold text-gray-900 w-32">Inspector:</span>
                          <span className="text-gray-700">Preview Inspector</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold text-gray-900 w-32">Project:</span>
                          <span className="text-gray-700">Preview Project</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold text-gray-900 w-32">Location:</span>
                          <span className="text-gray-700">Site Location Address</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Bottom section */}
                    <div className="absolute bottom-12 left-0 right-0 px-12">
                      <div className="border-t border-gray-300 pt-4 text-center">
                        <p className="font-bold text-gray-900 text-sm">{previewTemplate.cover_page?.company_name || 'Watson Mattheus'}</p>
                        <p className="text-xs text-gray-600 mt-1">Inspection & Compliance Report</p>
                      </div>
                    </div>
                    
                    {/* Bottom accent bar */}
                    <div className="bg-[#2980b9] h-2 w-full absolute bottom-0"></div>
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
                  {Array.isArray(previewTemplate.sections) && previewTemplate.sections.map((section, sectionIdx) => (
                    <div key={`section-${section.id}`} className="bg-white aspect-[210/297] p-8 border shadow-lg relative">
                      <div className="bg-[#2980b9] text-white -mx-8 px-8 py-3 mb-6">
                        <h2 className="text-sm font-bold text-center uppercase">{section.name}</h2>
                      </div>
                      
                      <div className="space-y-4">
                        {section.items?.map((item, itemIdx) => (
                          <div key={item.id} className="border border-gray-300 p-4">
                            <div className="font-bold text-sm mb-3 text-gray-900">
                              {itemIdx + 1}. {item.name}
                            </div>
                            
                            {(item.type === 'checkbox' || item.type === 'checklist') && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-gray-700">Status:</span>
                                  <div className={`inline-block px-3 py-1 text-xs font-bold rounded ${
                                    ['bg-green-100 text-green-800', 'bg-gray-100 text-gray-800', 'bg-red-100 text-red-800'][itemIdx % 3]
                                  }`}>
                                    {['✓ PASS', 'N/A', '✗ FAIL'][itemIdx % 3]}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-gray-700">Notes:</p>
                                  <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                    Inspection completed on site. {item.name} has been thoroughly checked and documented. All safety protocols followed.
                                  </p>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-32 flex flex-col items-center justify-center rounded">
                                    <div className="text-gray-400 text-center">
                                      <div className="text-[10px] font-semibold mb-1">PHOTO {itemIdx * 2 + 1}</div>
                                      <div className="text-[8px]">Image Placeholder</div>
                                      <div className="text-[8px] text-gray-400">1024x768</div>
                                    </div>
                                  </div>
                                  <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-32 flex flex-col items-center justify-center rounded">
                                    <div className="text-gray-400 text-center">
                                      <div className="text-[10px] font-semibold mb-1">PHOTO {itemIdx * 2 + 2}</div>
                                      <div className="text-[8px]">Image Placeholder</div>
                                      <div className="text-[8px] text-gray-400">1024x768</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {item.type === 'text' && (
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <span className="text-xs font-semibold text-gray-700 min-w-[60px]">Value:</span>
                                  <span className="text-xs text-gray-900 bg-gray-50 px-3 py-1 rounded flex-1">
                                    Sample text value for {item.name}
                                  </span>
                                </div>
                              </div>
                            )}
                            
                            {item.type === 'number' && (
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <span className="text-xs font-semibold text-gray-700 min-w-[60px]">Value:</span>
                                  <span className="text-xs text-gray-900 bg-gray-50 px-3 py-1 rounded">
                                    {Math.floor(Math.random() * 100) + 50} units
                                  </span>
                                </div>
                                <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-32 flex flex-col items-center justify-center rounded">
                                  <div className="text-gray-400 text-center">
                                    <div className="text-[10px] font-semibold mb-1">PHOTO {itemIdx + 1}</div>
                                    <div className="text-[8px]">Image Placeholder</div>
                                    <div className="text-[8px] text-gray-400">1024x768</div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {item.type === 'textarea' && (
                              <div className="space-y-2">
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-gray-700">Detailed Notes:</p>
                                  <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded leading-relaxed">
                                    Comprehensive inspection notes for {item.name}. All components have been visually inspected and tested according to the standard procedures. Documentation has been completed and all measurements recorded. Additional observations noted during the inspection process.
                                  </p>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                  <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-32 flex flex-col items-center justify-center rounded">
                                    <div className="text-gray-400 text-center">
                                      <div className="text-[9px] font-semibold mb-1">PHOTO A</div>
                                      <div className="text-[7px]">Placeholder</div>
                                    </div>
                                  </div>
                                  <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-32 flex flex-col items-center justify-center rounded">
                                    <div className="text-gray-400 text-center">
                                      <div className="text-[9px] font-semibold mb-1">PHOTO B</div>
                                      <div className="text-[7px]">Placeholder</div>
                                    </div>
                                  </div>
                                  <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-32 flex flex-col items-center justify-center rounded">
                                    <div className="text-gray-400 text-center">
                                      <div className="text-[9px] font-semibold mb-1">PHOTO C</div>
                                      <div className="text-[7px]">Placeholder</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {item.type === 'image' && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-gray-700">Photo Documentation:</p>
                                <div className="border-2 border-dashed border-gray-300 bg-gray-50 w-full h-32 flex flex-col items-center justify-center rounded">
                                  <div className="text-gray-400 text-center">
                                    <div className="text-sm font-semibold mb-2">PHOTO {itemIdx + 1}</div>
                                    <div className="text-xs">Image Placeholder</div>
                                    <div className="text-xs text-gray-400 mt-1">1024x768 pixels</div>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                  Caption: Photo taken during inspection of {item.name}
                                </p>
                              </div>
                            )}
                            
                            {item.type === 'select' && (
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <span className="text-xs font-semibold text-gray-700 min-w-[80px]">Selected:</span>
                                  <span className="text-xs text-gray-900 bg-gray-50 px-3 py-1 rounded">
                                    Option {itemIdx + 1}
                                  </span>
                                </div>
                                <div className="text-[10px] text-gray-500 mt-1">
                                  Available options: {item.options?.join(', ') || 'Option 1, Option 2, Option 3'}
                                </div>
                              </div>
                            )}
                            
                            {/* Fallback for any unhandled field types */}
                            {!['checkbox', 'checklist', 'text', 'number', 'textarea', 'image', 'select'].includes(item.type) && (
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <span className="text-xs font-semibold text-gray-700">Type:</span>
                                  <span className="text-xs text-gray-900 bg-yellow-50 px-3 py-1 rounded">
                                    {item.type} (Preview not implemented)
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-gray-500">
                        {previewTemplate.name} - Page {sectionIdx + 2}
                      </div>
                    </div>
                  ))}

                  {/* Tenants Page */}
                  {previewTemplate.tenants && previewTemplate.tenants.length > 0 && (
                    <div className="bg-white aspect-[210/297] p-8 border shadow-lg relative">
                      <div className="bg-[#2980b9] text-white -mx-8 px-8 py-3 mb-6">
                        <h2 className="text-sm font-bold text-center uppercase">Tenant Information</h2>
                      </div>
                      
                      <div className="space-y-4">
                        {previewTemplate.tenants.map((tenant, tenantIdx) => (
                          <div key={tenant.id} className="border border-gray-300 p-4">
                            <div className="font-bold text-sm mb-3 text-gray-900">
                              Tenant {tenantIdx + 1}: {tenant.shopName || 'N/A'}
                            </div>
                            
                            <div className="space-y-2 text-xs">
                              <div className="flex">
                                <span className="font-bold w-32">Shop Number:</span>
                                <span>{tenant.shopNumber || 'N/A'}</span>
                              </div>
                              <div className="flex">
                                <span className="font-bold w-32">Breaker Size:</span>
                                <span>{tenant.breakerSize || 'N/A'}</span>
                              </div>
                              <div className="flex">
                                <span className="font-bold w-32">CT Size & Ratio:</span>
                                <span>{tenant.ctSizeAndRatio || 'N/A'}</span>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-xs font-semibold text-gray-700 mb-1">Breaker Image:</p>
                                <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-32 flex flex-col items-center justify-center rounded">
                                  <div className="text-gray-400 text-center">
                                    <div className="text-[10px] font-semibold mb-1">BREAKER</div>
                                    <div className="text-[8px]">Image Placeholder</div>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-700 mb-1">CT Ratio Image:</p>
                                <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-32 flex flex-col items-center justify-center rounded">
                                  <div className="text-gray-400 text-center">
                                    <div className="text-[10px] font-semibold mb-1">CT RATIO</div>
                                    <div className="text-[8px]">Image Placeholder</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-gray-500">
                        {previewTemplate.name} - Tenants Page
                      </div>
                    </div>
                  )}
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
