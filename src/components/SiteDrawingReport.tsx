import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { pdfjs } from "react-pdf";
import { Canvas as FabricCanvas } from "fabric";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import {
  generatePdfBlob,
  createCoverPage,
  createDataTable,
  createSectionHeader,
  COLORS,
  DEFAULT_STYLES,
} from "@/lib/pdfMakeUtils";

type Content = any;
type TDocumentDefinitions = any;

const PDF_COLORS = COLORS;

// Helper to load image as data URL
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

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

  const generatePDFDocument = async (): Promise<{ fileName: string; blob: Blob } | null> => {
    try {
      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      const content: Content[] = [];

      // Cover page
      const coverPage = createCoverPage({
        title: 'Site Drawing Inspection',
        subtitle: subsectionName,
        siteName,
        reportType: 'Site Drawing Report',
        organizationName: 'Watson Mattheus',
        reportDate: new Date(),
      });
      content.push(coverPage);

      // General Information page
      content.push({ text: '', pageBreak: 'after' } as Content);
      content.push(createSectionHeader('General Information', 'secondary'));

      const generalInfo = inspectionData?.jsonData?.generalInfo || {};
      const generalInfoTable = createDataTable(
        [{ field: 'field', header: 'Field' }, { field: 'value', header: 'Value' }],
        [
          { field: 'Project Name', value: generalInfo.projectName || inspectionData.projectName || inspectionData.project_name || 'N/A' },
          { field: 'Inspector Name', value: generalInfo.inspectorName || inspectionData.inspectorName || inspectionData.inspector_name || 'N/A' },
          { field: 'Inspection Date', value: generalInfo.date || inspectionData.date || inspectionData.inspection_date || 'N/A' },
          { field: 'Location', value: generalInfo.location || inspectionData.location || 'N/A' },
          { field: 'Total Pins', value: pins.length.toString() },
        ]
      );
      content.push(generalInfoTable);

      // Annotated Site Drawing page
      content.push({ text: '', pageBreak: 'before' } as Content);
      content.push(createSectionHeader('Annotated Site Drawing', 'secondary'));

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
          content.push({
            image: imgData,
            width: 500,
            alignment: 'center',
            margin: [0, 10, 0, 10]
          } as Content);
        }
      } catch (error) {
        console.error('Error rendering PDF:', error);
        content.push({
          text: 'Site drawing could not be embedded. Please refer to original PDF file.',
          color: PDF_COLORS.textMuted,
          italics: true,
          margin: [0, 20, 0, 0]
        } as Content);
      }

      // Pin Index page
      content.push({ text: '', pageBreak: 'before' } as Content);
      content.push(createSectionHeader('Inspection Points Index', 'secondary'));

      const indexData = pins.map(pin => [
        pin.number.toString(),
        pin.title || `Pin ${pin.number}`,
        `${pin.images.length} image${pin.images.length !== 1 ? 's' : ''}`
      ]);

      const indexTable = createDataTable(
        [{ field: 'number', header: '#' }, { field: 'location', header: 'Location/Item' }, { field: 'images', header: 'Images' }],
        indexData.map(row => ({ number: row[0], location: row[1], images: row[2] }))
      );
      content.push(indexTable);

      // Pin Details pages
      for (const pin of pins.sort((a, b) => a.number - b.number)) {
        content.push({ text: '', pageBreak: 'before' } as Content);
        content.push(createSectionHeader(`Pin ${pin.number}`, 'secondary'));

        const pinStack: Content[] = [];

        // Title
        if (pin.title) {
          pinStack.push({
            text: pin.title,
            style: 'subheading',
            margin: [0, 0, 0, 10]
          } as Content);
        }

        // Description
        if (pin.description) {
          pinStack.push({
            text: pin.description,
            fontSize: 10,
            color: PDF_COLORS.textSecondary,
            margin: [0, 0, 0, 10]
          } as Content);
        }

        // Images
        if (pin.images.length > 0) {
          pinStack.push({
            text: 'Images',
            bold: true,
            fontSize: 11,
            margin: [0, 10, 0, 5]
          } as Content);

          for (const image of pin.images) {
            try {
              const dataUrl = await loadImageAsDataUrl(image.url);
              if (dataUrl) {
                pinStack.push({
                  stack: [
                    { image: dataUrl, width: 200, height: 150, margin: [0, 5, 0, 5] },
                    { text: image.name, fontSize: 8, color: PDF_COLORS.textMuted }
                  ],
                  margin: [0, 0, 0, 10]
                } as Content);
              }
            } catch (error) {
              console.error('Error embedding image:', error);
            }
          }
        }

        // Empty state
        if (!pin.title && !pin.description && pin.images.length === 0) {
          pinStack.push({
            text: 'No details recorded for this inspection point',
            color: PDF_COLORS.textMuted,
            italics: true
          } as Content);
        }

        content.push({ stack: pinStack } as Content);
      }

      // Build document definition
      const docDefinition: TDocumentDefinitions = {
        content,
        styles: DEFAULT_STYLES,
        defaultStyle: {
          font: 'Roboto',
          fontSize: 10,
        },
        pageMargins: [40, 40, 40, 60],
        footer: (currentPage: number, pageCount: number) => {
          if (currentPage === 1) return null;
          return {
            columns: [
              { text: 'Confidential', fontSize: 8, color: PDF_COLORS.textMuted, margin: [40, 0, 0, 0] },
              { text: `Page ${currentPage - 1} of ${pageCount - 1}`, fontSize: 8, alignment: 'center', color: PDF_COLORS.textMuted },
              { text: date, fontSize: 8, alignment: 'right', color: PDF_COLORS.textMuted, margin: [0, 0, 40, 0] }
            ],
            margin: [0, 20, 0, 0]
          };
        }
      };

      const blob = await generatePdfBlob(docDefinition);
      const fileName = `${subsectionName}_Site_Drawing_Inspection_${date.replace(/,?\s+/g, '_')}.pdf`;
      
      return { fileName, blob };
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
      />
    </>
  );
};
