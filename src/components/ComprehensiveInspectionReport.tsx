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

      // ===== COVER PAGE =====
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(32);
      doc.setFont(undefined, 'bold');
      
      // Use template name if available
      const reportTitle = template?.name || 'Inspection Report';
      doc.text(reportTitle, pageWidth / 2, 70, { align: 'center' });
      
      // Use template cover page data if available
      const coverPage = template?.cover_page || {};
      
      doc.setFontSize(18);
      doc.setFont(undefined, 'normal');
      doc.text(subsectionName, pageWidth / 2, 95, { align: 'center' });
      doc.text(siteName, pageWidth / 2, 110, { align: 'center' });
      
      doc.setFontSize(14);
      const companyName = coverPage.company || 'Watson Mattheus';
      doc.text(companyName, pageWidth / 2, 130, { align: 'center' });
      
      // Add template description if available
      if (template?.description) {
        doc.setFontSize(11);
        const splitDescription = doc.splitTextToSize(template.description, pageWidth - 60);
        doc.text(splitDescription, pageWidth / 2, 145, { align: 'center' });
      }
      
      doc.setFontSize(12);
      doc.text(`Generated: ${date}`, pageWidth / 2, pageHeight - 40, { align: 'center' });

      // ===== GENERAL INFORMATION =====
      doc.addPage();
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      doc.text('General Information', 20, 20);

      let yPos = 35;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');

      const generalInfo = jsonData.generalInfo || {};
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
        
        for (const [sectionKey, section] of Object.entries(sections)) {
          const sectionData = section as any;
          const items = sectionData.items || {};
          
          if (Object.keys(items).length === 0) continue;

          // Start new page for each section
          doc.addPage();
          yPos = 20;

          // Section header
          doc.setFontSize(20);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(41, 128, 185);
          const sectionTitle = (sectionData.name || sectionKey).toUpperCase();
          doc.text(sectionTitle, pageWidth / 2, yPos, { align: 'center' });
          yPos += 15;

          // Reset text color
          doc.setTextColor(0, 0, 0);

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

            // Check if we need a new page (need space for item header + at least one photo)
            if (yPos > pageHeight - 100) {
              doc.addPage();
              yPos = 20;
            }

            // Item number and name
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text(`${itemNumber}. ${itemInfo.name || itemKey}`, 20, yPos);
            yPos += 10;

            // Display photos if available
            if (allImages.length > 0) {
              const imgWidth = 80;
              const imgHeight = 60;
              const leftMargin = 30;

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

                    // Check if we need a new page for this image
                    if (yPos + imgHeight + 15 > pageHeight - 20) {
                      doc.addPage();
                      yPos = 20;
                    }

                    // Draw photo
                    doc.addImage(dataUrl, 'JPEG', leftMargin, yPos, imgWidth, imgHeight);
                    yPos += imgHeight + 5;
                  }
                } catch (error) {
                  console.error('Error embedding image:', error);
                  // Draw placeholder box if image fails
                  doc.setDrawColor(200, 200, 200);
                  doc.setFillColor(245, 245, 245);
                  doc.rect(leftMargin, yPos, imgWidth, imgHeight, 'FD');
                  doc.setFontSize(10);
                  doc.setFont(undefined, 'italic');
                  doc.setTextColor(128, 128, 128);
                  doc.text('Photo', leftMargin + imgWidth / 2, yPos + imgHeight / 2, { align: 'center' });
                  doc.text('Placeholder', leftMargin + imgWidth / 2, yPos + imgHeight / 2 + 5, { align: 'center' });
                  doc.setTextColor(0, 0, 0);
                  yPos += imgHeight + 5;
                }
              }
            } else {
              // Draw placeholder box if no images
              const imgWidth = 80;
              const imgHeight = 60;
              const leftMargin = 30;
              
              if (yPos + imgHeight + 15 > pageHeight - 20) {
                doc.addPage();
                yPos = 20;
              }
              
              doc.setDrawColor(200, 200, 200);
              doc.setFillColor(245, 245, 245);
              doc.rect(leftMargin, yPos, imgWidth, imgHeight, 'FD');
              doc.setFontSize(10);
              doc.setFont(undefined, 'italic');
              doc.setTextColor(128, 128, 128);
              doc.text('Photo', leftMargin + imgWidth / 2, yPos + imgHeight / 2, { align: 'center' });
              doc.text('Placeholder', leftMargin + imgWidth / 2, yPos + imgHeight / 2 + 5, { align: 'center' });
              doc.setTextColor(0, 0, 0);
              yPos += imgHeight + 5;
            }

            // Display notes if available
            if (itemData.notes) {
              doc.setFontSize(10);
              doc.setFont(undefined, 'normal');
              doc.text('Notes:', 30, yPos);
              yPos += 5;
              
              const notesLines = doc.splitTextToSize(itemData.notes, pageWidth - 60);
              doc.text(notesLines, 30, yPos);
              yPos += (notesLines.length * 5) + 5;
            }

            // Add spacing between items
            yPos += 10;
            itemNumber++;
          }
        }
      }

      // ===== FOOTER =====
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(128, 128, 128);
        if (i > 1) {
          doc.text(
            `Page ${i - 1} of ${totalPages - 1}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
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
