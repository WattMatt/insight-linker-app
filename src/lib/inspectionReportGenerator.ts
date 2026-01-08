import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { renameInspectionImages } from "@/lib/imageNaming";

interface GenerateAndSaveReportOptions {
  inspectionId: string;
  subsectionId: string;
  siteName: string;
  subsectionName: string;
  clientName?: string;
  templateId?: string | null;
  siteLogoUrl?: string | null;
}

interface GenerateReportResult {
  success: boolean;
  documentId?: string;
  fileName?: string;
  fileUrl?: string;
  error?: string;
}

/**
 * Generates an inspection report PDF and saves it to the documents folder
 */
export async function generateAndSaveInspectionReport(
  options: GenerateAndSaveReportOptions
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

    // Fetch template if available
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

    // Get jsonData from inspection
    let jsonData: Record<string, any> = (inspection.json_data as Record<string, any>) || {};

    // Rename images to descriptive format
    if (clientName) {
      const renameResult = await renameInspectionImages(
        inspectionId,
        clientName || siteName,
        siteName,
        subsectionName,
        jsonData
      );
      
      if (renameResult.renamedCount > 0) {
        jsonData = renameResult.updatedJsonData;
      }
    }

    // Generate PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

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
    try {
      const qrCodeUrl = `https://oltzgidkjxwsukvkomof.supabase.co/functions/v1/qr-redirect/${subsectionId}`;
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

    // ===== COVER PAGE =====
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Header bar
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 50, 'F');

    // Add logo if available
    if (siteLogoUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            const logoHeight = 30;
            const logoWidth = (img.width / img.height) * logoHeight;
            doc.addImage(img, 'PNG', 15, 10, logoWidth, logoHeight);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = siteLogoUrl;
        });
      } catch (e) {
        console.error('Error loading logo:', e);
      }
    }

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('INSPECTION REPORT', pageWidth - 15, 32, { align: 'right' });

    // Main content area
    let yPos = 70;

    // Site and subsection info
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(siteName, 15, yPos);
    yPos += 10;

    doc.setFontSize(14);
    doc.setTextColor(100, 116, 139);
    doc.text(subsectionName, 15, yPos);
    yPos += 20;

    // Info grid
    doc.setFontSize(10);
    const infoItems = [
      { label: 'Template', value: template?.name || 'N/A' },
      { label: 'Inspector', value: generalInfo.inspectorName?.value || inspection.inspector_name || 'N/A' },
      { label: 'Date', value: inspection.inspection_date || date },
      { label: 'Status', value: inspection.status || 'Completed' },
    ];

    infoItems.forEach((item, index) => {
      const xPos = 15 + (index % 2) * 95;
      const itemY = yPos + Math.floor(index / 2) * 15;
      
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text(item.label + ':', xPos, itemY);
      
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text(item.value, xPos + 35, itemY);
    });

    yPos += 40;

    // QR Code
    if (qrCodeDataUrl) {
      doc.addImage(qrCodeDataUrl, 'PNG', pageWidth - 60, 60, 45, 45);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('Scan for details', pageWidth - 37.5, 110, { align: 'center' });
    }

    // Add new page for content
    doc.addPage();

    // Process template sections
    const sections = template.sections || [];
    yPos = 20;

    for (const section of sections) {
      if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = 20;
      }

      // Section header
      doc.setFillColor(241, 245, 249);
      doc.rect(10, yPos - 5, pageWidth - 20, 10, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(section.name || 'Section', 15, yPos + 2);
      yPos += 15;

      // Section items
      const sectionData = jsonData[section.id] || {};
      const items = section.items || [];

      for (const item of items) {
        if (yPos > pageHeight - 30) {
          doc.addPage();
          yPos = 20;
        }

        const itemData = sectionData[item.id] || {};
        
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'normal');
        doc.text(item.name || 'Item', 15, yPos);

        const status = itemData.status || 'N/A';
        const statusColor = status === 'Pass' ? [34, 197, 94] : 
                           status === 'Fail' ? [239, 68, 68] : 
                           status === 'N/A' ? [156, 163, 175] : [59, 130, 246];
        
        doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(status, pageWidth - 25, yPos, { align: 'right' });

        if (itemData.notes) {
          yPos += 5;
          doc.setFontSize(9);
          doc.setTextColor(100, 116, 139);
          doc.setFont('helvetica', 'italic');
          const splitNotes = doc.splitTextToSize(itemData.notes, pageWidth - 40);
          doc.text(splitNotes, 20, yPos);
          yPos += splitNotes.length * 4;
        }

        yPos += 8;
      }

      yPos += 5;
    }

    // Footer on last page
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(`Generated on ${date}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Create filename
    const sanitizedSite = siteName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const sanitizedSubsection = subsectionName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `${sanitizedSite}_${sanitizedSubsection}_Inspection_${dateStr}.pdf`;

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
        return { success: false, error: "Failed to create document category" };
      }
      categoryId = newCategory.id;
    }

    // Convert PDF to blob
    const pdfBlob = doc.output('blob');
    
    // Upload to storage
    const storagePath = `${subsectionId}/Inspection Reports/${fileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      return { success: false, error: `Failed to upload report: ${uploadError.message}` };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    // Create document record
    const { data: docData, error: docError } = await supabase
      .from('subsection_documents')
      .insert({
        subsection_id: subsectionId,
        category_id: categoryId,
        file_name: fileName,
        file_url: urlData.publicUrl,
        file_size: pdfBlob.size,
        uploaded_by: user.id
      })
      .select()
      .single();

    if (docError) {
      return { success: false, error: "Failed to save document record" };
    }

    return {
      success: true,
      documentId: docData.id,
      fileName,
      fileUrl: urlData.publicUrl
    };

  } catch (error) {
    console.error("Error generating and saving report:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}
