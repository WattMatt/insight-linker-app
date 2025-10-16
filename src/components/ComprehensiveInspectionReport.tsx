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
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      doc.setTextColor(255, 255, 255);
      
      // Main title
      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      const reportTitle = template?.name || 'Inspection Report';
      doc.text(reportTitle, pageWidth / 2, 50, { align: 'center' });
      
      // Subtitle
      doc.setFontSize(16);
      doc.setFont(undefined, 'normal');
      const coverPage = template?.cover_page || {};
      const subtitle = template?.description || 'Inspection & Compliance Report';
      doc.text(subtitle, pageWidth / 2, 70, { align: 'center' });
      
      // Report details
      doc.setFontSize(12);
      const inspector = generalInfo.inspectorName || inspectionData.inspectorName || inspectionData.inspector_name || 'Preview Inspector';
      const project = generalInfo.projectName || inspectionData.projectName || inspectionData.project_name || siteName;
      const location = generalInfo.location || inspectionData.location || siteName;
      
      doc.text(`Report Date: ${date}`, pageWidth / 2, 100, { align: 'center' });
      doc.text(`Inspector: ${inspector}`, pageWidth / 2, 112, { align: 'center' });
      doc.text(`Project: ${project}`, pageWidth / 2, 124, { align: 'center' });
      doc.text(`Location: ${location}`, pageWidth / 2, 136, { align: 'center' });
      
      // Company name at bottom
      const companyName = coverPage.company || 'Watson Mattheus';
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text(companyName, pageWidth / 2, pageHeight - 60, { align: 'center' });
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.text('Inspection & Compliance Report', pageWidth / 2, pageHeight - 45, { align: 'center' });

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
          yPos = 25;

          // Section header - ALL CAPS at top
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(0, 0, 0);
          const sectionTitle = (sectionData.name || sectionKey).toUpperCase();
          doc.text(sectionTitle, pageWidth / 2, yPos, { align: 'center' });
          yPos += 20;

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
            
            // Calculate space needed for this item
            const itemHeaderHeight = 15;
            const photoHeight = hasImages ? 75 : 0; // Standard photo height or 0
            const photoSpacing = hasImages ? 8 : 0;
            const notesHeight = hasNotes ? 25 : 0;
            const itemSpacing = 20; // Space between items
            const totalItemHeight = itemHeaderHeight + photoHeight + photoSpacing + notesHeight + itemSpacing;

            // Check if we need a new page
            if (yPos + totalItemHeight > pageHeight - 30) {
              doc.addPage();
              pageNumber++;
              yPos = 30;
            }

            // ALWAYS show item number and name
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text(`${itemNumber}. ${itemInfo.name || itemKey}`, 20, yPos);
            yPos += itemHeaderHeight;

            // Only show photo if it exists
            if (hasImages) {
              const imgWidth = 100;
              const imgHeight = 75;
              const imgX = 30;
              
              // Use only the first image to match template layout
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
                  doc.setDrawColor(220, 220, 220);
                  doc.setLineWidth(0.5);
                  doc.addImage(dataUrl, 'JPEG', imgX, yPos, imgWidth, imgHeight);
                  doc.rect(imgX, yPos, imgWidth, imgHeight);
                  yPos += imgHeight + photoSpacing;
                }
              } catch (error) {
                console.error('Error embedding image:', error);
                // Skip to next item if image fails
                yPos += photoSpacing;
              }
            }

            // Display notes if available
            if (hasNotes) {
              doc.setFontSize(9);
              doc.setFont(undefined, 'normal');
              doc.text('Notes:', 30, yPos);
              yPos += 5;
              
              const notesLines = doc.splitTextToSize(itemData.notes, pageWidth - 60);
              doc.text(notesLines, 30, yPos);
              yPos += (notesLines.length * 4);
            }

            // Add spacing between items
            yPos += itemSpacing;
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
