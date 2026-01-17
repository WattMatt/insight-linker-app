import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchImageAsDataUrl } from "@/lib/imageUrlResolver";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import {
  generatePdfBlob,
  createCoverPage,
  createInfoTable,
  createSectionHeader,
  createStatusBadge,
  COLORS,
  DEFAULT_STYLES,
} from "@/lib/pdfMakeUtils";

type Content = any;
type TDocumentDefinitions = any;

const PDF_COLORS = COLORS;

// Standalone interface for external use
export interface GenerateReportOptions {
  inspectionId: string;
  subsectionId: string;
  siteName: string;
  subsectionName: string;
  clientName?: string;
  templateId?: string | null;
  siteLogoUrl?: string | null;
}

export interface GenerateReportResult {
  success: boolean;
  documentId?: string;
  fileName?: string;
  fileUrl?: string;
  error?: string;
}

/**
 * Standalone function to generate and save inspection report
 * Can be called from anywhere without rendering a component
 */
export async function generateAndSaveComprehensiveReport(
  options: GenerateReportOptions
): Promise<GenerateReportResult> {
  const { inspectionId, subsectionId, siteName, subsectionName, clientName, templateId, siteLogoUrl } = options;

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    // Fetch inspection data
    const { data: inspection, error: inspectionError } = await supabase
      .from('inspections')
      .select('*')
      .eq('id', inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return { success: false, error: "Failed to fetch inspection data" };
    }

    // Fetch template
    const effectiveTemplateId = templateId || inspection.template_id;
    let template: any = null;
    if (effectiveTemplateId) {
      const { data: templateData } = await supabase
        .from('inspection_templates')
        .select('*')
        .eq('id', effectiveTemplateId)
        .maybeSingle();
      template = templateData;
    }

    if (!template) {
      return { success: false, error: "Cannot generate report without a template" };
    }

    // Fetch snags
    const { data: snagsData } = await supabase
      .from('snags')
      .select('*')
      .eq('subsection_id', subsectionId);
    const snags = snagsData || [];

    // Generate PDF using internal generator
    const result = await generatePDFInternal({
      inspectionData: { ...inspection, jsonData: inspection.json_data },
      siteName,
      subsectionName,
      templateId: effectiveTemplateId,
      subsectionId,
      siteLogoUrl,
      inspectionId,
      clientName,
      snags,
      template,
    });

    if (!result) {
      return { success: false, error: "Failed to generate PDF" };
    }

    // Save to documents
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
      
      if (categoryError) {
        return { success: false, error: "Failed to create category" };
      }
      categoryId = newCategory.id;
    }

    const storagePath = `${subsectionId}/Inspection Reports/${result.fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, result.blob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      return { success: false, error: "Failed to upload PDF" };
    }

    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    const { data: existingDoc } = await supabase
      .from('subsection_documents')
      .select('id')
      .eq('subsection_id', subsectionId)
      .eq('file_name', result.fileName)
      .maybeSingle();

    let documentId: string;

    if (!existingDoc) {
      const { data: newDoc, error: docError } = await supabase
        .from('subsection_documents')
        .insert({
          subsection_id: subsectionId,
          category_id: categoryId,
          file_name: result.fileName,
          file_url: urlData.publicUrl,
          file_size: result.blob.size,
          uploaded_by: user.id
        })
        .select()
        .single();

      if (docError) {
        return { success: false, error: "Failed to save document record" };
      }
      documentId = newDoc.id;
    } else {
      await supabase
        .from('subsection_documents')
        .update({
          file_url: urlData.publicUrl,
          file_size: result.blob.size,
          uploaded_at: new Date().toISOString()
        })
        .eq('id', existingDoc.id);
      documentId = existingDoc.id;
    }

    return {
      success: true,
      documentId,
      fileName: result.fileName,
      fileUrl: urlData.publicUrl
    };
  } catch (error) {
    console.error("Error generating report:", error);
    return { success: false, error: "Failed to generate report" };
  }
}

// Internal PDF generation function using pdfmake
async function generatePDFInternal(options: {
  inspectionData: any;
  siteName: string;
  subsectionName: string;
  templateId?: string | null;
  subsectionId?: string;
  siteLogoUrl?: string | null;
  inspectionId?: string;
  clientName?: string;
  snags?: any[];
  template: any;
}): Promise<{ fileName: string; blob: Blob } | null> {
  const { inspectionData, siteName, subsectionName, subsectionId, siteLogoUrl, inspectionId, clientName, snags = [], template } = options;
  
  try {
    const content: Content[] = [];
    let jsonData = inspectionData?.jsonData?.jsonData || inspectionData?.jsonData || inspectionData?.json_data || {};

    const date = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const generalInfo = jsonData.generalInfo || {};
    const reportTitle = template?.name || 'Inspection Report';

    // Fetch company logo for QR code
    let companyLogoForQR: string | null = null;
    try {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('company_logo_url')
        .limit(1)
        .maybeSingle();
      
      companyLogoForQR = settingsData?.company_logo_url || null;
    } catch (error) {
      console.error('Error fetching company logo:', error);
    }

    // Generate QR code
    let qrCodeDataUrl: string | null = null;
    const subId = subsectionId || inspectionData.subsection_id;
    if (subId) {
      try {
        const qrCodeUrl = `https://oltzgidkjxwsukvkomof.supabase.co/functions/v1/qr-redirect/${subId}`;
        
        const canvas = document.createElement('canvas');
        const qrSize = 300;
        canvas.width = qrSize;
        canvas.height = qrSize;
        
        const QRCode = (await import('qrcode')).default;
        await QRCode.toCanvas(canvas, qrCodeUrl, {
          width: qrSize,
          margin: 2,
          errorCorrectionLevel: 'H'
        });
        
        if (companyLogoForQR) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            await new Promise<void>((resolve) => {
              img.onload = () => {
                const logoWidth = qrSize * 0.24 * 1.5;
                const logoHeight = qrSize * 0.24;
                const x = (qrSize - logoWidth) / 2;
                const y = (qrSize - logoHeight) / 2;
                const padding = logoHeight * 0.1;
                
                ctx.fillStyle = 'white';
                ctx.fillRect(x - padding, y - padding, logoWidth + (padding * 2), logoHeight + (padding * 2));
                ctx.drawImage(img, x, y, logoWidth, logoHeight);
                resolve();
              };
              
              img.onerror = () => resolve();
              img.src = companyLogoForQR;
            });
          }
        }
        
        qrCodeDataUrl = canvas.toDataURL();
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    }

    // Load logo
    let logoDataUrl: string | null = null;
    const siteLogoToUse = siteLogoUrl || companyLogoForQR;
    if (siteLogoToUse) {
      try {
        logoDataUrl = await fetchImageAsDataUrl(siteLogoToUse);
      } catch (error) {
        console.error('Error loading site logo:', error);
      }
    }

    // ===== COVER PAGE =====
    const coverPage = createCoverPage({
      title: reportTitle,
      subtitle: `${siteName} - ${subsectionName}`,
      siteName,
      reportType: 'Inspection Report',
      organizationName: clientName || 'Watson Mattheus',
      reportDate: new Date(),
      logoDataUrl: logoDataUrl || undefined,
      qrCodeDataUrl: qrCodeDataUrl || undefined,
    });
    content.push(coverPage);

    // ===== GENERAL INFORMATION PAGE =====
    content.push({ text: '', pageBreak: 'after' } as Content);
    content.push(createSectionHeader('General Information', 'primary'));
    
    const infoData: [string, string][] = [
      ['Site Name', siteName],
      ['Subsection', subsectionName],
      ['Client', clientName || generalInfo.clientName || 'N/A'],
      ['Inspection Date', generalInfo.inspectionDate || date],
      ['Inspector', generalInfo.inspectorName || inspectionData.inspector_name || 'N/A'],
      ['Contractor', generalInfo.contractor || inspectionData.contractor || 'N/A'],
      ['Consultant', generalInfo.consultant || inspectionData.consultant || 'N/A'],
    ];
    content.push(createInfoTable(infoData));

    // ===== TEMPLATE SECTIONS =====
    const sections = template?.sections || [];
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const sectionKey = section.key || section.name?.toLowerCase().replace(/\s+/g, '_');
      const sectionData = jsonData[sectionIndex] || jsonData[String(sectionIndex)] || jsonData[sectionKey] || {};

      content.push({ text: '', pageBreak: 'before' } as Content);
      content.push(createSectionHeader((section.name || 'Section').toUpperCase(), 'primary'));

      const items = section.items || [];
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const item = items[itemIndex];
        const itemKey = item.key || item.name?.toLowerCase().replace(/\s+/g, '_');
        const itemData = sectionData[itemIndex] || sectionData[String(itemIndex)] || sectionData[itemKey] || {};

        const itemContent: Content[] = [];
        
        // Item name
        itemContent.push({
          text: item.name || 'Item',
          bold: true,
          fontSize: 11,
          margin: [0, 10, 0, 4]
        } as Content);

        // Status
        if (itemData.status) {
          itemContent.push({
            columns: [
              { text: 'Status: ', bold: true, width: 50, fontSize: 9 },
              createStatusBadge(itemData.status)
            ],
            margin: [10, 0, 0, 4]
          } as Content);
        }

        // Notes
        if (itemData.notes) {
          itemContent.push({
            text: `Notes: ${itemData.notes}`,
            fontSize: 9,
            color: PDF_COLORS.textSecondary,
            margin: [10, 0, 0, 4]
          } as Content);
        }

        // Images
        const imageUrls = itemData.photos || itemData.images || itemData.imageUrls || [];
        if (imageUrls.length > 0) {
          const imageColumns: Content[] = [];
          for (const imgUrl of imageUrls.slice(0, 3)) {
            try {
              const dataUrl = await fetchImageAsDataUrl(imgUrl);
              if (dataUrl) {
                imageColumns.push({
                  image: dataUrl,
                  width: 100,
                  height: 75,
                  margin: [0, 5, 10, 5]
                } as Content);
              }
            } catch (error) {
              console.error('Error embedding image:', error);
            }
          }
          if (imageColumns.length > 0) {
            itemContent.push({
              columns: imageColumns,
              margin: [10, 5, 0, 5]
            } as Content);
          }
        }

        content.push({ stack: itemContent } as Content);
      }
    }

    // ===== TENANTS SECTION =====
    const tenants = jsonData.tenants || [];
    if (tenants.length > 0) {
      content.push({ text: '', pageBreak: 'before' } as Content);
      content.push(createSectionHeader('TENANTS / METERS', 'secondary'));

      let tenantNumber = 1;
      for (const tenant of tenants) {
        const tenantContent: Content[] = [];
        
        const tenantTitle = `${tenantNumber}. ${tenant.shopName || 'Unnamed Tenant'}${tenant.shopNumber ? ` (${tenant.shopNumber})` : ''}`;
        tenantContent.push({
          text: tenantTitle,
          bold: true,
          fontSize: 11,
          margin: [0, 10, 0, 5]
        } as Content);

        const tenantDetails: string[] = [];
        if (tenant.breakerSize) tenantDetails.push(`Breaker Size: ${tenant.breakerSize}`);
        if (tenant.ctSizeAndRatio) tenantDetails.push(`CT Ratio: ${tenant.ctSizeAndRatio}`);
        if (tenant.meterSerialNumber) tenantDetails.push(`Meter S/N: ${tenant.meterSerialNumber}`);
        if (tenant.controlStatus48V) tenantDetails.push(`48V Control: ${tenant.controlStatus48V}`);

        if (tenantDetails.length > 0) {
          tenantContent.push({
            ul: tenantDetails,
            fontSize: 9,
            margin: [10, 0, 0, 5]
          } as Content);
        }

        // Tenant images
        const tenantImages = [];
        if (tenant.breakerImage) tenantImages.push({ label: 'Breaker', url: tenant.breakerImage });
        if (tenant.ctRatioImage) tenantImages.push({ label: 'CT Ratio', url: tenant.ctRatioImage });
        if (tenant.meterImage) tenantImages.push({ label: 'Meter', url: tenant.meterImage });

        if (tenantImages.length > 0) {
          const imageColumns: Content[] = [];
          for (const img of tenantImages) {
            if (!img.url) continue;
            try {
              const dataUrl = await fetchImageAsDataUrl(img.url);
              if (dataUrl) {
                imageColumns.push({
                  stack: [
                    { text: img.label, fontSize: 7, margin: [0, 0, 0, 2] },
                    { image: dataUrl, width: 100, height: 75 }
                  ],
                  margin: [0, 0, 10, 0]
                } as Content);
              }
            } catch (error) {
              console.error('Error embedding tenant image:', error);
            }
          }
          if (imageColumns.length > 0) {
            tenantContent.push({
              columns: imageColumns,
              margin: [10, 5, 0, 10]
            } as Content);
          }
        }

        content.push({ stack: tenantContent } as Content);
        tenantNumber++;
      }
    }

    // ===== SNAGS SECTION =====
    if (snags.length > 0) {
      content.push({ text: '', pageBreak: 'before' } as Content);
      content.push(createSectionHeader('SNAGS / ISSUES', 'primary'));

      for (const snag of snags) {
        const snagContent: Content[] = [];
        
        snagContent.push({
          text: snag.title || 'Snag',
          bold: true,
          fontSize: 11,
          margin: [0, 10, 0, 4]
        } as Content);

        snagContent.push({
          columns: [
            { text: 'Status: ', bold: true, width: 50, fontSize: 9 },
            createStatusBadge(snag.status)
          ],
          margin: [10, 0, 0, 4]
        } as Content);

        if (snag.description) {
          snagContent.push({
            text: snag.description,
            fontSize: 9,
            color: PDF_COLORS.textSecondary,
            margin: [10, 0, 0, 4]
          } as Content);
        }

        content.push({ stack: snagContent } as Content);
      }
    }

    // ===== SIGNATURES =====
    const inspId = inspectionId || inspectionData.id;
    if (inspId) {
      try {
        const { data: signatures } = await supabase
          .from('inspection_signatures')
          .select('*')
          .eq('inspection_id', inspId);

        if (signatures && signatures.length > 0) {
          content.push({ text: '', pageBreak: 'before' } as Content);
          content.push(createSectionHeader('SIGNATURES', 'primary'));

          for (const sig of signatures) {
            const sigContent: Content[] = [];
            
            sigContent.push({
              text: `${sig.signer_type}: ${sig.signer_name}`,
              bold: true,
              fontSize: 10,
              margin: [0, 10, 0, 5]
            } as Content);

            if (sig.signature_data) {
              sigContent.push({
                image: sig.signature_data,
                width: 150,
                height: 60,
                margin: [0, 5, 0, 5]
              } as Content);
            }

            const signedDate = new Date(sig.signed_at).toLocaleString();
            sigContent.push({
              text: `Signed: ${signedDate}`,
              fontSize: 8,
              color: PDF_COLORS.textMuted,
              margin: [0, 0, 0, 10]
            } as Content);

            content.push({ stack: sigContent } as Content);
          }
        }
      } catch (error) {
        console.error('Error fetching signatures:', error);
      }
    }

    // Build document definition
    const docDefinition: TDocumentDefinitions = {
      content,
      styles: DEFAULT_STYLES,
      defaultStyle: {
        font: 'Helvetica',
        fontSize: 10,
      },
      pageMargins: [40, 40, 40, 60],
      footer: (currentPage: number, pageCount: number) => {
        if (currentPage === 1) return null;
        return {
          columns: [
            { text: 'Confidential', fontSize: 8, color: PDF_COLORS.textMuted, margin: [40, 0, 0, 0] },
            { text: `Page ${currentPage - 1} of ${pageCount - 1}`, fontSize: 8, alignment: 'center', color: PDF_COLORS.textMuted },
            { text: date, fontSize: 8, alignment: 'right', color: PDF_COLORS.textMuted, margin: [0, 0, 40, 0] }
          ],
          margin: [0, 20, 0, 0]
        };
      }
    };

    const blob = await generatePdfBlob(docDefinition);
    const fileDate = new Date().toLocaleDateString('en-ZA').replace(/\//g, '-');
    const fileName = `${subsectionName}_Inspection_Report_${fileDate}.pdf`;
    
    return { fileName, blob };
  } catch (error) {
    console.error("Error generating PDF:", error);
    return null;
  }
}

