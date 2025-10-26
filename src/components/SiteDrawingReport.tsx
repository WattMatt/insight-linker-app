import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { pdfjs } from "react-pdf";
import { Canvas as FabricCanvas } from "fabric";

interface Pin {
  id: string;
  x: number;
  y: number;
  number: number;
  title: string;
  description: string;
  images: Array<{ url: string; name: string }>;
}

interface SiteDrawingReportProps {
  inspectionData: any;
  siteName: string;
  subsectionName: string;
  pdfUrl: string;
  pins: Pin[];
  canvasData?: string;
}

export const SiteDrawingReport = ({
  inspectionData,
  siteName,
  subsectionName,
  pdfUrl,
  pins,
  canvasData,
}: SiteDrawingReportProps) => {
  const [generating, setGenerating] = useState(false);

  const generateReport = async () => {
    try {
      setGenerating(true);
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // ===== COVER PAGE =====
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(32);
      doc.setFont(undefined, 'bold');
      doc.text('Site Drawing Inspection', pageWidth / 2, 80, { align: 'center' });
      
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
      
      doc.setFontSize(14);
      doc.text(`Total Inspection Points: ${pins.length}`, pageWidth / 2, 175, { align: 'center' });

      // ===== GENERAL INFORMATION =====
      doc.addPage();
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      doc.text('General Information', 20, 20);

      let yPos = 35;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');

      const generalInfo = inspectionData?.jsonData?.generalInfo || {};
      const generalInfoData = [
        ['Project Name', generalInfo.projectName || inspectionData.projectName || inspectionData.project_name || 'N/A'],
        ['Inspector Name', generalInfo.inspectorName || inspectionData.inspectorName || inspectionData.inspector_name || 'N/A'],
        ['Inspection Date', generalInfo.date || inspectionData.date || inspectionData.inspection_date || 'N/A'],
        ['Location', generalInfo.location || inspectionData.location || 'N/A'],
        ['Total Pins', pins.length.toString()],
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

      // ===== ANNOTATED SITE DRAWING =====
      doc.addPage();
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('Annotated Site Drawing', 20, 20);
      yPos = 30;

      // Load the PDF and render it with pins
      try {
        const loadingTask = pdfjs.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        
        // Create canvas to render PDF
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        if (context) {
          await page.render({
            canvasContext: context,
            viewport: viewport
          } as any).promise;

          // Draw pins on the canvas
          pins.forEach(pin => {
            const x = (pin.x / 100) * canvas.width;
            const y = (pin.y / 100) * canvas.height;
            
            // Draw pin marker
            context.beginPath();
            context.arc(x, y - 20, 15, 0, 2 * Math.PI);
            context.fillStyle = '#ef4444';
            context.fill();
            context.strokeStyle = '#fff';
            context.lineWidth = 2;
            context.stroke();

            // Draw pin number
            context.fillStyle = '#fff';
            context.font = 'bold 14px Arial';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(pin.number.toString(), x, y - 20);
          });

          // Draw canvas annotations if available
          if (canvasData) {
            try {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = canvas.width;
              tempCanvas.height = canvas.height;
              const fabricCanvasTemp = new FabricCanvas(tempCanvas);
              
              await new Promise((resolve) => {
                fabricCanvasTemp.loadFromJSON(JSON.parse(canvasData), () => {
                  // Scale canvas objects to match PDF size
                  const objects = fabricCanvasTemp.getObjects();
                  const scaleX = canvas.width / fabricCanvasTemp.width!;
                  const scaleY = canvas.height / fabricCanvasTemp.height!;
                  
                  objects.forEach(obj => {
                    obj.scaleX = (obj.scaleX || 1) * scaleX;
                    obj.scaleY = (obj.scaleY || 1) * scaleY;
                    obj.left = (obj.left || 0) * scaleX;
                    obj.top = (obj.top || 0) * scaleY;
                    obj.setCoords();
                  });
                  
                  fabricCanvasTemp.renderAll();
                  
                  // Draw fabric canvas onto the PDF canvas
                  context.drawImage(tempCanvas, 0, 0);
                  fabricCanvasTemp.dispose();
                  resolve(null);
                });
              });
            } catch (error) {
              console.error('Error rendering canvas annotations:', error);
            }
          }

          // Add annotated drawing to PDF
          const imgData = canvas.toDataURL('image/jpeg', 0.8);
          const imgWidth = pageWidth - 40;
          const imgHeight = (canvas.height / canvas.width) * imgWidth;
          
          if (imgHeight > pageHeight - 60) {
            // Scale down if too tall
            const scaledHeight = pageHeight - 60;
            const scaledWidth = (canvas.width / canvas.height) * scaledHeight;
            doc.addImage(imgData, 'JPEG', 20, yPos, scaledWidth, scaledHeight);
          } else {
            doc.addImage(imgData, 'JPEG', 20, yPos, imgWidth, imgHeight);
          }
        }
      } catch (error) {
        console.error('Error rendering PDF:', error);
        doc.setFontSize(12);
        doc.text('Site drawing could not be embedded', 20, yPos);
        doc.text('Please refer to original PDF file', 20, yPos + 10);
      }

      // ===== PIN INDEX =====
      doc.addPage();
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('Inspection Points Index', 20, 20);

      const indexData = pins.map(pin => [
        pin.number.toString(),
        pin.title || `Pin ${pin.number}`,
        `${pin.images.length} image${pin.images.length !== 1 ? 's' : ''}`
      ]);

      autoTable(doc, {
        startY: 30,
        head: [['#', 'Location/Item', 'Images']],
        body: indexData,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 120 },
          2: { cellWidth: 40, halign: 'center' }
        },
        margin: { left: 20, right: 20 }
      });

      // ===== PIN DETAILS PAGES =====
      for (const pin of pins.sort((a, b) => a.number - b.number)) {
        doc.addPage();
        yPos = 20;

        // Pin header
        doc.setFillColor(41, 128, 185);
        doc.rect(0, yPos - 5, pageWidth, 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text(`Pin ${pin.number}`, pageWidth / 2, yPos + 5, { align: 'center' });
        yPos += 25;

        doc.setTextColor(0, 0, 0);

        // Title
        if (pin.title) {
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.text(pin.title, 20, yPos);
          yPos += 10;
        }

        // Description
        if (pin.description) {
          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          const splitDescription = doc.splitTextToSize(pin.description, pageWidth - 40);
          doc.text(splitDescription, 20, yPos);
          yPos += (splitDescription.length * 5) + 10;
        }

        // Images
        if (pin.images.length > 0) {
          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          doc.text('Images:', 20, yPos);
          yPos += 10;

          for (const image of pin.images) {
            try {
              const response = await fetch(image.url);
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
              doc.text(image.name, 20, yPos + imgHeight + 5);
              
              yPos += imgHeight + 15;
            } catch (error) {
              console.error('Error embedding image:', error);
            }
          }
        }

        // Empty state if no details
        if (!pin.title && !pin.description && pin.images.length === 0) {
          doc.setFontSize(10);
          doc.setTextColor(128, 128, 128);
          doc.text('No details recorded for this inspection point', 20, yPos);
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

      doc.save(`${subsectionName}_Site_Drawing_Inspection_${date}.pdf`);
      toast.success("Site drawing report generated successfully");
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
      {generating ? "Generating PDF..." : "Generate PDF Report"}
    </Button>
  );
};
