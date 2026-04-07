import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Eye, Camera, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import { generatePdfShiftInspectionReport, InspectionReportData } from "@/lib/pdfshiftInspectionReport";

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
      photos?: string[]; // Support for photographic evidence
    };
  };
}

interface TemplateBasedReportProps {
  subsectionId: string;
  subsectionName: string;
  siteName: string;
  clientName?: string;
  siteLogoUrl?: string;
}

export const TemplateBasedReport = ({ 
  subsectionId, 
  subsectionName, 
  siteName,
  clientName,
  siteLogoUrl
}: TemplateBasedReportProps) => {
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<InspectionTemplate | null>(null);
  const [reportData, setReportData] = useState<ReportData>({});
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [previewBlob, setPreviewBlob] = useState<Blob | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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

  const handlePhotoUpload = async (sectionId: string, itemId: string, file: File) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${subsectionId}/${sectionId}/${itemId}/${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      setReportData(prev => {
        const sectionData = prev[sectionId] || {};
        const itemData = sectionData[itemId] || {};
        const existingPhotos = itemData.photos || [];

        return {
          ...prev,
          [sectionId]: {
            ...sectionData,
            [itemId]: {
              ...itemData,
              photos: [...existingPhotos, publicUrl]
            }
          }
        };
      });

      toast.success("Photo uploaded successfully");
    } catch (error) {
      console.error("Error uploading photo:", error);
      toast.error("Failed to upload photo");
    }
  };

  const handleRemovePhoto = (sectionId: string, itemId: string, photoIndex: number) => {
    setReportData(prev => {
      const sectionData = prev[sectionId] || {};
      const itemData = sectionData[itemId] || {};
      const photos = [...(itemData.photos || [])];
      photos.splice(photoIndex, 1);

      return {
        ...prev,
        [sectionId]: {
          ...sectionData,
          [itemId]: {
            ...itemData,
            photos
          }
        }
      };
    });
  };

  const handlePreviewReport = async () => {
    if (!selectedTemplate) return;

    setIsGenerating(true);
    try {
      // Build sections data with photos for pdfmake
      const sectionsForPdf = selectedTemplate.sections?.map((section) => ({
        title: section.name,
        items: section.items?.map((item) => {
          const itemData = reportData[section.id]?.[item.id] || {};
          return {
            label: item.name,
            value: itemData.status || 'N/A',
            type: item.type || 'text',
            notes: itemData.notes || '',
            photos: itemData.photos || [], // Include photographic evidence
          };
        }) || [],
      })) || [];

      // Count total photos for summary
      const totalPhotos = sectionsForPdf.reduce((sum, section) => 
        sum + section.items.reduce((itemSum, item) => itemSum + (item.photos?.length || 0), 0), 0
      );

      console.log(`[TemplateBasedReport] Generating pdfmake report with ${totalPhotos} photos`);

      const inspectionData: InspectionReportData = {
        inspectionId: `template-${selectedTemplate.id}`,
        templateName: selectedTemplate.name,
        status: 'completed',
        sections: sectionsForPdf,
        snags: [], // Template-based reports don't have snags
        subsectionName,
        inspectionDate: new Date().toISOString(),
      };

      // Generate using PDFShift (server-side with pre-embedded Base64 images)
      const result = await generatePdfShiftInspectionReport({
        inspection: inspectionData,
        siteName,
        clientName,
        siteLogoUrl,
      });

      if (result.success && result.previewUrl) {
        setPreviewUrl(result.previewUrl);
        setPreviewFileName(`${subsectionName}_${selectedTemplate.name}_Report.pdf`);
        setPreviewBlob(result.blob);
        setPreviewOpen(true);
      } else {
        toast.error(result.error || "Failed to generate report");
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate report");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!previewUrl || !subsectionId) {
      toast.error("Cannot save: missing data");
      return;
    }

    try {
      setSaving(true);
      
      // Fetch the blob from the URL
      const response = await fetch(previewUrl);
      const blob = await response.blob();
      
      const result = await savePDFToDocuments({
        blob,
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
              Choose a template to generate a structured inspection report with photographic evidence
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
              <Button onClick={handlePreviewReport} disabled={isGenerating}>
                <Eye className="mr-2 h-4 w-4" />
                {isGenerating ? "Generating..." : "Preview Report"}
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
                  const itemData = sectionData[item.id] || { status: '', notes: '', photos: [] };
                  const photos = itemData.photos || [];
                  
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

                      {/* Photo Upload Section */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Photographic Evidence
                        </Label>
                        
                        {/* Photo Grid */}
                        {photos.length > 0 && (
                          <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-2">
                            {photos.map((photo, idx) => (
                              <div key={idx} className="relative aspect-square group">
                                <img 
                                  src={photo} 
                                  alt={`Evidence ${idx + 1}`}
                                  className="w-full h-full object-cover rounded-md border"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhoto(section.id, item.id, idx)}
                                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Upload Button */}
                        <div>
                          <input
                            type="file"
                            accept="image/*"
                            id={`photo-${section.id}-${item.id}`}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handlePhotoUpload(section.id, item.id, file);
                                e.target.value = '';
                              }
                            }}
                          />
                          <label htmlFor={`photo-${section.id}-${item.id}`}>
                            <Button type="button" variant="outline" size="sm" asChild>
                              <span className="cursor-pointer">
                                <Camera className="mr-2 h-4 w-4" />
                                Add Photo
                              </span>
                            </Button>
                          </label>
                          {photos.length > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {photos.length} photo{photos.length !== 1 ? 's' : ''} attached
                            </span>
                          )}
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
