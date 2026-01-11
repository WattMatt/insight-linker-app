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
import { FileText, Plus, Download, ChevronLeft, ChevronRight, Eye, Edit, Zap, Sun, Gauge, HardDrive, ClipboardList, Map, Settings, Upload } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  addCoverPage,
  addStandardHeader,
  addFootersToAllPages,
  addSectionHeader,
  logComplianceCheck,
  RGB_COLORS,
  PAGE,
} from "@/lib/pdfUtils";
import { DOCUMENT_DESIGN_STANDARDS, getContentWidth } from "@/lib/documentDesignStandards";
import { TemplatePreviewRenderer } from "@/components/templates/TemplatePreviewRenderer";
import PDFTemplateUploader from "@/components/PDFTemplateUploader";
import PDFTemplateExportDialog from "@/components/PDFTemplateExportDialog";

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

const InspectionTemplates = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [previewTemplate, setPreviewTemplate] = useState<InspectionTemplate | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [exportTemplate, setExportTemplate] = useState<InspectionTemplate | null>(null);

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
            doc.text(`Status: ${mockStatus}`, margin + 7, yPos + labelHeight + 9);
            doc.setFont(undefined, 'normal');
            doc.text('Notes: This is a mock note for preview purposes', margin + 5, yPos + labelHeight + 16);
          } else if (item.type === 'text' || item.type === 'number') {
            doc.text(`Value: Sample ${item.type} value`, margin + 5, yPos + labelHeight + 8);
          } else if (item.type === 'textarea') {
            doc.text('Notes:', margin + 5, yPos + labelHeight + 8);
            doc.text('This is a sample note for preview purposes.', margin + 5, yPos + labelHeight + 14);
            doc.text('Actual field will contain inspector notes.', margin + 5, yPos + labelHeight + 19);
          } else if (item.type === 'image') {
            doc.setDrawColor(150, 150, 150);
            doc.setFillColor(250, 250, 250);
            doc.rect(margin + 5, yPos + labelHeight + 5, 40, 30, 'FD');
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('Photo', margin + 25, yPos + labelHeight + 22, { align: 'center' });
            doc.text('Placeholder', margin + 25, yPos + labelHeight + 27, { align: 'center' });
            doc.setTextColor(0, 0, 0);
          } else if (item.type === 'select' && (item as any).options) {
            doc.setFillColor(230, 240, 255);
            doc.rect(margin + 5, yPos + labelHeight + 5, 35, 6, 'F');
            doc.setFont(undefined, 'bold');
            doc.text(`Selected: ${(item as any).options[0]}`, margin + 7, yPos + labelHeight + 9);
          } else if (item.type === 'checkbox') {
            doc.setDrawColor(100, 100, 100);
            doc.setLineWidth(0.5);
            doc.rect(margin + 5, yPos + labelHeight + 5, 4, 4, 'S');
            doc.setFillColor(41, 128, 185);
            doc.rect(margin + 6, yPos + labelHeight + 6, 2, 2, 'F');
            doc.setFont(undefined, 'normal');
            doc.text('Checked', margin + 11, yPos + labelHeight + 9);
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {currentTemplates.map((template) => {
              const categoryConfig = TEMPLATE_CATEGORIES.find(c => c.value === template.category);
              const CategoryIcon = categoryConfig?.icon || FileText;
              
              return (
                <Card key={template.id} className="hover:shadow-lg transition-shadow group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className={`p-2 rounded-lg ${categoryConfig?.color || 'bg-gray-500'} text-white`}>
                        <CategoryIcon className="h-4 w-4" />
                      </div>
                      <Badge 
                        variant="secondary" 
                        className={`${categoryConfig?.color || 'bg-gray-500'} text-white border-0`}
                      >
                        {template.category}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg group-hover:text-primary transition-colors">{template.name}</CardTitle>
                    {template.description && (
                      <CardDescription className="line-clamp-2">
                        {template.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Category-colored preview area */}
                    <div className={`w-full h-40 rounded-md overflow-hidden flex items-center justify-center relative ${categoryConfig?.color || 'bg-gray-500'} bg-opacity-10`}>
                      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/5"></div>
                      {template.cover_page?.logo_url ? (
                        <img 
                          src={template.cover_page.logo_url} 
                          alt={template.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center">
                          <CategoryIcon className={`h-12 w-12 mx-auto mb-2 opacity-50`} style={{ color: categoryConfig?.color?.replace('bg-', '#').replace('-500', '') || '#6b7280' }} />
                          <p className="text-xs text-muted-foreground font-medium">{template.category}</p>
                        </div>
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
                      onClick={() => {
                        console.log('Preview clicked for template:', {
                          name: template.name,
                          hasSections: Array.isArray(template.sections),
                          sectionsCount: template.sections?.length || 0,
                          sections: template.sections
                        });
                        setPreviewTemplate(template);
                      }}
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
