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

      // Image categories to check (Firebase format)
      const imageCategories = [
        'General', 'DB', 'Earthing', 'LV', 'HV', 'Generator', 'Relay', 'Signage'
      ];

      // ===== COVER PAGE =====
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(32);
      doc.setFont(undefined, 'bold');
      doc.text('Inspection Report', pageWidth / 2, 80, { align: 'center' });
      
      doc.setFontSize(18);
      doc.setFont(undefined, 'normal');
      doc.text(subsectionName, pageWidth / 2, 100, { align: 'center' });
      doc.text(siteName, pageWidth / 2, 115, { align: 'center' });
      
      doc.setFontSize(14);
      doc.text('Watson Mattheus', pageWidth / 2, 135, { align: 'center' });
      
      doc.setFontSize(12);
      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      doc.text(`Generated: ${date}`, pageWidth / 2, 155, { align: 'center' });

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

      // ===== TEMPLATE-BASED SECTIONS =====
      if (template && template.sections) {
        const sections = template.sections as any;
        
        for (const [sectionKey, section] of Object.entries(sections)) {
          const sectionData = section as any;
          const items = sectionData.items || {};
          
          // Check if there's data for this section
          const hasData = jsonData[sectionKey] && Object.keys(jsonData[sectionKey]).length > 0;
          
          if (Object.keys(items).length === 0 && !hasData) continue;

          if (yPos > pageHeight - 60) {
            doc.addPage();
            yPos = 20;
          }

          doc.setFontSize(18);
          doc.setFont(undefined, 'bold');
          doc.text(sectionData.name || sectionKey, 20, yPos);
          yPos += 10;

          const tableData: any[] = [];
          
          for (const [itemKey, item] of Object.entries(items)) {
            const itemInfo = item as any;
            const itemData = jsonData[sectionKey]?.[itemKey] || {};
            
            tableData.push([
              itemInfo.name || itemKey,
              itemData.status || 'N/A',
              itemData.notes || ''
            ]);
          }

          if (tableData.length > 0) {
            autoTable(doc, {
              startY: yPos,
              head: [['Item', 'Status', 'Notes']],
              body: tableData,
              theme: 'grid',
              headStyles: { fillColor: [41, 128, 185], textColor: 255 },
              styles: { fontSize: 9, cellPadding: 3 },
              margin: { left: 20, right: 20 }
            });

            yPos = (doc as any).lastAutoTable.finalY + 15;
          }
        }
      }

      // ===== ADDITIONAL DATA (for Firebase legacy format) =====
      const electrical = jsonData.electrical || {};
      const observations = jsonData.observations || [];
      const relayStatus = jsonData.relayStatus || {};

      // Electrical Details
      if (Object.keys(electrical).length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('Electrical Details', 20, yPos);
        yPos += 10;

        // Flatten electrical data
        const electricalData: any[] = [];
        const flattenObject = (obj: any, prefix = '') => {
          for (const [key, value] of Object.entries(obj)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              flattenObject(value, prefix + key + ' - ');
            } else {
              electricalData.push([
                prefix + key.replace(/([A-Z])/g, ' $1').trim(),
                String(value || 'N/A')
              ]);
            }
          }
        };
        flattenObject(electrical);

        if (electricalData.length > 0) {
          autoTable(doc, {
            startY: yPos,
            head: [],
            body: electricalData,
            theme: 'striped',
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: {
              0: { fontStyle: 'bold', cellWidth: 80 },
              1: { cellWidth: 100 }
            },
            margin: { left: 20, right: 20 }
          });
          yPos = (doc as any).lastAutoTable.finalY + 15;
        }
      }

      // Observations
      if (Array.isArray(observations) && observations.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('Observations', 20, yPos);
        yPos += 10;

        const observationData = observations.map((obs: any, index: number) => [
          `${index + 1}`,
          obs.description || obs.text || obs,
          obs.severity || 'N/A',
          obs.status || 'Open'
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['#', 'Description', 'Severity', 'Status']],
          body: observationData,
          theme: 'grid',
          headStyles: { fillColor: [41, 128, 185], textColor: 255 },
          styles: { fontSize: 9, cellPadding: 3 },
          margin: { left: 20, right: 20 }
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Relay Status
      if (Object.keys(relayStatus).length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('Relay Status', 20, yPos);
        yPos += 10;

        const relayData = Object.entries(relayStatus).map(([key, value]) => [
          key.replace(/([A-Z])/g, ' $1').trim(),
          String(value)
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [],
          body: relayData,
          theme: 'striped',
          styles: { fontSize: 9, cellPadding: 3 },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 80 },
            1: { cellWidth: 100 }
          },
          margin: { left: 20, right: 20 }
        });
      }

      // ===== IMAGES FROM TEMPLATE SECTIONS =====
      // First collect images from template-based sections
      if (template && template.sections) {
        const sections = template.sections as any;
        
        for (const [sectionKey, section] of Object.entries(sections)) {
          const sectionData = section as any;
          const items = sectionData.items || {};
          
          for (const [itemKey, item] of Object.entries(items)) {
            const itemData = jsonData[sectionKey]?.[itemKey] || {};
            const photos = itemData.photos || [];
            const images = itemData.images || {};
            
            // Combine photos array and images object
            const allImages: any[] = [...photos];
            if (typeof images === 'object') {
              allImages.push(...Object.values(images).filter((img: any) => img && (img.url || img.path)));
            }
            
            if (allImages.length > 0) {
              doc.addPage();
              yPos = 20;

              doc.setFontSize(18);
              doc.setFont(undefined, 'bold');
              doc.text(`${sectionData.name} - ${(item as any).name}`, 20, yPos);
              yPos += 15;

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

                    const imgWidth = 80;
                    const imgHeight = 60;

                    if (yPos + imgHeight > pageHeight - 20) {
                      doc.addPage();
                      yPos = 20;
                    }

                    doc.addImage(dataUrl, 'JPEG', 20, yPos, imgWidth, imgHeight);
                    
                    doc.setFontSize(8);
                    doc.setFont(undefined, 'normal');
                    const imgName = typeof img === 'object' ? (img.name || img.fileName || 'Image') : 'Image';
                    doc.text(imgName, 20, yPos + imgHeight + 5);
                    
                    yPos += imgHeight + 15;
                  }
                } catch (error) {
                  console.error('Error embedding image:', error);
                }
              }
            }
          }
        }
      }

      // ===== IMAGES FROM FIREBASE LEGACY FORMAT =====
      for (const category of imageCategories) {
        const images = jsonData[`images${category}`] || {};
        const imageArray = Object.values(images).filter((img: any) => img && img.url);

        if (imageArray.length > 0) {
          doc.addPage();
          yPos = 20;

          doc.setFontSize(18);
          doc.setFont(undefined, 'bold');
          doc.text(`${category} Images`, 20, yPos);
          yPos += 15;

          for (const img of imageArray as any[]) {
            try {
              // Try to load and embed image
              const imgUrl = img.url || img.path || img;
              if (typeof imgUrl === 'string') {
                const response = await fetch(imgUrl);
                const blob = await response.blob();
                const dataUrl = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });

                const imgWidth = 80;
                const imgHeight = 60;

                if (yPos + imgHeight > pageHeight - 20) {
                  doc.addPage();
                  yPos = 20;
                }

                doc.addImage(dataUrl, 'JPEG', 20, yPos, imgWidth, imgHeight);
                
                // Add image name/caption
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                doc.text(img.name || img.fileName || 'Image', 20, yPos + imgHeight + 5);
                
                yPos += imgHeight + 15;
              }
            } catch (error) {
              console.error('Error embedding image:', error);
              // Skip image if loading fails
            }
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
      {generating ? "Generating Report..." : "Generate Comprehensive Report"}
    </Button>
  );
};
