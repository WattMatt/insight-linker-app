import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { renameInspectionImages } from "@/lib/imageNaming";
import { fetchImageAsDataUrl } from "@/lib/imageUrlResolver";

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

    // Import and use the internal PDF generator
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

    const pdfBlob = result.doc.output('blob');
    const storagePath = `${subsectionId}/Inspection Reports/${result.fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBlob, {
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
          file_size: pdfBlob.size,
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
          file_size: pdfBlob.size,
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

// Internal PDF generation function - extracted from component for reuse
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
}): Promise<{ doc: jsPDF, fileName: string } | null> {
  const { inspectionData, siteName, subsectionName, templateId, subsectionId, siteLogoUrl, inspectionId, clientName, snags = [], template } = options;
  
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    let jsonData = inspectionData?.jsonData?.jsonData || inspectionData?.jsonData || inspectionData?.json_data || {};

    const date = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const generalInfo = jsonData.generalInfo || {};

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

    // ===== COVER PAGE =====
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    doc.setFillColor(21, 122, 171);
    doc.rect(0, 0, pageWidth, 20, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`${siteName} - ${subsectionName}`, pageWidth / 2, 13, { align: 'center' });
    
    doc.setFillColor(21, 122, 171);
    doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text(date, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Site logo
    let startY = 40;
    const siteLogoToUse = options.siteLogoUrl || companyLogoForQR;
    if (siteLogoToUse) {
      try {
        const logoDataUrl = await fetchImageAsDataUrl(siteLogoToUse);
        if (logoDataUrl) {
          const logoWidth = 80;
          const logoHeight = 40;
          doc.addImage(logoDataUrl, 'PNG', (pageWidth - logoWidth) / 2, startY, logoWidth, logoHeight);
          startY += logoHeight + 15;
        }
      } catch (error) {
        console.error('Error loading site logo:', error);
        startY += 15;
      }
    }

    // Report title
    const reportTitle = template?.name || 'Inspection Report';
    doc.setTextColor(21, 122, 171);
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.text(reportTitle, pageWidth / 2, startY, { align: 'center' });
    startY += 15;

    // Site and subsection info
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(14);
    doc.setFont(undefined, 'normal');
    doc.text(siteName, pageWidth / 2, startY, { align: 'center' });
    startY += 8;
    doc.text(subsectionName, pageWidth / 2, startY, { align: 'center' });
    startY += 20;

    // QR code
    if (qrCodeDataUrl) {
      const qrWidth = 50;
      doc.addImage(qrCodeDataUrl, 'PNG', (pageWidth - qrWidth) / 2, startY, qrWidth, qrWidth);
      startY += qrWidth + 5;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Scan for digital access', pageWidth / 2, startY, { align: 'center' });
    }

    // ===== GENERAL INFORMATION PAGE =====
    doc.addPage();
    let yPos = 20;

    doc.setFillColor(21, 122, 171);
    doc.rect(0, yPos, pageWidth, 15, 'F');
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('GENERAL INFORMATION', pageWidth / 2, yPos + 10, { align: 'center' });
    yPos += 25;

    doc.setTextColor(0, 0, 0);
    
    const infoItems = [
      { label: 'Site Name', value: siteName },
      { label: 'Subsection', value: subsectionName },
      { label: 'Client', value: clientName || generalInfo.clientName || 'N/A' },
      { label: 'Inspection Date', value: generalInfo.inspectionDate || date },
      { label: 'Inspector', value: generalInfo.inspectorName || inspectionData.inspector_name || 'N/A' },
      { label: 'Contractor', value: generalInfo.contractor || inspectionData.contractor || 'N/A' },
      { label: 'Consultant', value: generalInfo.consultant || inspectionData.consultant || 'N/A' },
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: infoItems.map(item => [item.label, item.value]),
      theme: 'striped',
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { cellWidth: 'auto' }
      }
    });

    yPos = (doc as any).lastAutoTable?.finalY + 15 || yPos + 80;

    // ===== TEMPLATE SECTIONS =====
    const sections = template?.sections || [];
    for (const section of sections) {
      const sectionKey = section.key || section.name?.toLowerCase().replace(/\s+/g, '_');
      const sectionData = jsonData[sectionKey] || {};

      doc.addPage();
      yPos = 20;

      doc.setFillColor(21, 122, 171);
      doc.rect(0, yPos, pageWidth, 15, 'F');
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text((section.name || 'Section').toUpperCase(), pageWidth / 2, yPos + 10, { align: 'center' });
      yPos += 25;

      doc.setTextColor(0, 0, 0);

      const items = section.items || [];
      for (const item of items) {
        const itemKey = item.key || item.name?.toLowerCase().replace(/\s+/g, '_');
        const itemData = sectionData[itemKey] || {};

        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(item.name || 'Item', 20, yPos);
        yPos += 6;

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        
        if (itemData.status) {
          const statusColor = itemData.status === 'Pass' ? [40, 167, 69] : itemData.status === 'Fail' ? [220, 53, 69] : [108, 117, 125];
          doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
          doc.text(`Status: ${itemData.status}`, 25, yPos);
          doc.setTextColor(0, 0, 0);
          yPos += 5;
        }

        if (itemData.notes) {
          const wrappedNotes = doc.splitTextToSize(`Notes: ${itemData.notes}`, pageWidth - 50);
          doc.text(wrappedNotes, 25, yPos);
          yPos += wrappedNotes.length * 4 + 2;
        }

        // Item images
        const imageUrls = itemData.images || itemData.imageUrls || [];
        if (imageUrls.length > 0) {
          const imgWidth = 45;
          const imgHeight = 35;
          let imgX = 25;
          
          for (const imgUrl of imageUrls.slice(0, 3)) {
            try {
              const dataUrl = await fetchImageAsDataUrl(imgUrl);
              if (dataUrl) {
                if (yPos + imgHeight > pageHeight - 30) {
                  doc.addPage();
                  yPos = 20;
                  imgX = 25;
                }
                doc.addImage(dataUrl, 'JPEG', imgX, yPos, imgWidth, imgHeight);
                imgX += imgWidth + 5;
                if (imgX > pageWidth - imgWidth - 20) {
                  imgX = 25;
                  yPos += imgHeight + 5;
                }
              }
            } catch (error) {
              console.error('Error embedding image:', error);
            }
          }
          if (imgX > 25) yPos += imgHeight + 5;
        }

        yPos += 8;
      }
    }

    // ===== TENANTS SECTION =====
    const tenants = jsonData.tenants || [];
    if (tenants.length > 0) {
      doc.addPage();
      yPos = 20;

      doc.setFillColor(40, 167, 69);
      doc.rect(0, yPos, pageWidth, 15, 'F');
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('TENANTS / METERS', pageWidth / 2, yPos + 10, { align: 'center' });
      yPos += 25;
      doc.setTextColor(0, 0, 0);

      let tenantNumber = 1;
      for (const tenant of tenants) {
        if (yPos > pageHeight - 80) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        const tenantTitle = `${tenantNumber}. ${tenant.shopName || 'Unnamed Tenant'}${tenant.shopNumber ? ` (${tenant.shopNumber})` : ''}`;
        doc.text(tenantTitle, 20, yPos);
        yPos += 8;

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        
        if (tenant.breakerSize) { doc.text(`Breaker Size: ${tenant.breakerSize}`, 25, yPos); yPos += 5; }
        if (tenant.ctSizeAndRatio) { doc.text(`CT Ratio: ${tenant.ctSizeAndRatio}`, 25, yPos); yPos += 5; }
        if (tenant.meterSerialNumber) { doc.text(`Meter S/N: ${tenant.meterSerialNumber}`, 25, yPos); yPos += 5; }
        if (tenant.controlStatus48V) { doc.text(`48V Control: ${tenant.controlStatus48V}`, 25, yPos); yPos += 5; }

        // Tenant images
        const tenantImages = [];
        if (tenant.breakerImage) tenantImages.push({ label: 'Breaker', url: tenant.breakerImage });
        if (tenant.ctRatioImage) tenantImages.push({ label: 'CT Ratio', url: tenant.ctRatioImage });
        if (tenant.meterImage) tenantImages.push({ label: 'Meter', url: tenant.meterImage });

        if (tenantImages.length > 0) {
          const imgWidth = 45;
          const imgHeight = 35;
          let imgX = 25;
          
          for (const img of tenantImages) {
            try {
              const dataUrl = await fetchImageAsDataUrl(img.url);
              if (dataUrl) {
                if (yPos + imgHeight > pageHeight - 30) {
                  doc.addPage();
                  yPos = 20;
                  imgX = 25;
                }
                doc.addImage(dataUrl, 'JPEG', imgX, yPos, imgWidth, imgHeight);
                imgX += imgWidth + 5;
              }
            } catch (error) {
              console.error('Error embedding tenant image:', error);
            }
          }
          yPos += imgHeight + 10;
        } else {
          yPos += 10;
        }

        tenantNumber++;
      }
    }

    // ===== SNAGS SECTION =====
    if (snags.length > 0) {
      doc.addPage();
      yPos = 20;

      doc.setFillColor(220, 53, 69);
      doc.rect(0, yPos, pageWidth, 15, 'F');
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('SNAGS / ISSUES', pageWidth / 2, yPos + 10, { align: 'center' });
      yPos += 25;
      doc.setTextColor(0, 0, 0);

      for (const snag of snags) {
        if (yPos > pageHeight - 50) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(snag.title || 'Snag', 20, yPos);
        yPos += 6;

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        
        const statusColor = snag.status === 'Resolved' ? [40, 167, 69] : [220, 53, 69];
        doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
        doc.text(`Status: ${snag.status}`, 25, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 5;

        if (snag.description) {
          const wrappedDesc = doc.splitTextToSize(snag.description, pageWidth - 50);
          doc.text(wrappedDesc, 25, yPos);
          yPos += wrappedDesc.length * 4 + 2;
        }

        yPos += 10;
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
          doc.addPage();
          yPos = 20;

          doc.setFillColor(21, 122, 171);
          doc.rect(0, yPos, pageWidth, 15, 'F');
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text('SIGNATURES', pageWidth / 2, yPos + 10, { align: 'center' });
          yPos += 25;
          doc.setTextColor(0, 0, 0);

          for (const sig of signatures) {
            if (yPos > pageHeight - 60) {
              doc.addPage();
              yPos = 20;
            }

            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(`${sig.signer_type}: ${sig.signer_name}`, 20, yPos);
            yPos += 6;

            if (sig.signature_data) {
              try {
                doc.addImage(sig.signature_data, 'PNG', 20, yPos, 60, 25);
                yPos += 30;
              } catch (e) {
                console.error('Error adding signature:', e);
              }
            }

            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            const signedDate = new Date(sig.signed_at).toLocaleString();
            doc.text(`Signed: ${signedDate}`, 20, yPos);
            yPos += 15;
          }
        }
      } catch (error) {
        console.error('Error fetching signatures:', error);
      }
    }

    // ===== FOOTER =====
    const totalPages = doc.getNumberOfPages();
    for (let i = 2; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.setFont(undefined, 'normal');
      doc.text(`${reportTitle} - Page ${i - 1}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    const fileDate = new Date().toLocaleDateString('en-ZA').replace(/\//g, '-');
    const fileName = `${subsectionName}_Inspection_Report_${fileDate}.pdf`;
    
    return { doc, fileName };
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

interface SignatureData {
  id: string;
  signer_type: string;
  signer_name: string;
  signer_email: string | null;
  signature_data: string;
  signed_at: string;
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

  const generatePDFDocument = async (): Promise<{ doc: jsPDF, fileName: string } | null> => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Extract inspection data
      // Fetch template if available
      let template: any = null;
      if (templateId) {
        const { data: templateData } = await supabase
          .from('inspection_templates')
          .select('*')
          .eq('id', templateId)
          .maybeSingle();
        template = templateData;
      }

      // If no template, show error
      if (!template) {
        toast.error("Cannot generate report without a template");
        setGenerating(false);
        return null;
      }

      // Use inspection data directly - skip image renaming to prevent stuck state
      let jsonData = inspectionData?.jsonData?.jsonData || inspectionData?.jsonData || {};

      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Extract general info once for reuse
      const generalInfo = jsonData.generalInfo || {};

      // Fetch company logo from settings for QR code
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

      // Fetch subsection QR code if available with logo overlay
      let qrCodeDataUrl: string | null = null;
      const subId = subsectionId || inspectionData.subsection_id;
      if (subId) {
        try {
          const { data: subsectionData } = await supabase
            .from('subsections')
            .select('id')
            .eq('id', subId)
            .maybeSingle();
          
          if (subsectionData) {
            // Generate QR code URL that points to the edge function with the subsection ID as a path parameter
            const qrCodeUrl = `https://oltzgidkjxwsukvkomof.supabase.co/functions/v1/qr-redirect/${subId}`;
            
            // Create canvas for QR code with logo
            const canvas = document.createElement('canvas');
            const qrSize = 300;
            canvas.width = qrSize;
            canvas.height = qrSize;
            
            // Use QRCode library to generate QR code with high error correction
            const QRCode = (await import('qrcode')).default;
            await QRCode.toCanvas(canvas, qrCodeUrl, {
              width: qrSize,
              margin: 2,
              errorCorrectionLevel: 'H' // High error correction allows ~30% of QR code to be covered
            });
            
            // If we have a company logo, overlay it in the center
            if (companyLogoForQR) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                await new Promise<void>((resolve, reject) => {
                  img.onload = () => {
                    // Calculate rectangular logo size (24% of QR code size, wider than tall)
                    const logoWidth = qrSize * 0.24 * 1.5;
                    const logoHeight = qrSize * 0.24;
                    const x = (qrSize - logoWidth) / 2;
                    const y = (qrSize - logoHeight) / 2;
                    const padding = logoHeight * 0.1;
                    
                    // Draw white rectangular background for logo
                    ctx.fillStyle = 'white';
                    ctx.fillRect(
                      x - padding, 
                      y - padding, 
                      logoWidth + (padding * 2), 
                      logoHeight + (padding * 2)
                    );
                    
                    // Draw logo
                    ctx.drawImage(img, x, y, logoWidth, logoHeight);
                    resolve();
                  };
                  
                  img.onerror = () => {
                    // If logo fails to load, just use QR code without logo
                    resolve();
                  };
                  
                  img.src = companyLogoForQR;
                });
              }
            }
            
            qrCodeDataUrl = canvas.toDataURL();
          }
        } catch (error) {
          console.error('Error generating QR code:', error);
        }
      }

      // ===== COVER PAGE =====
      // White background
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      // Blue bar at top
      doc.setFillColor(21, 122, 171);
      doc.rect(0, 0, pageWidth, 20, 'F');
      
      // Add site name and subsection name to top blue band
      doc.setTextColor(255, 255, 255); // White text
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(`${siteName} - ${subsectionName}`, pageWidth / 2, 13, { align: 'center' });
      
      // Blue bar at bottom
      doc.setFillColor(21, 122, 171);
      doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
      
      // QR Code in top left corner if available
      if (qrCodeDataUrl) {
        const qrSize = 35; // Reduced size
        const qrX = 20;
        const qrY = 30;
        
        doc.addImage(qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      }
      
      // Main title - black, bold, large (Site Name + Subsection Name)
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(28);
      doc.setFont(undefined, 'bold');
      const reportTitle = `${siteName} - ${subsectionName}`;
      doc.text(reportTitle, pageWidth / 2, 80, { align: 'center' });
      
      // Report details box
      const detailsBoxY = 110;
      const detailsBoxHeight = 60;
      
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.5);
      doc.rect(45, detailsBoxY, pageWidth - 90, detailsBoxHeight);
      
      // Report details content
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      
      const inspector = generalInfo.inspectorName || inspectionData.inspectorName || inspectionData.inspector_name || 'Preview Inspector';
      const project = generalInfo.projectName || inspectionData.projectName || inspectionData.project_name || siteName;
      const location = generalInfo.location || inspectionData.location || siteName;
      
      let detailY = detailsBoxY + 15;
      doc.setFont(undefined, 'bold');
      doc.text('Report Date:', 55, detailY);
      doc.setFont(undefined, 'normal');
      doc.text(date, 95, detailY);
      
      detailY += 12;
      doc.setFont(undefined, 'bold');
      doc.text('Inspector:', 55, detailY);
      doc.setFont(undefined, 'normal');
      doc.text(inspector, 95, detailY);
      
      detailY += 12;
      doc.setFont(undefined, 'bold');
      doc.text('Project:', 55, detailY);
      doc.setFont(undefined, 'normal');
      doc.text(project, 95, detailY);
      
      detailY += 12;
      doc.setFont(undefined, 'bold');
      doc.text('Location:', 55, detailY);
      doc.setFont(undefined, 'normal');
      doc.text(location, 95, detailY);
      
      // Company name at bottom (above blue bar)
      const coverPage = template?.cover_page || {};
      const companyName = coverPage.company || 'Watson Mattheus';
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text(companyName, pageWidth / 2, pageHeight - 45, { align: 'center' });
      
      // Tagline below company name
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text('Inspection & Compliance Report', pageWidth / 2, pageHeight - 32, { align: 'center' });

      // ===== GENERAL INFORMATION =====
      doc.addPage();
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text('General Information', pageWidth / 2, 25, { align: 'center' });

      let yPos = 45;
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');

      // General info fields with capital labels
      const generalInfoFields = [
        ['PROJECT NAME:', generalInfo.projectName || inspectionData.projectName || inspectionData.project_name || 'Preview Project'],
        ['INSPECTOR NAME:', generalInfo.inspectorName || inspectionData.inspectorName || inspectionData.inspector_name || 'Preview Inspector'],
        ['INSPECTION DATE:', generalInfo.date || inspectionData.date || inspectionData.inspection_date || date],
        ['CLIENT REPRESENTATIVE:', generalInfo.clientRep || inspectionData.clientRep || inspectionData.client_rep || 'N/A'],
        ['CONSULTANT NAME:', generalInfo.consultant || inspectionData.consultant || 'N/A'],
        ['CONTRACTOR NAME:', generalInfo.contractor || inspectionData.contractor || 'N/A'],
        ['LOCATION:', generalInfo.location || inspectionData.location || siteName],
      ];

      for (const [label, value] of generalInfoFields) {
        doc.setFont(undefined, 'bold');
        doc.text(label, 25, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(value, 80, yPos);
        yPos += 10;
      }

      yPos += 10;

      // ===== TEMPLATE-BASED SECTIONS WITH VISUAL LAYOUT =====
      if (template && template.sections) {
        const sections = Array.isArray(template.sections) ? template.sections : Object.values(template.sections);
        let pageNumber = 1;
        
        for (const section of sections) {
          const sectionData = section as any;
          const sectionId = String(sectionData.id ?? sectionData.key ?? '');
          const items = Array.isArray(sectionData.items) ? sectionData.items : Object.values(sectionData.items || {});
          
          if (items.length === 0) continue;

          // Start new page for each section
          doc.addPage();
          yPos = 20;

          // Section header - Blue background bar with white text
          doc.setFillColor(21, 122, 171); // Blue color
          doc.rect(0, yPos, pageWidth, 15, 'F');
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(255, 255, 255); // White text
          const sectionTitle = (sectionData.name || sectionId).toUpperCase();
          doc.text(sectionTitle, pageWidth / 2, yPos + 10, { align: 'center' });
          yPos += 25;

          // Reset text color for items
          doc.setTextColor(0, 0, 0);

          let itemNumber = 1;
          
          for (let i = 0; i < items.length; i++) {
            const itemInfo = items[i] as any;
            const itemId = String(itemInfo.id ?? i);
            
            // Access jsonData using section and item IDs - try both string and number keys
            const sectionEntry = jsonData[sectionId] || jsonData[Number(sectionId)] || {};
            const itemData = sectionEntry[itemId] || sectionEntry[Number(itemId)] || {};
            
            const photos = itemData.photos || [];
            const images = itemData.images || {};
            
            // Combine photos array and images object
            const allImages: any[] = [...photos];
            if (typeof images === 'object') {
              allImages.push(...Object.values(images).filter((img: any) => img && (img.url || img.path)));
            }

            const hasImages = allImages.length > 0;
            const hasNotes = !!itemData.notes;
            
            // Photo dimensions
            const photoWidth = 65;
            const photoHeight = 50;
            const photoSpacing = 5;
            
            // Calculate how many images and layout
            const imagesPerRow = 2;
            const imageRows = hasImages ? Math.ceil(allImages.length / imagesPerRow) : 1;
            const totalImageHeight = hasImages ? (imageRows * photoHeight) + ((imageRows - 1) * photoSpacing) : photoHeight;
            
            // Calculate space needed for this item box
            const itemBoxHeight = 15 + totalImageHeight + (hasNotes ? 25 : 0) + 15;
            const itemMargin = 10;

            // Check if we need a new page
            if (yPos + itemBoxHeight + itemMargin > pageHeight - 20) {
              doc.addPage();
              yPos = 20;
              pageNumber++;
            }

            // Draw item container box
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.5);
            doc.rect(20, yPos, pageWidth - 40, itemBoxHeight);

            // Item title inside the box (top left)
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text(`${itemNumber}. ${itemInfo.name || itemId}`, 25, yPos + 8);

            // Photo area - starting position
            let photoX = 25;
            let photoY = yPos + 15;

            if (hasImages) {
              // Display all images in a grid
              let imgIndex = 0;
              for (const img of allImages) {
                try {
                  const imgUrl = typeof img === 'string' ? img : (img.url || img.path);
                  if (typeof imgUrl === 'string') {
                    // Use the resolver that handles URL mismatches
                    const dataUrl = await fetchImageAsDataUrl(imgUrl);
                    
                    if (dataUrl) {
                      // Calculate position in grid
                      const col = imgIndex % imagesPerRow;
                      const row = Math.floor(imgIndex / imagesPerRow);
                      const currentX = photoX + (col * (photoWidth + photoSpacing));
                      const currentY = photoY + (row * (photoHeight + photoSpacing));

                      // Draw photo with border
                      doc.setDrawColor(200, 200, 200);
                      doc.setLineWidth(0.5);
                      doc.addImage(dataUrl, 'JPEG', currentX, currentY, photoWidth, photoHeight);
                      doc.rect(currentX, currentY, photoWidth, photoHeight);
                    } else {
                      throw new Error('Could not fetch image');
                    }
                    
                    imgIndex++;
                  }
                } catch (error) {
                  console.error('Error embedding image:', error);
                  // Draw placeholder on error
                  const col = imgIndex % imagesPerRow;
                  const row = Math.floor(imgIndex / imagesPerRow);
                  const currentX = photoX + (col * (photoWidth + photoSpacing));
                  const currentY = photoY + (row * (photoHeight + photoSpacing));
                  
                  doc.setDrawColor(200, 200, 200);
                  doc.setFillColor(250, 250, 250);
                  doc.rect(currentX, currentY, photoWidth, photoHeight, 'FD');
                  doc.setFontSize(8);
                  doc.setFont(undefined, 'normal');
                  doc.setTextColor(180, 180, 180);
                  doc.text('Photo', currentX + photoWidth / 2, currentY + photoHeight / 2 - 2, { align: 'center' });
                  doc.text('Error', currentX + photoWidth / 2, currentY + photoHeight / 2 + 2, { align: 'center' });
                  doc.setTextColor(0, 0, 0);
                  
                  imgIndex++;
                }
              }
            } else {
              // Draw placeholder box with "Photo Placeholder" text
              doc.setDrawColor(200, 200, 200);
              doc.setFillColor(250, 250, 250);
              doc.setLineWidth(0.5);
              doc.rect(photoX, photoY, photoWidth, photoHeight, 'FD');
              
              doc.setFontSize(8);
              doc.setFont(undefined, 'normal');
              doc.setTextColor(180, 180, 180);
              doc.text('Photo', photoX + photoWidth / 2, photoY + photoHeight / 2 - 2, { align: 'center' });
              doc.text('Placeholder', photoX + photoWidth / 2, photoY + photoHeight / 2 + 2, { align: 'center' });
              doc.setTextColor(0, 0, 0);
            }

            // Display notes if available (below all photos)
            if (hasNotes) {
              const notesY = photoY + totalImageHeight + 8;
              doc.setFontSize(9);
              doc.setFont(undefined, 'bold');
              doc.text('Notes:', 25, notesY);
              
              doc.setFont(undefined, 'normal');
              const notesLines = doc.splitTextToSize(itemData.notes, pageWidth - 60);
              doc.text(notesLines, 25, notesY + 6);
            }

            // Move to next item
            yPos += itemBoxHeight + itemMargin;
            itemNumber++;
          }
          
          pageNumber++;
        }
      }

      // ===== TENANTS SECTION =====
      const tenants = jsonData.tenants || [];
      if (tenants.length > 0) {
        doc.addPage();
        yPos = 20;

        // Tenants header - Green background bar with white text
        doc.setFillColor(40, 167, 69); // Green color for tenants
        doc.rect(0, yPos, pageWidth, 15, 'F');
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('TENANTS / METERS', pageWidth / 2, yPos + 10, { align: 'center' });
        yPos += 25;

        // Reset text color
        doc.setTextColor(0, 0, 0);

        let tenantNumber = 1;
        for (const tenant of tenants) {
          // Collect tenant images
          const tenantImages: { label: string; url: string }[] = [];
          if (tenant.breakerImage) tenantImages.push({ label: 'Breaker', url: tenant.breakerImage });
          if (tenant.ctRatioImage) tenantImages.push({ label: 'CT Ratio', url: tenant.ctRatioImage });
          if (tenant.meterImage) tenantImages.push({ label: 'Meter', url: tenant.meterImage });
          
          const hasImages = tenantImages.length > 0;
          
          // Photo dimensions
          const photoWidth = 50;
          const photoHeight = 40;
          const photoSpacing = 5;
          
          // Calculate layout
          const imagesPerRow = 3;
          const imageRows = hasImages ? Math.ceil(tenantImages.length / imagesPerRow) : 0;
          const totalImageHeight = hasImages ? (imageRows * photoHeight) + ((imageRows - 1) * photoSpacing) : 0;
          
          // Calculate space needed
          const headerHeight = 45; // Title + info rows
          const tenantBoxHeight = headerHeight + totalImageHeight + 15;
          const tenantMargin = 10;

          // Check if we need a new page
          if (yPos + tenantBoxHeight + tenantMargin > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
          }

          // Draw tenant container box
          doc.setDrawColor(40, 167, 69);
          doc.setLineWidth(1);
          doc.rect(20, yPos, pageWidth - 40, tenantBoxHeight);

          // Tenant title (Shop Name + Number)
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(0, 0, 0);
          const tenantTitle = `${tenantNumber}. ${tenant.shopName || 'Unnamed Tenant'}${tenant.shopNumber ? ` (${tenant.shopNumber})` : ''}`;
          doc.text(tenantTitle, 25, yPos + 8);

          // Tenant info
          let infoY = yPos + 18;
          doc.setFontSize(9);
          
          if (tenant.breakerSize) {
            doc.setFont(undefined, 'bold');
            doc.text('Breaker Size:', 25, infoY);
            doc.setFont(undefined, 'normal');
            doc.text(tenant.breakerSize, 60, infoY);
            infoY += 8;
          }
          
          if (tenant.ctSizeAndRatio) {
            doc.setFont(undefined, 'bold');
            doc.text('CT Ratio:', 25, infoY);
            doc.setFont(undefined, 'normal');
            doc.text(tenant.ctSizeAndRatio, 60, infoY);
            infoY += 8;
          }
          
          if (tenant.meterSerialNumber) {
            doc.setFont(undefined, 'bold');
            doc.text('Meter S/N:', 25, infoY);
            doc.setFont(undefined, 'normal');
            doc.text(tenant.meterSerialNumber, 60, infoY);
            infoY += 8;
          }
          
          if (tenant.controlStatus48V) {
            doc.setFont(undefined, 'bold');
            doc.text('48V Control:', 25, infoY);
            doc.setFont(undefined, 'normal');
            doc.text(tenant.controlStatus48V, 60, infoY);
            infoY += 8;
          }

          // Photos
          if (hasImages) {
            let photoX = 25;
            let photoY = yPos + headerHeight;
            let imgIndex = 0;
            
            for (const img of tenantImages) {
              try {
                // Use the resolver that handles URL mismatches
                const dataUrl = await fetchImageAsDataUrl(img.url);
                
                if (dataUrl) {
                  const col = imgIndex % imagesPerRow;
                  const row = Math.floor(imgIndex / imagesPerRow);
                  const currentX = photoX + (col * (photoWidth + photoSpacing));
                  const currentY = photoY + (row * (photoHeight + photoSpacing));

                  // Draw photo with border
                  doc.setDrawColor(200, 200, 200);
                  doc.setLineWidth(0.5);
                  doc.addImage(dataUrl, 'JPEG', currentX, currentY, photoWidth, photoHeight);
                  doc.rect(currentX, currentY, photoWidth, photoHeight);
                  
                  // Add label below image
                  doc.setFontSize(7);
                  doc.setFont(undefined, 'normal');
                  doc.setTextColor(100, 100, 100);
                  doc.text(img.label, currentX + photoWidth / 2, currentY + photoHeight + 4, { align: 'center' });
                  doc.setTextColor(0, 0, 0);
                }
                
                imgIndex++;
              } catch (error) {
                console.error('Error embedding tenant image:', error);
                imgIndex++;
              }
            }
          }

          yPos += tenantBoxHeight + tenantMargin;
          tenantNumber++;
        }
      }

      // ===== SNAGS SECTION =====
      if (snags && snags.length > 0) {
        doc.addPage();
        yPos = 20;

        // Snags header - Red/orange background bar with white text
        doc.setFillColor(220, 53, 69); // Red color for snags
        doc.rect(0, yPos, pageWidth, 15, 'F');
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('SNAGS / ISSUES', pageWidth / 2, yPos + 10, { align: 'center' });
        yPos += 25;

        // Reset text color
        doc.setTextColor(0, 0, 0);

        let snagNumber = 1;
        for (const snag of snags) {
          const snagPhotos = snag.photos || [];
          const hasPhotos = snagPhotos.length > 0;
          
          // Photo dimensions
          const photoWidth = 65;
          const photoHeight = 50;
          const photoSpacing = 5;
          
          // Calculate layout
          const imagesPerRow = 2;
          const imageRows = hasPhotos ? Math.ceil(snagPhotos.length / imagesPerRow) : 0;
          const totalImageHeight = hasPhotos ? (imageRows * photoHeight) + ((imageRows - 1) * photoSpacing) : 0;
          
          // Calculate space needed
          const headerHeight = 35; // Title + status + risk
          const descHeight = snag.description ? 20 : 0;
          const notesHeight = snag.notes ? 20 : 0;
          const snagBoxHeight = headerHeight + totalImageHeight + descHeight + notesHeight + 15;
          const snagMargin = 10;

          // Check if we need a new page
          if (yPos + snagBoxHeight + snagMargin > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
          }

          // Draw snag container box
          const statusColor = snag.status === 'Open' ? [220, 53, 69] : [40, 167, 69];
          doc.setDrawColor(statusColor[0], statusColor[1], statusColor[2]);
          doc.setLineWidth(1);
          doc.rect(20, yPos, pageWidth - 40, snagBoxHeight);

          // Snag title
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(`${snagNumber}. ${snag.title}`, 25, yPos + 8);

          // Status badge
          doc.setFontSize(9);
          const statusX = pageWidth - 50;
          doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
          doc.roundedRect(statusX, yPos + 3, 25, 8, 2, 2, 'F');
          doc.setTextColor(255, 255, 255);
          doc.text(snag.status, statusX + 12.5, yPos + 8.5, { align: 'center' });
          doc.setTextColor(0, 0, 0);

          // Risk level if present
          let infoY = yPos + 18;
          if (snag.risk_level) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text('Risk Level:', 25, infoY);
            doc.setFont(undefined, 'normal');
            doc.text(snag.risk_level, 55, infoY);
            infoY += 8;
          }

          // Estimated cost if present
          if (snag.estimated_cost) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text('Est. Cost:', 25, infoY);
            doc.setFont(undefined, 'normal');
            doc.text(`R ${snag.estimated_cost.toLocaleString()}`, 55, infoY);
            infoY += 8;
          }

          // Description
          if (snag.description) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text('Description:', 25, infoY);
            doc.setFont(undefined, 'normal');
            const descLines = doc.splitTextToSize(snag.description, pageWidth - 60);
            doc.text(descLines.slice(0, 2), 25, infoY + 6);
            infoY += 15;
          }

          // Notes
          if (snag.notes) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text('Notes:', 25, infoY);
            doc.setFont(undefined, 'normal');
            const notesLines = doc.splitTextToSize(snag.notes, pageWidth - 60);
            doc.text(notesLines.slice(0, 2), 25, infoY + 6);
            infoY += 15;
          }

          // Photos
          if (hasPhotos) {
            let photoX = 25;
            let photoY = infoY + 5;
            let imgIndex = 0;
            
            for (const photoUrl of snagPhotos) {
              try {
                if (typeof photoUrl === 'string') {
                  const response = await fetch(photoUrl);
                  const blob = await response.blob();
                  const dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });

                  const col = imgIndex % imagesPerRow;
                  const row = Math.floor(imgIndex / imagesPerRow);
                  const currentX = photoX + (col * (photoWidth + photoSpacing));
                  const currentY = photoY + (row * (photoHeight + photoSpacing));

                  doc.setDrawColor(200, 200, 200);
                  doc.setLineWidth(0.5);
                  doc.addImage(dataUrl, 'JPEG', currentX, currentY, photoWidth, photoHeight);
                  doc.rect(currentX, currentY, photoWidth, photoHeight);
                  
                  imgIndex++;
                }
              } catch (error) {
                console.error('Error embedding snag image:', error);
                imgIndex++;
              }
            }
          }

          yPos += snagBoxHeight + snagMargin;
          snagNumber++;
        }
      }

      // ===== SIGNATURES PAGE =====
      if (inspectionId) {
        try {
          const { data: signaturesData } = await supabase
            .from('inspection_signatures')
            .select('*')
            .eq('inspection_id', inspectionId);

          if (signaturesData && signaturesData.length > 0) {
            doc.addPage();
            let sigY = 25;

            // Page title
            doc.setFontSize(16);
            doc.setTextColor(0, 0, 0);
            doc.setFont(undefined, 'bold');
            doc.text('Sign-Off Signatures', pageWidth / 2, sigY, { align: 'center' });
            sigY += 15;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('This inspection has been reviewed and signed off by the following parties:', pageWidth / 2, sigY, { align: 'center' });
            sigY += 20;

            // Draw signature boxes in a 2x2 grid
            const sigBoxWidth = (pageWidth - 50) / 2;
            const sigBoxHeight = 80;
            const sigBoxMargin = 10;
            let sigCol = 0;
            let sigRow = 0;

            const signerTypeLabels: Record<string, string> = {
              'inspector': 'Inspector',
              'contractor': 'Contractor',
              'client': 'Client Representative',
              'witness': 'Witness'
            };

            for (const sig of signaturesData as SignatureData[]) {
              const boxX = 20 + (sigCol * (sigBoxWidth + sigBoxMargin));
              const boxY = sigY + (sigRow * (sigBoxHeight + sigBoxMargin));

              // Draw box
              doc.setDrawColor(200, 200, 200);
              doc.setFillColor(250, 250, 250);
              doc.roundedRect(boxX, boxY, sigBoxWidth, sigBoxHeight, 3, 3, 'FD');

              // Title
              doc.setFontSize(10);
              doc.setFont(undefined, 'bold');
              doc.setTextColor(0, 0, 0);
              doc.text(signerTypeLabels[sig.signer_type] || sig.signer_type, boxX + 5, boxY + 10);

              // Signature image
              try {
                const sigImgWidth = sigBoxWidth - 20;
                const sigImgHeight = 35;
                doc.addImage(sig.signature_data, 'PNG', boxX + 10, boxY + 15, sigImgWidth, sigImgHeight);
              } catch (e) {
                console.error('Error adding signature image:', e);
              }

              // Name and date
              doc.setFontSize(9);
              doc.setFont(undefined, 'normal');
              doc.text(sig.signer_name, boxX + 5, boxY + sigBoxHeight - 15);
              
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              const signedDate = new Date(sig.signed_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              doc.text(`Signed: ${signedDate}`, boxX + 5, boxY + sigBoxHeight - 7);

              sigCol++;
              if (sigCol >= 2) {
                sigCol = 0;
                sigRow++;
              }
            }
          }
        } catch (error) {
          console.error('Error fetching signatures for PDF:', error);
        }
      }

      // ===== FOOTER =====
      const totalPages = doc.getNumberOfPages();
      let footerPageNum = 0;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.setFont(undefined, 'normal');
        
        // Skip cover page for footer
        if (i > 1) {
          footerPageNum++;
          const footerText = `${reportTitle} - Page ${footerPageNum}`;
          doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
        }
      }

      const fileDate = new Date().toLocaleDateString('en-ZA').replace(/\//g, '-');
      const fileName = `${subsectionName}_Inspection_Report_${fileDate}.pdf`;
      
      return { doc, fileName };
    } catch (error) {
      console.error("Error generating report:", error);
      return null;
    }
  };

  // Combined function: generates PDF, saves to documents, and downloads
  const generateAndSave = async () => {
    setGenerating(true);
    try {
      const result = await generatePDFDocument();
      if (!result) {
        return;
      }

      // If no subsectionId, just download the PDF
      if (!subsectionId) {
        result.doc.save(result.fileName);
        toast.success("Report generated successfully");
        return;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("User not authenticated");
        result.doc.save(result.fileName);
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
        
        if (categoryError) {
          console.error("Category creation error:", categoryError);
          result.doc.save(result.fileName);
          toast.success("PDF downloaded (couldn't save to documents)");
          return;
        }
        categoryId = newCategory.id;
      }

      // Convert PDF to blob
      const pdfBlob = result.doc.output('blob');
      
      // Upload to storage
      const storagePath = `${subsectionId}/Inspection Reports/${result.fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        result.doc.save(result.fileName);
        toast.success("PDF downloaded (couldn't upload to storage)");
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);

      // Check if document already exists to avoid duplicates
      const { data: existingDoc } = await supabase
        .from('subsection_documents')
        .select('id')
        .eq('subsection_id', subsectionId)
        .eq('file_name', result.fileName)
        .maybeSingle();

      if (!existingDoc) {
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

        if (docError) {
          console.error("Document record error:", docError);
        }
      } else {
        // Update existing document
        await supabase
          .from('subsection_documents')
          .update({
            file_url: urlData.publicUrl,
            file_size: pdfBlob.size,
            uploaded_at: new Date().toISOString()
          })
          .eq('id', existingDoc.id);
      }

      // Download the PDF
      result.doc.save(result.fileName);
      toast.success("PDF generated and saved to documents!");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button onClick={generateAndSave} disabled={generating} variant="default">
      <FileText className="mr-2 h-4 w-4" />
      {generating ? "Generating..." : "Generate PDF"}
    </Button>
  );
};
