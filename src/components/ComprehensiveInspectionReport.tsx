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
}

export const ComprehensiveInspectionReport = ({
  inspectionData,
  siteName,
  subsectionName,
  templateId,
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

      // ===== COVER PAGE =====
      doc.setFillColor(21, 122, 171); // Blue background matching template
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      doc.setTextColor(255, 255, 255); // White text
      
      // Main title at top (larger)
      doc.setFontSize(32);
      doc.setFont(undefined, 'bold');
      const reportTitle = template?.name || 'Inspection Report';
      doc.text(reportTitle, pageWidth / 2, 60, { align: 'center' });
      
      // Description/subtitle below title (smaller, wrapped)
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      const subtitle = template?.description || 'Comprehensive audit template for line shop electrical boards including visual documentation, component verification, and quality assessment';
      const subtitleLines = doc.splitTextToSize(subtitle, pageWidth - 40);
      doc.text(subtitleLines, pageWidth / 2, 80, { align: 'center' });
      
      // Report details in the middle section
      doc.setFontSize(13);
      const inspector = generalInfo.inspectorName || inspectionData.inspectorName || inspectionData.inspector_name || 'Preview Inspector';
      const project = generalInfo.projectName || inspectionData.projectName || inspectionData.project_name || siteName;
      const location = generalInfo.location || inspectionData.location || siteName;
      
      const midY = pageHeight / 2 - 20;
      doc.text(`Report Date: ${date}`, pageWidth / 2, midY, { align: 'center' });
      doc.text(`Inspector: ${inspector}`, pageWidth / 2, midY + 15, { align: 'center' });
      doc.text(`Project: ${project}`, pageWidth / 2, midY + 30, { align: 'center' });
      doc.text(`Location: ${location}`, pageWidth / 2, midY + 45, { align: 'center' });
      
      // Company name at bottom (larger, bold)
      const coverPage = template?.cover_page || {};
      const companyName = coverPage.company || 'Watson Mattheus';
      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      doc.text(companyName, pageWidth / 2, pageHeight - 60, { align: 'center' });
      
      // Tagline below company name
      doc.setFontSize(13);
      doc.setFont(undefined, 'normal');
      doc.text('Inspection & Compliance Report', pageWidth / 2, pageHeight - 42, { align: 'center' });

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
            
            // Calculate space needed for this item box
            const itemBoxHeight = hasNotes ? 95 : 75; // Taller if notes exist
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

            // Photo area (left side of box)
            const photoX = 25;
            const photoY = yPos + 15;
            const photoWidth = 65;
            const photoHeight = 50;

            if (hasImages) {
              // Show actual image
              const img = allImages[0];
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

                  // Draw photo with border
                  doc.setDrawColor(200, 200, 200);
                  doc.setLineWidth(0.5);
                  doc.addImage(dataUrl, 'JPEG', photoX, photoY, photoWidth, photoHeight);
                  doc.rect(photoX, photoY, photoWidth, photoHeight);
                }
              } catch (error) {
                console.error('Error embedding image:', error);
                // Draw placeholder on error
                doc.setDrawColor(200, 200, 200);
                doc.setFillColor(250, 250, 250);
                doc.rect(photoX, photoY, photoWidth, photoHeight, 'FD');
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(180, 180, 180);
                doc.text('Photo', photoX + photoWidth / 2, photoY + photoHeight / 2 - 2, { align: 'center' });
                doc.text('Placeholder', photoX + photoWidth / 2, photoY + photoHeight / 2 + 2, { align: 'center' });
                doc.setTextColor(0, 0, 0);
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

            // Display notes if available (to the right of photo or below)
            if (hasNotes) {
              doc.setFontSize(9);
              doc.setFont(undefined, 'bold');
              doc.text('Notes:', 25, photoY + photoHeight + 8);
              
              doc.setFont(undefined, 'normal');
              const notesLines = doc.splitTextToSize(itemData.notes, pageWidth - 60);
              doc.text(notesLines, 25, photoY + photoHeight + 14);
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