interface Snag {
  id: string;
  title: string;
  description?: string;
  notes?: string;
  status: string;
  risk_level?: string;
  estimated_cost?: number;
  photos?: string[];
}

interface ComprehensiveInspectionReportProps {
  inspectionData: any;
  siteName: string;
  subsectionName: string;
  templateId?: string | null;
  subsectionId?: string;
  siteLogoUrl?: string | null;
  inspectionId?: string;
  clientName?: string;
  snags?: Snag[];
}

export const ComprehensiveInspectionReport = ({
  inspectionData,
  siteName,
  subsectionName,
  templateId,
  subsectionId,
  siteLogoUrl,
  inspectionId,
  clientName,
  snags = [],
}: ComprehensiveInspectionReportProps) => {
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);

  const generatePDFDocument = async (): Promise<{ fileName: string; blob: Blob } | null> => {
    let template: any = null;
    if (templateId) {
      const { data: templateData } = await supabase
        .from('inspection_templates')
        .select('*')
        .eq('id', templateId)
        .maybeSingle();
      template = templateData;
    }

    if (!template) {
      toast.error("Cannot generate report without a template");
      return null;
    }

    return generatePDFInternal({
      inspectionData: { ...inspectionData, jsonData: inspectionData?.jsonData || inspectionData?.json_data },
      siteName,
      subsectionName,
      templateId,
      subsectionId,
      siteLogoUrl,
      inspectionId,
      clientName,
      snags,
      template,
    });
  };

  const handlePreviewReport = async () => {
    try {
      setGenerating(true);
      const result = await generatePDFDocument();
      
      if (!result) {
        return;
      }
      
      const url = URL.createObjectURL(result.blob);
      setPreviewUrl(url);
      setPreviewFileName(result.fileName);
      setPdfBlob(result.blob);
      setPreviewOpen(true);
    } catch (error) {
      console.error("Error generating report:", error);
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

  return (
    <>
      <Button onClick={handlePreviewReport} disabled={generating} variant="default">
        <Eye className="mr-2 h-4 w-4" />
        {generating ? "Generating..." : "Preview Report"}
      </Button>

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
    </>
  );
};
