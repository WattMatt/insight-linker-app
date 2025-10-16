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
      doc.setFontSize(28);
      doc.setFont(undefined, 'bold');
      
      // Use template name if available
      const reportTitle = template?.name || 'Inspection Report';
      doc.text(reportTitle, pageWidth / 2, 60, { align: 'center' });
      
      doc.setFontSize(22);
      doc.setFont(undefined, 'bold');
      doc.text(subsectionName, pageWidth / 2, 85, { align: 'center' });
      
      doc.setFontSize(14);
      doc.setFont(undefined, 'normal');
      doc.text(`Report Date: ${date}`, pageWidth / 2, 105, { align: 'center' });
      
      const inspector = generalInfo.inspectorName || inspectionData.inspectorName || inspectionData.inspector_name || 'Inspector';
      const project = generalInfo.projectName || inspectionData.projectName || inspectionData.project_name || siteName;
      const location = generalInfo.location || inspectionData.location || siteName;
      
      doc.text(`Inspector: ${inspector}`, pageWidth / 2, 120, { align: 'center' });
      doc.text(`Project: ${project}`, pageWidth / 2, 135, { align: 'center' });
      doc.text(`Location: ${location}`, pageWidth / 2, 150, { align: 'center' });
      
      // Use template cover page data if available
      const coverPage = template?.cover_page || {};
      const companyName = coverPage.company || 'Watson Mattheus';
      
      doc.setFontSize(12);
      doc.text(companyName, pageWidth / 2, 175, { align: 'center' });
      
      // Add template description if available
      if (template?.description) {
        doc.setFontSize(10);
        const splitDescription = doc.splitTextToSize(template.description, pageWidth - 60);
        doc.text(splitDescription, pageWidth / 2, 195, { align: 'center' });
      }

      // ===== GENERAL INFORMATION =====
      doc.addPage();
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      doc.text('General Information', 20, 20);

      let yPos = 35;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');

      const generalInfoData = [
        ['Project Name', generalInfo.projectName || inspectionData.projectName || inspectionData.project_name || 'N/A'],
        ['Shop Number', generalInfo.shopNumber || inspectionData.shopNumber || inspectionData.shop_number || 'N/A'],
        ['Shop Name', generalInfo.shopName || inspectionData.shopName || inspectionData.shop_name || 'N/A'],
        ['Inspector Name', generalInfo.inspectorName || inspectionData.inspectorName || inspectionData.inspector_name || 'N/A'],
        ['Inspection Date', generalInfo.date || inspectionData.date || inspectionData.inspection_date || 'N/A'],
        ['Client Representative', generalInfo.clientRep || inspectionData.clientRep || inspectionData.client_rep || 'N/A'],
        ['Consultant', generalInfo.consultant || inspectionData.consultant || 'N/A'],
        ['Contractor', generalInfo.contractor || inspectionData.contractor || 'N/A'],
        ['Testing Party', generalInfo.testingParty || inspectionData.testingParty || inspectionData.testing_party || 'N/A'],
        ['Location', generalInfo.location || inspectionData.location || 'N/A'],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: generalInfoData,
        theme: 'striped',
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 60 },
          1: { cellWidth: 120 }
        },
        margin: { left: 20, right: 20 }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // ===== TEMPLATE-BASED SECTIONS WITH VISUAL LAYOUT =====
      if (template && template.sections) {
        const sections = template.sections as any;
        let pageCounter = 2; // Start from page 2 (after cover and general info)
        
        for (const [sectionKey, section] of Object.entries(sections)) {
          const sectionData = section as any;
          const items = sectionData.items || {};
          
          if (Object.keys(items).length === 0) continue;

          // Start new page for each section
          doc.addPage();
          yPos = 30;

          // Section header - centered and styled
          doc.setFontSize(16);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(0, 0, 0);
          const sectionTitle = (sectionData.name || sectionKey).toUpperCase();
          doc.text(sectionTitle, pageWidth / 2, yPos, { align: 'center' });
          yPos += 20;

          let itemNumber = 1;
          
          for (const [itemKey, item] of Object.entries(items)) {
            const itemInfo = item as any;
            const itemData = jsonData[sectionKey]?.[itemKey] || {};
            const photos = itemData.photos || [];
            const images = itemData.images || {};
            
            // Combine photos array and images object
            const allImages: any[] = [...photos];
            if (typeof images === 'object') {
              allImages.push(...Object.values(images).filter((img: any) => img && (img.url || img.path)));
            }

            // Calculate space needed for this item
            const photoHeight = 100;
            const itemHeaderHeight = 15;
            const notesHeight = itemData.notes ? 25 : 0;
            const totalItemHeight = itemHeaderHeight + photoHeight + notesHeight + 20;

            // Check if we need a new page
            if (yPos + totalItemHeight > pageHeight - 30) {
              doc.addPage();
              yPos = 30;
              pageCounter++;
            }

            // Item number and name
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text(`${itemNumber}. ${itemInfo.name || itemKey}`, 20, yPos);
            yPos += 12;

            // Display photo or placeholder
            const imgWidth = 120;
            const imgHeight = 90;
            const imgX = 30;

            if (allImages.length > 0) {
              // Use the first image
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
                  doc.setDrawColor(180, 180, 180);
                  doc.setLineWidth(0.5);
                  doc.addImage(dataUrl, 'JPEG', imgX, yPos, imgWidth, imgHeight);
                  doc.rect(imgX, yPos, imgWidth, imgHeight);
                  yPos += imgHeight + 8;
                }
              } catch (error) {
                console.error('Error embedding image:', error);
                // Draw placeholder on error
                doc.setDrawColor(200, 200, 200);
                doc.setFillColor(250, 250, 250);
                doc.setLineWidth(0.5);
                doc.rect(imgX, yPos, imgWidth, imgHeight, 'FD');
                
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(150, 150, 150);
                doc.text('Photo', imgX + imgWidth / 2, yPos + imgHeight / 2 - 3, { align: 'center' });
                doc.text('Placeholder', imgX + imgWidth / 2, yPos + imgHeight / 2 + 3, { align: 'center' });
                doc.setTextColor(0, 0, 0);
                yPos += imgHeight + 8;
              }
            } else {
              // Draw placeholder box
              doc.setDrawColor(200, 200, 200);
              doc.setFillColor(250, 250, 250);
              doc.setLineWidth(0.5);
              doc.rect(imgX, yPos, imgWidth, imgHeight, 'FD');
              
              doc.setFontSize(10);
              doc.setFont(undefined, 'normal');
              doc.setTextColor(150, 150, 150);
              doc.text('Photo', imgX + imgWidth / 2, yPos + imgHeight / 2 - 3, { align: 'center' });
              doc.text('Placeholder', imgX + imgWidth / 2, yPos + imgHeight / 2 + 3, { align: 'center' });
              doc.setTextColor(0, 0, 0);
              yPos += imgHeight + 8;
            }

            // Display notes if available
            if (itemData.notes) {
              doc.setFontSize(9);
              doc.setFont(undefined, 'normal');
              doc.text('Notes:', imgX, yPos);
              yPos += 5;
              
              const notesLines = doc.splitTextToSize(itemData.notes, pageWidth - 60);
              doc.text(notesLines, imgX, yPos);
              yPos += (notesLines.length * 4) + 5;
            }

            // Add spacing between items
            yPos += 15;
            itemNumber++;
          }
          
          pageCounter++;
        }
      }

      // ===== FOOTER =====
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        if (i > 1) {
          const footerText = `${reportTitle} - Page ${i - 1}`;
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
