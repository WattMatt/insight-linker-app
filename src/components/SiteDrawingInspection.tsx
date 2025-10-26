import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Plus, Trash2, Eye, X, MapPin, Pencil, Square, Circle as CircleIcon, Type, Eraser, Palette, Download, MousePointer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCamera } from "@/hooks/useCamera";
import { Canvas as FabricCanvas, PencilBrush, Circle, Rect, Textbox, Path } from "fabric";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

type DrawingTool = "select" | "pin" | "draw" | "rectangle" | "circle" | "text" | "eraser";

interface SiteDrawingInspectionProps {
  inspectionId: string;
  initialPdfUrl?: string;
  initialPins?: Pin[];
  initialCanvasData?: string;
  onDataChange?: (pdfUrl: string, pins: Pin[], canvasData?: string) => void;
}

export const SiteDrawingInspection = ({
  inspectionId,
  initialPdfUrl,
  initialPins = [],
  initialCanvasData,
  onDataChange,
}: SiteDrawingInspectionProps) => {
  const [pdfUrl, setPdfUrl] = useState<string>(initialPdfUrl || "");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pins, setPins] = useState<Pin[]>(initialPins);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [scale, setScale] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [drawingColor, setDrawingColor] = useState("#ef4444");
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfCanvasRef = useRef<HTMLDivElement>(null);
  const { isNative, selectImages } = useCamera();

  useEffect(() => {
    const canvasData = fabricCanvas?.toJSON();
    onDataChange?.(pdfUrl, pins, JSON.stringify(canvasData));
  }, [pdfUrl, pins, fabricCanvas]);

  // Initialize Fabric canvas
  useEffect(() => {
    if (!canvasRef.current || !pdfUrl) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 800,
      height: 600,
      selection: activeTool === "select",
    });

    // Load initial canvas data if available
    if (initialCanvasData) {
      try {
        canvas.loadFromJSON(JSON.parse(initialCanvasData), () => {
          canvas.renderAll();
        });
      } catch (error) {
        console.error("Error loading canvas data:", error);
      }
    }

    setFabricCanvas(canvas);

    return () => {
      canvas.dispose();
    };
  }, [pdfUrl]);

  // Handle tool changes
  useEffect(() => {
    if (!fabricCanvas) return;

    fabricCanvas.isDrawingMode = activeTool === "draw";
    fabricCanvas.selection = activeTool === "select";

    if (activeTool === "draw") {
      const brush = new PencilBrush(fabricCanvas);
      brush.color = drawingColor;
      brush.width = 3;
      fabricCanvas.freeDrawingBrush = brush;
    } else if (activeTool === "eraser") {
      fabricCanvas.isDrawingMode = true;
      const brush = new PencilBrush(fabricCanvas);
      brush.color = "#ffffff";
      brush.width = 10;
      fabricCanvas.freeDrawingBrush = brush;
    } else if (activeTool === "rectangle") {
      const rect = new Rect({
        left: 100,
        top: 100,
        fill: "transparent",
        stroke: drawingColor,
        strokeWidth: 2,
        width: 100,
        height: 100,
      });
      fabricCanvas.add(rect);
      setActiveTool("select");
    } else if (activeTool === "circle") {
      const circle = new Circle({
        left: 100,
        top: 100,
        fill: "transparent",
        stroke: drawingColor,
        strokeWidth: 2,
        radius: 50,
      });
      fabricCanvas.add(circle);
      setActiveTool("select");
    } else if (activeTool === "text") {
      const text = new Textbox("Type here...", {
        left: 100,
        top: 100,
        fill: drawingColor,
        fontSize: 20,
        width: 200,
      });
      fabricCanvas.add(text);
      fabricCanvas.setActiveObject(text);
      setActiveTool("select");
    }
  }, [activeTool, drawingColor, fabricCanvas]);

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
    if (activeTool !== "pin" || !pageRef.current) return;

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
    setActiveTool("select");
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

  const handlePinCameraCapture = async (pinId: string) => {
    const input = document.getElementById(`pin-image-${pinId}`) as HTMLInputElement;
    
    if (!isNative) {
      if (input) {
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobileDevice) {
          input.removeAttribute('multiple');
          input.setAttribute('capture', 'environment');
        } else {
          input.setAttribute('multiple', '');
          input.removeAttribute('capture');
        }
      }
      
      input?.click();
      return;
    }

    try {
      const files = await selectImages();
      
      if (files.length === 0) {
        toast.info("No images selected");
        return;
      }

      for (const file of files) {
        await handlePinImageUpload(pinId, file);
      }
    } catch (error) {
      console.error("Error capturing pin images:", error);
      toast.error("Failed to capture images");
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
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={activeTool === "select" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTool("select")}
                  >
                    <MousePointer className="mr-2 h-4 w-4" />
                    Select
                  </Button>
                  <Button
                    variant={activeTool === "pin" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTool("pin")}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    {activeTool === "pin" ? "Click to Place Pin" : "Add Pin"}
                  </Button>
                  <Button
                    variant={activeTool === "draw" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTool("draw")}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Draw
                  </Button>
                  <Button
                    variant={activeTool === "rectangle" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTool("rectangle")}
                  >
                    <Square className="mr-2 h-4 w-4" />
                    Rectangle
                  </Button>
                  <Button
                    variant={activeTool === "circle" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTool("circle")}
                  >
                    <CircleIcon className="mr-2 h-4 w-4" />
                    Circle
                  </Button>
                  <Button
                    variant={activeTool === "text" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTool("text")}
                  >
                    <Type className="mr-2 h-4 w-4" />
                    Text
                  </Button>
                  <Button
                    variant={activeTool === "eraser" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTool("eraser")}
                  >
                    <Eraser className="mr-2 h-4 w-4" />
                    Eraser
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Palette className="mr-2 h-4 w-4" />
                        <div className="h-4 w-4 rounded border" style={{ backgroundColor: drawingColor }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3">
                      <div className="grid grid-cols-5 gap-2">
                        {["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#000000", "#ffffff"].map(color => (
                          <button
                            key={color}
                            className="h-8 w-8 rounded border-2 hover:scale-110 transition-transform"
                            style={{ backgroundColor: color, borderColor: color === drawingColor ? "#000" : "#ccc" }}
                            onClick={() => setDrawingColor(color)}
                          />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScale(s => Math.min(s + 0.2, 2))}
                  >
                    Zoom In
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScale(s => Math.max(s - 0.2, 0.5))}
                  >
                    Zoom Out
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      fabricCanvas?.clear();
                      toast.success("Canvas cleared");
                    }}
                  >
                    Clear Drawings
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
                style={{ cursor: activeTool === "pin" ? "crosshair" : "default" }}
              >
                <div ref={pdfCanvasRef} className="relative">
                  <Document
                    file={pdfUrl}
                    onLoadSuccess={({ numPages }) => {
                      setNumPages(numPages);
                      // Adjust canvas size to match PDF
                      if (canvasRef.current && pdfCanvasRef.current) {
                        setTimeout(() => {
                          const pdfCanvas = pdfCanvasRef.current?.querySelector('canvas');
                          if (pdfCanvas && fabricCanvas) {
                            fabricCanvas.setWidth(pdfCanvas.width);
                            fabricCanvas.setHeight(pdfCanvas.height);
                          }
                        }, 100);
                      }
                    }}
                  >
                    <Page
                      pageNumber={currentPage}
                      scale={scale}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  </Document>

                  {/* Fabric Canvas Overlay */}
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 pointer-events-auto"
                    style={{ 
                      pointerEvents: activeTool === "pin" ? "none" : "auto",
                      zIndex: 10
                    }}
                  />

                  {/* Render pins */}
                  {pins.map((pin) => (
                    <div
                      key={pin.id}
                      className="absolute transform -translate-x-1/2 -translate-y-full cursor-pointer group"
                      style={{
                        left: `${pin.x}%`,
                        top: `${pin.y}%`,
                        zIndex: 20
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
                  onClick={() => handlePinCameraCapture(selectedPin.id)}
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
