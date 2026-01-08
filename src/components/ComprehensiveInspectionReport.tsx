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

  // Use the standalone function for consistent PDF generation
  const generatePDFDocument = async (): Promise<{ doc: jsPDF, fileName: string } | null> => {
    // Fetch template if needed
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

    // Use the shared internal PDF generator
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
