import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Plus, Trash2, Eye, X, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Pin {
  id: string;
  x: number; // percentage position
  y: number; // percentage position
  number: number;
  title: string;
  description: string;
  images: Array<{ url: string; name: string }>;
}

interface SiteDrawingInspectionProps {
  inspectionId: string;
  initialPdfUrl?: string;
  initialPins?: Pin[];
  onDataChange?: (pdfUrl: string, pins: Pin[]) => void;
}

export const SiteDrawingInspection = ({
  inspectionId,
  initialPdfUrl,
  initialPins = [],
  onDataChange,
}: SiteDrawingInspectionProps) => {
  const [pdfUrl, setPdfUrl] = useState<string>(initialPdfUrl || "");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pins, setPins] = useState<Pin[]>(initialPins);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [isPinMode, setIsPinMode] = useState(false);
  const [scale, setScale] = useState(1);
  const [uploading, setUploading] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onDataChange?.(pdfUrl, pins);
  }, [pdfUrl, pins]);

  const handlePdfUpload = async (file: File) => {
    if (!file.type.includes("pdf")) {
      toast.error("Please upload a PDF file");
      return;
    }

    setUploading(true);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${inspectionId}/site-drawings/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(filePath);

      setPdfUrl(publicUrl);
      setPdfFile(file);
      toast.success("PDF uploaded successfully");
    } catch (error) {
      console.error("Error uploading PDF:", error);
      toast.error("Failed to upload PDF");
    } finally {
      setUploading(false);
    }
  };

  const handlePageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isPinMode || !pageRef.current) return;

    const rect = pageRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    const newPin: Pin = {
      id: `pin_${Date.now()}`,
      x,
      y,
      number: pins.length + 1,
      title: "",
      description: "",
      images: [],
    };

    setPins([...pins, newPin]);
    setSelectedPin(newPin);
    setIsPinMode(false);
  };

  const updatePin = (pinId: string, updates: Partial<Pin>) => {
    setPins(pins.map(p => p.id === pinId ? { ...p, ...updates } : p));
    if (selectedPin?.id === pinId) {
      setSelectedPin({ ...selectedPin, ...updates });
    }
  };

  const deletePin = (pinId: string) => {
    setPins(pins.filter(p => p.id !== pinId));
    if (selectedPin?.id === pinId) {
      setSelectedPin(null);
    }
    // Renumber remaining pins
    const updatedPins = pins.filter(p => p.id !== pinId).map((p, idx) => ({ ...p, number: idx + 1 }));
    setPins(updatedPins);
  };

  const handlePinImageUpload = async (pinId: string, file: File) => {
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${inspectionId}/pin-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("inspection-photos")
        .getPublicUrl(filePath);

      const pin = pins.find(p => p.id === pinId);
      if (pin) {
        updatePin(pinId, {
          images: [...pin.images, { url: publicUrl, name: file.name }]
        });
      }
      toast.success("Image uploaded");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
    }
  };

  const removePinImage = (pinId: string, imageUrl: string) => {
    const pin = pins.find(p => p.id === pinId);
    if (pin) {
      updatePin(pinId, {
        images: pin.images.filter(img => img.url !== imageUrl)
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Site Drawing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!pdfUrl ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Upload a PDF site drawing to begin adding inspection pins
              </p>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePdfUpload(file);
                }}
                className="hidden"
                id="pdf-upload"
              />
              <Button
                onClick={() => document.getElementById("pdf-upload")?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Upload PDF Drawing"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Button
                    variant={isPinMode ? "default" : "outline"}
                    onClick={() => setIsPinMode(!isPinMode)}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    {isPinMode ? "Click to Place Pin" : "Add Pin"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setScale(s => Math.min(s + 0.2, 2))}
                  >
                    Zoom In
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setScale(s => Math.max(s - 0.2, 0.5))}
                  >
                    Zoom Out
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  {pins.length} pin{pins.length !== 1 ? "s" : ""} placed
                </div>
              </div>

              <div
                ref={pageRef}
                className="relative border rounded-lg overflow-auto max-h-[600px] bg-muted/30"
                onClick={handlePageClick}
                style={{ cursor: isPinMode ? "crosshair" : "default" }}
              >
                <Document
                  file={pdfUrl}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                >
                  <Page
                    pageNumber={currentPage}
                    scale={scale}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>

                {/* Render pins */}
                {pins.map((pin) => (
                  <div
                    key={pin.id}
                    className="absolute transform -translate-x-1/2 -translate-y-full cursor-pointer group"
                    style={{
                      left: `${pin.x}%`,
                      top: `${pin.y}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPin(pin);
                    }}
                  >
                    <div className="relative">
                      <MapPin className="h-8 w-8 text-destructive fill-destructive drop-shadow-lg group-hover:scale-110 transition-transform" />
                      <div className="absolute top-1 left-1/2 transform -translate-x-1/2 text-white text-xs font-bold">
                        {pin.number}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {numPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {currentPage} of {numPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                    disabled={currentPage === numPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pin Details List */}
      {pins.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pin Details ({pins.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pins.map((pin) => (
              <div
                key={pin.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                onClick={() => setSelectedPin(pin)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-destructive text-white font-bold text-sm">
                    {pin.number}
                  </div>
                  <div>
                    <p className="font-medium">
                      {pin.title || `Pin ${pin.number}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pin.images.length} image{pin.images.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPin(pin);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePin(pin.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pin Details Dialog */}
      <Dialog open={!!selectedPin} onOpenChange={() => setSelectedPin(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pin {selectedPin?.number} Details</DialogTitle>
          </DialogHeader>
          {selectedPin && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={selectedPin.title}
                  onChange={(e) => updatePin(selectedPin.id, { title: e.target.value })}
                  placeholder="e.g., Main Electrical Panel"
                />
              </div>

              <div className="space-y-2">
                <Label>Description / Notes</Label>
                <Textarea
                  value={selectedPin.description}
                  onChange={(e) => updatePin(selectedPin.id, { description: e.target.value })}
                  placeholder="Add detailed notes about this location..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Images</Label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach(file => handlePinImageUpload(selectedPin.id, file));
                  }}
                  className="hidden"
                  id={`pin-image-${selectedPin.id}`}
                />
                <Button
                  variant="outline"
                  onClick={() => document.getElementById(`pin-image-${selectedPin.id}`)?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Images
                </Button>

                {selectedPin.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {selectedPin.images.map((image, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={image.url}
                          alt={image.name}
                          className="w-full h-24 object-cover rounded"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removePinImage(selectedPin.id, image.url)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
