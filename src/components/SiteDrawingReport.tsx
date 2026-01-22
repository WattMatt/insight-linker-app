import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { useUnifiedPdfGeneration, SiteDrawingReportData } from "@/hooks/useUnifiedPdfGeneration";

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  
  const { generatePdfForPreview, isGenerating } = useUnifiedPdfGeneration();

  const handlePreviewReport = async () => {
    const generalInfo = inspectionData?.jsonData?.generalInfo || {};
    
    const reportData: SiteDrawingReportData = {
      reportType: 'site-drawing',
      title: 'Site Drawing Inspection',
      subtitle: subsectionName,
      siteName,
      subsectionId,
      subsectionName,
      generatedAt: new Date().toISOString(),
      pdfUrl,
      pins: pins.map(pin => ({
        id: pin.id,
        number: pin.number,
        x: pin.x,
        y: pin.y,
        title: pin.title,
        description: pin.description,
        images: pin.images,
      })),
      generalInfo: {
        projectName: generalInfo.projectName || inspectionData?.projectName || inspectionData?.project_name,
        inspectorName: generalInfo.inspectorName || inspectionData?.inspectorName || inspectionData?.inspector_name,
        date: generalInfo.date || inspectionData?.date || inspectionData?.inspection_date,
        location: generalInfo.location || inspectionData?.location,
        totalPins: pins.length,
      },
    };

    const result = await generatePdfForPreview(reportData);
    
    if (result.success && result.url) {
      setPreviewUrl(result.url);
      setPreviewFileName(result.filename || `${subsectionName}_Site_Drawing_Inspection.pdf`);
      setPreviewOpen(true);
    } else {
      toast.error(result.error || 'Failed to generate report');
    }
  };

  return (
    <>
      <Button onClick={handlePreviewReport} disabled={isGenerating} variant="default">
        <FileText className="mr-2 h-4 w-4" />
        {isGenerating ? "Generating..." : "Preview Report"}
      </Button>

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open && previewUrl) {
            setPreviewUrl("");
          }
        }}
        fileUrl={previewUrl}
        fileName={previewFileName}
        saveLocation="subsection"
        contextName={subsectionName}
      />
    </>
  );
};
