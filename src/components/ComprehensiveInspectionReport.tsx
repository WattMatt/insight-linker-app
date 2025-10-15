import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ComprehensiveInspectionReportProps {
  inspectionData: any;
  siteName: string;
  subsectionName: string;
}

export const ComprehensiveInspectionReport = ({
  inspectionData,
  siteName,
  subsectionName,
}: ComprehensiveInspectionReportProps) => {
  const [generating, setGenerating] = useState(false);

  const generateReport = async () => {
    try {
      setGenerating(true);
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Extract Firebase data structure
      const firebaseData = inspectionData?.jsonData?.jsonData || inspectionData?.jsonData || {};
      const generalInfo = firebaseData.generalInfo || {};
      const electrical = firebaseData.electrical || {};
      const observations = firebaseData.observations || [];
      const relayStatus = firebaseData.relayStatus || {};

      // Image categories
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

      const generalInfoData = [
        ['Project Name', generalInfo.projectName || inspectionData.projectName || 'N/A'],
        ['Shop Number', generalInfo.shopNumber || inspectionData.shopNumber || 'N/A'],
        ['Shop Name', generalInfo.shopName || inspectionData.shopName || 'N/A'],
        ['Inspector Name', generalInfo.inspectorName || inspectionData.inspectorName || 'N/A'],
        ['Inspection Date', generalInfo.date || inspectionData.date || 'N/A'],
        ['Client Representative', generalInfo.clientRep || inspectionData.clientRep || 'N/A'],
        ['Consultant', generalInfo.consultant || inspectionData.consultant || 'N/A'],
        ['Contractor', generalInfo.contractor || inspectionData.contractor || 'N/A'],
        ['Testing Party', generalInfo.testingParty || inspectionData.testingParty || 'N/A'],
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

      // ===== ELECTRICAL DETAILS =====
      if (Object.keys(electrical).length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('Electrical Details', 20, yPos);
        yPos += 10;

        // DB Details
        if (electrical.dbDetails) {
          const dbData = [
            ['DB Number', electrical.dbDetails.dbNumber || 'N/A'],
            ['DB Rating', electrical.dbDetails.dbRating || 'N/A'],
            ['Voltage', electrical.dbDetails.voltage || 'N/A'],
            ['Type', electrical.dbDetails.type || 'N/A'],
          ];

          autoTable(doc, {
            startY: yPos,
            head: [['DB Details', '']],
            body: dbData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: {
              0: { fontStyle: 'bold', cellWidth: 60 },
              1: { cellWidth: 120 }
            },
            margin: { left: 20, right: 20 }
          });

          yPos = (doc as any).lastAutoTable.finalY + 10;
        }

        // Earthing Details
        if (electrical.earthing) {
          if (yPos > pageHeight - 40) {
            doc.addPage();
            yPos = 20;
          }

          const earthingData = [
            ['Type', electrical.earthing.type || 'N/A'],
            ['Resistance', electrical.earthing.resistance || 'N/A'],
            ['Test Date', electrical.earthing.testDate || 'N/A'],
          ];

          autoTable(doc, {
            startY: yPos,
            head: [['Earthing', '']],
            body: earthingData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: {
              0: { fontStyle: 'bold', cellWidth: 60 },
              1: { cellWidth: 120 }
            },
            margin: { left: 20, right: 20 }
          });

          yPos = (doc as any).lastAutoTable.finalY + 10;
        }

        // Isolator Details
        if (electrical.isolator) {
          if (yPos > pageHeight - 40) {
            doc.addPage();
            yPos = 20;
          }

          const isolatorData = [
            ['Type', electrical.isolator.type || 'N/A'],
            ['Rating', electrical.isolator.rating || 'N/A'],
            ['Status', electrical.isolator.status || 'N/A'],
          ];

          autoTable(doc, {
            startY: yPos,
            head: [['Isolator', '']],
            body: isolatorData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: {
              0: { fontStyle: 'bold', cellWidth: 60 },
              1: { cellWidth: 120 }
            },
            margin: { left: 20, right: 20 }
          });

          yPos = (doc as any).lastAutoTable.finalY + 15;
        }
      }

      // ===== OBSERVATIONS =====
      if (observations.length > 0) {
        doc.addPage();
        yPos = 20;

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

      // ===== RELAY STATUS =====
      if (Object.keys(relayStatus).length > 0) {
        if (yPos > pageHeight - 40) {
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

      // ===== IMAGES =====
      for (const category of imageCategories) {
        const images = firebaseData[`images${category}`] || {};
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
