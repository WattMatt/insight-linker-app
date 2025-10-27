import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "./ui/button";
import { ZoomIn, ZoomOut, Maximize2, Move, MapPin } from "lucide-react";
import { toast } from "sonner";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface Pin {
  id: string;
  pin_number: number;
  x_position: number;
  y_position: number;
  pin_type: 'snag' | 'observation';
  status: 'open' | 'resolved';
  priority?: string;
}

interface FloorPlanViewerProps {
  pdfUrl: string;
  pins: Pin[];
  onAddPin: (x: number, y: number) => void;
  onPinClick: (pin: Pin) => void;
  addMode: 'snag' | 'observation' | null;
  onAddModeChange: (mode: 'snag' | 'observation' | null) => void;
}

export const FloorPlanViewer = ({
  pdfUrl,
  pins,
  onAddPin,
  onPinClick,
  addMode,
  onAddModeChange,
}: FloorPlanViewerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [pdfPage, setPdfPage] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPdf();
  }, [pdfUrl]);

  useEffect(() => {
    if (pdfPage) {
      renderPage();
    }
  }, [pdfPage, scale, panOffset, pins]);

  const loadPdf = async () => {
    if (!canvasRef.current) return;

    try {
      setIsLoading(true);
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      setPdfPage(page);
      setIsLoading(false);
      toast.success("Floor plan loaded successfully");
    } catch (error) {
      console.error("Error loading PDF:", error);
      toast.error("Failed to load floor plan");
      setIsLoading(false);
    }
  };

  const renderPage = () => {
    if (!pdfPage || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    const viewport = pdfPage.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    pdfPage.render(renderContext).promise.then(() => {
      // Draw pins on top of the PDF
      pins.forEach((pin) => {
        drawPin(context, pin);
      });
    });
  };

  const drawPin = (context: CanvasRenderingContext2D, pin: Pin) => {
    const x = pin.x_position * scale + panOffset.x;
    const y = pin.y_position * scale + panOffset.y;

    // Pin color based on type and status
    let color = pin.pin_type === 'snag' ? '#ef4444' : '#3b82f6';
    if (pin.status === 'resolved') color = '#9ca3af';
    if (pin.priority === 'critical') color = '#dc2626';

    // Draw pin circle
    context.beginPath();
    context.arc(x, y, 20, 0, 2 * Math.PI);
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = '#fff';
    context.lineWidth = 3;
    context.stroke();

    // Draw pin number
    context.fillStyle = '#fff';
    context.font = 'bold 14px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(pin.pin_number.toString(), x, y);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - panOffset.x) / scale;
    const y = (e.clientY - rect.top - panOffset.y) / scale;

    // Check if clicking on existing pin
    const clickedPin = pins.find((pin) => {
      const pinX = pin.x_position * scale + panOffset.x;
      const pinY = pin.y_position * scale + panOffset.y;
      const distance = Math.sqrt(
        Math.pow(e.clientX - rect.left - pinX, 2) +
        Math.pow(e.clientY - rect.top - pinY, 2)
      );
      return distance < 20;
    });

    if (clickedPin) {
      onPinClick(clickedPin);
      return;
    }

    // Add new pin if in add mode
    if (addMode) {
      onAddPin(x, y);
      onAddModeChange(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (addMode) return; // Don't pan in add mode
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPanning || addMode) return;
    setPanOffset({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  };

  const handleResetView = () => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden bg-muted/10">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b bg-card">
        <Button
          variant={addMode === 'snag' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onAddModeChange(addMode === 'snag' ? null : 'snag')}
        >
          <MapPin className="w-4 h-4 mr-2" />
          Add Snag
        </Button>
        <Button
          variant={addMode === 'observation' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onAddModeChange(addMode === 'observation' ? null : 'observation')}
        >
          <MapPin className="w-4 h-4 mr-2" />
          Add Observation
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="icon" onClick={handleZoomOut}>
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={handleZoomIn}>
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={handleResetView}>
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        style={{ cursor: addMode ? 'crosshair' : isPanning ? 'grabbing' : 'grab' }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">Loading floor plan...</div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="max-w-none"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            }}
          />
        )}
      </div>

      {addMode && (
        <div className="p-3 bg-primary/10 border-t text-center text-sm">
          Click anywhere on the floor plan to add a {addMode}
        </div>
      )}
    </div>
  );
};