import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { generateSiteDrawingPdf, type SiteDrawingData } from "@/lib/siteDrawingReportGenerator";
import { savePDFToDocuments } from "@/lib/pdfDocumentSaver";

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
  const [previewBlob, setPreviewBlob] = useState<Blob | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const handlePreviewReport = async () => {
    const generalInfo = inspectionData?.jsonData?.generalInfo || {};

    const reportData: SiteDrawingData = {
      title: 'Site Drawing Inspection',
      subtitle: subsectionName,
      siteName,
      subsectionId,
      subsectionName,
      generatedAt: new Date().toISOString(),
      pdfUrl,
      // NOTE: `canvasData` is the Fabric toJSON() state (for restoring the canvas),
      // not a raster image, so it is not embedded. Rendering the drawing requires
      // compositing the react-pdf page with the Fabric overlay via toDataURL — a
      // follow-up. The generator only embeds drawingImageBase64 when it is a real
      // data:image URL.
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

    setIsGenerating(true);
    try {
      const result = await generateSiteDrawingPdf(reportData);

      if (result.success && result.blob) {
        const url = URL.createObjectURL(result.blob);
        setPreviewUrl(url);
        setPreviewFileName(result.filename || `${subsectionName}_Site_Drawing_Inspection.pdf`);
        setPreviewBlob(result.blob);
        setPreviewOpen(true);
      } else {
        toast.error(result.error || 'Failed to generate report');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!previewBlob || !subsectionId) {
      toast.error('Cannot save report');
      return;
    }
    try {
      setSaving(true);
      const res = await savePDFToDocuments({
        blob: previewBlob,
        fileName: previewFileName,
        subsectionId,
        categoryName: 'Site Drawing Reports',
      });
      if (res.success) {
        toast.success('Report saved to documents!');
      } else {
        toast.error(res.error || 'Failed to save report');
      }
    } finally {
      setSaving(false);
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
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl("");
            setPreviewBlob(undefined);
          }
        }}
        fileUrl={previewUrl}
        fileName={previewFileName}
        downloadBlobData={previewBlob}
        onSaveToDocuments={handleSaveToDocuments}
        saveLocation="subsection"
        contextName={subsectionName}
        isSaving={saving}
      />
    </>
  );
};
