import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

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

interface SignatureData {
  id: string;
  signer_type: string;
  signer_name: string;
  signer_email: string | null;
  signature_data: string;
  signed_at: string;
}

/**
 * Generates a comprehensive inspection report PDF and saves it to the documents folder
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
    const jsonData: Record<string, any> = (inspection.json_data as Record<string, any>) || {};
    const generalInfo = jsonData.generalInfo || {};

    // Fetch snags for this subsection
    const { data: snagsData } = await supabase
      .from('snags')
      .select('*')
      .eq('subsection_id', subsectionId);
    const snags = snagsData || [];

    // Generate PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const date = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

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
    doc.rect(0, 0, pageWidth, 25, 'F');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text('INSPECTION REPORT', pageWidth / 2, 16, { align: 'center' });

    // QR Code in top left corner
    if (qrCodeDataUrl) {
      const qrSize = 35;
      doc.addImage(qrCodeDataUrl, 'PNG', 20, 30, qrSize, qrSize);
    }

    // Main title
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

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);

    const inspector = generalInfo.inspectorName?.value || generalInfo.inspectorName || inspection.inspector_name || 'N/A';
    const project = generalInfo.projectName?.value || generalInfo.projectName || inspection.project_name || siteName;
    const location = generalInfo.location?.value || generalInfo.location || inspection.location || siteName;

    let detailY = detailsBoxY + 15;
    doc.setFont(undefined, 'bold');
    doc.text('Report Date:', 55, detailY);
    doc.setFont(undefined, 'normal');
    doc.text(date, 95, detailY);

    detailY += 12;
    doc.setFont(undefined, 'bold');
    doc.text('Inspector:', 55, detailY);
    doc.setFont(undefined, 'normal');
    doc.text(String(inspector), 95, detailY);

    detailY += 12;
    doc.setFont(undefined, 'bold');
    doc.text('Project:', 55, detailY);
    doc.setFont(undefined, 'normal');
    doc.text(String(project), 95, detailY);

    detailY += 12;
    doc.setFont(undefined, 'bold');
    doc.text('Location:', 55, detailY);
    doc.setFont(undefined, 'normal');
    doc.text(String(location), 95, detailY);

    // Company name at bottom
    const coverPage = template?.cover_page || {};
    const companyName = coverPage.company || 'Watson Mattheus';
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(companyName, pageWidth / 2, pageHeight - 45, { align: 'center' });

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

    const getValue = (obj: any, key: string) => {
      if (!obj) return 'N/A';
      const val = obj[key];
      if (typeof val === 'object' && val?.value) return val.value;
      return val || 'N/A';
    };

    const generalInfoFields = [
      ['PROJECT NAME:', getValue(generalInfo, 'projectName') || inspection.project_name || siteName],
      ['INSPECTOR NAME:', getValue(generalInfo, 'inspectorName') || inspection.inspector_name || 'N/A'],
      ['INSPECTION DATE:', getValue(generalInfo, 'date') || inspection.inspection_date || date],
      ['CLIENT REPRESENTATIVE:', getValue(generalInfo, 'clientRep') || inspection.client_rep || 'N/A'],
      ['CONSULTANT NAME:', getValue(generalInfo, 'consultant') || inspection.consultant || 'N/A'],
      ['CONTRACTOR NAME:', getValue(generalInfo, 'contractor') || inspection.contractor || 'N/A'],
      ['LOCATION:', getValue(generalInfo, 'location') || inspection.location || siteName],
    ];

    for (const [label, value] of generalInfoFields) {
      doc.setFont(undefined, 'bold');
      doc.text(label, 25, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(String(value), 80, yPos);
      yPos += 10;
    }

    // ===== TEMPLATE-BASED SECTIONS WITH VISUAL LAYOUT =====
    if (template && template.sections) {
      const sections = Array.isArray(template.sections) ? template.sections : Object.values(template.sections);

      for (const section of sections) {
        const sectionData = section as any;
        const sectionId = String(sectionData.id ?? '');
        const items = Array.isArray(sectionData.items) ? sectionData.items : Object.values(sectionData.items || {});

        if (items.length === 0) continue;

        // Start new page for each section
        doc.addPage();
        yPos = 20;

        // Section header - Blue background bar with white text
        doc.setFillColor(21, 122, 171);
        doc.rect(0, yPos, pageWidth, 15, 'F');
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        const sectionTitle = (sectionData.name || sectionId).toUpperCase();
        doc.text(sectionTitle, pageWidth / 2, yPos + 10, { align: 'center' });
        yPos += 25;

        doc.setTextColor(0, 0, 0);

        let itemNumber = 1;

        for (let i = 0; i < items.length; i++) {
          const itemInfo = items[i] as any;
          const itemId = String(itemInfo.id ?? i);
          const itemData = jsonData[sectionId]?.[itemId] || {};
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

          const imagesPerRow = 2;
          const imageRows = hasImages ? Math.ceil(allImages.length / imagesPerRow) : 1;
          const totalImageHeight = hasImages ? (imageRows * photoHeight) + ((imageRows - 1) * photoSpacing) : photoHeight;

          const itemBoxHeight = 15 + totalImageHeight + (hasNotes ? 25 : 0) + 15;
          const itemMargin = 10;

          if (yPos + itemBoxHeight + itemMargin > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
          }

          // Draw item container box
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.5);
          doc.rect(20, yPos, pageWidth - 40, itemBoxHeight);

          // Item title
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.text(`${itemNumber}. ${itemInfo.name || itemId}`, 25, yPos + 8);

          // Status (right side)
          const status = itemData.status || 'N/A';
          const statusColor = status === 'Pass' ? [34, 197, 94] : 
                             status === 'Fail' ? [239, 68, 68] : 
                             status === 'N/A' ? [156, 163, 175] : [59, 130, 246];
          doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
          doc.setFont(undefined, 'bold');
          doc.text(status, pageWidth - 25, yPos + 8, { align: 'right' });
          doc.setTextColor(0, 0, 0);

          // Photo area
          let photoX = 25;
          let photoY = yPos + 15;

          if (hasImages) {
            let imgIndex = 0;
            for (const img of allImages) {
              try {
                const imgUrl = typeof img === 'string' ? img : (img.url || img.path);
                if (typeof imgUrl === 'string') {
                  const response = await fetch(imgUrl);
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
                console.error('Error embedding image:', error);
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
                doc.text('Photo Error', currentX + photoWidth / 2, currentY + photoHeight / 2, { align: 'center' });
                doc.setTextColor(0, 0, 0);

                imgIndex++;
              }
            }
          } else {
            // Placeholder
            doc.setDrawColor(200, 200, 200);
            doc.setFillColor(250, 250, 250);
            doc.setLineWidth(0.5);
            doc.rect(photoX, photoY, photoWidth, photoHeight, 'FD');
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(180, 180, 180);
            doc.text('No Photo', photoX + photoWidth / 2, photoY + photoHeight / 2, { align: 'center' });
            doc.setTextColor(0, 0, 0);
          }

          // Notes
          if (hasNotes) {
            const notesY = photoY + totalImageHeight + 8;
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text('Notes:', 25, notesY);
            doc.setFont(undefined, 'normal');
            const notesLines = doc.splitTextToSize(itemData.notes, pageWidth - 60);
            doc.text(notesLines, 25, notesY + 6);
          }

          yPos += itemBoxHeight + itemMargin;
          itemNumber++;
        }
      }
    }

    // ===== SNAGS SECTION =====
    if (snags && snags.length > 0) {
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

      let snagNumber = 1;
      for (const snag of snags) {
        const snagPhotos = (snag.photos as string[]) || [];
        const photoWidth = 65;
        const photoHeight = 50;
        const snagBoxHeight = 80 + (snagPhotos.length > 0 ? photoHeight + 10 : 0);

        if (yPos + snagBoxHeight + 10 > pageHeight - 20) {
          doc.addPage();
          yPos = 20;
        }

        const statusColor = snag.status === 'Open' ? [220, 53, 69] : [40, 167, 69];
        doc.setDrawColor(statusColor[0], statusColor[1], statusColor[2]);
        doc.setLineWidth(1);
        doc.rect(20, yPos, pageWidth - 40, snagBoxHeight);

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`${snagNumber}. ${snag.title}`, 25, yPos + 8);

        doc.setFontSize(9);
        const statusX = pageWidth - 50;
        doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
        doc.roundedRect(statusX, yPos + 3, 25, 8, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(snag.status, statusX + 12.5, yPos + 8.5, { align: 'center' });
        doc.setTextColor(0, 0, 0);

        let infoY = yPos + 18;
        if (snag.risk_level) {
          doc.setFont(undefined, 'bold');
          doc.text('Risk:', 25, infoY);
          doc.setFont(undefined, 'normal');
          doc.text(snag.risk_level, 45, infoY);
          infoY += 8;
        }

        if (snag.description) {
          doc.setFont(undefined, 'normal');
          const descLines = doc.splitTextToSize(snag.description, pageWidth - 60);
          doc.text(descLines.slice(0, 3), 25, infoY);
        }

        yPos += snagBoxHeight + 10;
        snagNumber++;
      }
    }

    // ===== SIGNATURES PAGE =====
    try {
      const { data: signaturesData } = await supabase
        .from('inspection_signatures')
        .select('*')
        .eq('inspection_id', inspectionId);

      if (signaturesData && signaturesData.length > 0) {
        doc.addPage();
        let sigY = 25;

        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text('Sign-Off Signatures', pageWidth / 2, sigY, { align: 'center' });
        sigY += 20;

        const sigBoxWidth = (pageWidth - 50) / 2;
        const sigBoxHeight = 80;
        let sigCol = 0;
        let sigRow = 0;

        const signerTypeLabels: Record<string, string> = {
          'inspector': 'Inspector',
          'contractor': 'Contractor',
          'client': 'Client Representative',
          'witness': 'Witness'
        };

        for (const sig of signaturesData as SignatureData[]) {
          const boxX = 20 + (sigCol * (sigBoxWidth + 10));
          const boxY = sigY + (sigRow * (sigBoxHeight + 10));

          doc.setDrawColor(200, 200, 200);
          doc.setFillColor(250, 250, 250);
          doc.roundedRect(boxX, boxY, sigBoxWidth, sigBoxHeight, 3, 3, 'FD');

          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(signerTypeLabels[sig.signer_type] || sig.signer_type, boxX + 5, boxY + 10);

          try {
            doc.addImage(sig.signature_data, 'PNG', boxX + 10, boxY + 15, sigBoxWidth - 20, 35);
          } catch (e) {
            console.error('Error adding signature:', e);
          }

          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          doc.text(sig.signer_name, boxX + 5, boxY + sigBoxHeight - 15);

          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          const signedDate = new Date(sig.signed_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
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
      console.error('Error fetching signatures:', error);
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

    const { error: uploadError } = await supabase.storage
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

    // Check for existing document
    const { data: existingDoc } = await supabase
      .from('subsection_documents')
      .select('id')
      .eq('subsection_id', subsectionId)
      .eq('file_name', fileName)
      .maybeSingle();

    let docId: string;
    if (existingDoc) {
      await supabase
        .from('subsection_documents')
        .update({
          file_url: urlData.publicUrl,
          file_size: pdfBlob.size,
          uploaded_at: new Date().toISOString()
        })
        .eq('id', existingDoc.id);
      docId = existingDoc.id;
    } else {
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
      docId = docData.id;
    }

    return {
      success: true,
      documentId: docId,
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
