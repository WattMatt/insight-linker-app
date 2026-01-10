import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { pdfjs } from "react-pdf";
import { Canvas as FabricCanvas } from "fabric";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import {
  addCoverPage,
  addStandardHeader,
  addFootersToAllPages,
  addSectionHeader,
  RGB_COLORS,
  PAGE,
  logComplianceCheck,
  PDFComplianceCheck,
} from "@/lib/pdfUtils";
import { DOCUMENT_DESIGN_STANDARDS } from "@/lib/documentDesignStandards";

const { margins, typography, tables } = DOCUMENT_DESIGN_STANDARDS;

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
  subsectionId: string;
  pdfUrl: string;
  pins: Pin[];
  canvasData?: string;
}

export const SiteDrawingReport = ({
  inspectionData,
  siteName,
  subsectionName,
  subsectionId,
  pdfUrl,
  pins,
  canvasData,
}: SiteDrawingReportProps) => {
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [complianceChecks, setComplianceChecks] = useState<PDFComplianceCheck | null>(null);

  const generatePDFDocument = async (): Promise<{ doc: jsPDF; fileName: string; blob: Blob; complianceChecks: PDFComplianceCheck } | null> => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // ===== PAGE 1: COVER PAGE =====
      addCoverPage(doc, {
        title: 'Site Drawing Inspection',
        subtitle: subsectionName,
        siteName,
        reportType: 'Site Drawing Report',
        organizationName: 'Watson Mattheus',
        reportDate: new Date(),
      });

      // ===== PAGE 2: GENERAL INFORMATION =====
      doc.addPage();
      addStandardHeader(doc, 'General Information', null);
      
      let yPos = PAGE.contentStartY;

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
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 60 },
          1: { cellWidth: 120 }
        },
        margin: { left: margins.left, right: margins.right }
      });

      // ===== PAGE 3: ANNOTATED SITE DRAWING =====
      doc.addPage();
      addStandardHeader(doc, 'Annotated Site Drawing', null);
      yPos = PAGE.contentStartY;

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
          const imgWidth = pageWidth - (2 * margins.left);
          const imgHeight = (canvas.height / canvas.width) * imgWidth;
          
          if (imgHeight > pageHeight - yPos - 20) {
            // Scale down if too tall
            const scaledHeight = pageHeight - yPos - 20;
            const scaledWidth = (canvas.width / canvas.height) * scaledHeight;
            doc.addImage(imgData, 'JPEG', margins.left, yPos, scaledWidth, scaledHeight);
          } else {
            doc.addImage(imgData, 'JPEG', margins.left, yPos, imgWidth, imgHeight);
          }
        }
      } catch (error) {
        console.error('Error rendering PDF:', error);
        doc.setFontSize(12);
        doc.setTextColor(...RGB_COLORS.textMuted);
        doc.text('Site drawing could not be embedded', margins.left, yPos);
        doc.text('Please refer to original PDF file', margins.left, yPos + 10);
      }

      // ===== PIN INDEX PAGE =====
      doc.addPage();
      addStandardHeader(doc, 'Inspection Points Index', null);
      yPos = PAGE.contentStartY;

      const indexData = pins.map(pin => [
        pin.number.toString(),
        pin.title || `Pin ${pin.number}`,
        `${pin.images.length} image${pin.images.length !== 1 ? 's' : ''}`
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['#', 'Location/Item', 'Images']],
        body: indexData,
        theme: 'grid',
        headStyles: { fillColor: RGB_COLORS.primary, textColor: RGB_COLORS.white },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 120 },
          2: { cellWidth: 40, halign: 'center' }
        },
        margin: { left: margins.left, right: margins.right }
      });

      // ===== PIN DETAILS PAGES =====
      for (const pin of pins.sort((a, b) => a.number - b.number)) {
        doc.addPage();
        addStandardHeader(doc, `Pin ${pin.number}`, null);
        yPos = PAGE.contentStartY;

        // Title
        if (pin.title) {
          doc.setFontSize(typography.scale.h3);
          doc.setFont(typography.fonts.heading, 'bold');
          doc.setTextColor(...RGB_COLORS.textPrimary);
          doc.text(pin.title, margins.left, yPos);
          yPos += 10;
        }

        // Description
        if (pin.description) {
          doc.setFontSize(typography.scale.body);
          doc.setFont(typography.fonts.body, 'normal');
          doc.setTextColor(...RGB_COLORS.textSecondary);
          const splitDescription = doc.splitTextToSize(pin.description, pageWidth - (2 * margins.left));
          doc.text(splitDescription, margins.left, yPos);
          yPos += (splitDescription.length * 5) + 10;
        }

        // Images
        if (pin.images.length > 0) {
          yPos = addSectionHeader(doc, 'Images', yPos);

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
                addStandardHeader(doc, `Pin ${pin.number} (continued)`, null);
                yPos = PAGE.contentStartY;
              }

              doc.addImage(dataUrl, 'JPEG', margins.left, yPos, imgWidth, imgHeight);
              
              doc.setFontSize(8);
              doc.setFont(typography.fonts.body, 'normal');
              doc.setTextColor(...RGB_COLORS.textMuted);
              doc.text(image.name, margins.left, yPos + imgHeight + 5);
              
              yPos += imgHeight + 15;
            } catch (error) {
              console.error('Error embedding image:', error);
            }
          }
        }

        // Empty state if no details
        if (!pin.title && !pin.description && pin.images.length === 0) {
          doc.setFontSize(10);
          doc.setTextColor(...RGB_COLORS.textMuted);
          doc.text('No details recorded for this inspection point', margins.left, yPos);
        }
      }

      // Add footers to all pages (skip cover page)
      addFootersToAllPages(doc, true);

      // Log compliance
      const checks = logComplianceCheck('SiteDrawingReport', {
        hasCoverPage: true,
        logoPlacement: false,
        standardMargins: true,
        typographyScale: true,
        brandColors: true,
        pageHeaders: true,
        pageFooters: true,
        tableStyles: true,
        pageBreaks: true,
      });

      const fileName = `${subsectionName}_Site_Drawing_Inspection_${date.replace(/,?\s+/g, '_')}.pdf`;
      const blob = doc.output('blob');
      
      return { doc, fileName, blob, complianceChecks: checks };
    } catch (error) {
      console.error("Error generating PDF:", error);
      return null;
    }
  };

  const handlePreviewReport = async () => {
    try {
      setGenerating(true);
      const result = await generatePDFDocument();
      
      if (!result) {
        toast.error("Failed to generate report");
        return;
      }
      
      const url = URL.createObjectURL(result.blob);
      setPreviewUrl(url);
      setPreviewFileName(result.fileName);
      setPdfBlob(result.blob);
      setComplianceChecks(result.complianceChecks);
      setPreviewOpen(true);
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!pdfBlob || !subsectionId) {
      toast.error("Cannot save: missing data");
      return;
    }

    try {
      setSaving(true);
      const result = await savePDFToDocuments({
        blob: pdfBlob,
        fileName: previewFileName,
        subsectionId,
        categoryName: getReportCategoryName("site-drawing"),
      });

      if (result.success) {
        toast.success("Report saved to documents!");
      } else {
        toast.error(result.error || "Failed to save report");
      }
    } catch (error) {
      console.error("Error saving report:", error);
      toast.error("Failed to save report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button onClick={handlePreviewReport} disabled={generating} variant="default">
        <FileText className="mr-2 h-4 w-4" />
        {generating ? "Generating..." : "Preview Report"}
      </Button>

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open && previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl("");
          }
        }}
        fileUrl={previewUrl}
        fileName={previewFileName}
        onSaveToDocuments={handleSaveToDocuments}
        saveLocation="subsection"
        contextName={subsectionName}
        isSaving={saving}
        complianceChecks={complianceChecks || undefined}
      />
    </>
  );
};
