import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

interface ComprehensiveInspectionReportProps {
  inspectionData: any;
  siteName: string;
  subsectionName: string;
  templateId?: string | null;
  subsectionId?: string;
  siteLogoUrl?: string | null;
  companyLogoUrl?: string | null;
}

export const ComprehensiveInspectionReport = ({
  inspectionData,
  siteName,
  subsectionName,
  templateId,
  subsectionId,
  siteLogoUrl,
  companyLogoUrl,
}: ComprehensiveInspectionReportProps) => {
  const [generating, setGenerating] = useState(false);

  const generateReport = async () => {
    try {
      setGenerating(true);
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Extract inspection data
      const jsonData = inspectionData?.jsonData?.jsonData || inspectionData?.jsonData || {};
      
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
        return;
      }

      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Extract general info once for reuse
      const generalInfo = jsonData.generalInfo || {};

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
            // Generate QR code URL that points to the public subsection page
            const qrCodeUrl = `https://oltzgidkjxwsukvkomof.supabase.co/functions/v1/qr-redirect?subsection=${subId}`;
            
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
            if (companyLogoUrl) {
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
                  
                  img.src = companyLogoUrl;
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
        const sections = template.sections as any;
        let pageNumber = 1;
        
        for (const [sectionKey, section] of Object.entries(sections)) {
          const sectionData = section as any;
          const items = sectionData.items || {};
          
          if (Object.keys(items).length === 0) continue;

          // Start new page for each section
          doc.addPage();
          yPos = 20;

          // Section header - Blue background bar with white text
          doc.setFillColor(21, 122, 171); // Blue color
          doc.rect(0, yPos, pageWidth, 15, 'F');
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(255, 255, 255); // White text
          const sectionTitle = (sectionData.name || sectionKey).toUpperCase();
          doc.text(sectionTitle, pageWidth / 2, yPos + 10, { align: 'center' });
          yPos += 25;

          // Reset text color for items
          doc.setTextColor(0, 0, 0);

          let itemNumber = 1;
          const itemEntries = Object.entries(items);
          
          for (let i = 0; i < itemEntries.length; i++) {
            const [itemKey, item] = itemEntries[i];
            const itemInfo = item as any;
            const itemData = jsonData[sectionKey]?.[itemKey] || {};
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
            doc.text(`${itemNumber}. ${itemInfo.name || itemKey}`, 25, yPos + 8);

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
                    const response = await fetch(imgUrl);
                    const blob = await response.blob();
                    const dataUrl = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });

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

      doc.save(`${subsectionName}_Inspection_Report_${date}.pdf`);
      toast.success("Report generated successfully");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button onClick={generateReport} disabled={generating} variant="default">
      <FileText className="mr-2 h-4 w-4" />
      {generating ? "Generating PDF..." : "Generate PDF"}
    </Button>
  );
};
