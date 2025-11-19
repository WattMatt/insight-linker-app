import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "./ui/button";
import { ZoomIn, ZoomOut, Maximize2, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
}: FloorPlanViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [pageWidth, setPageWidth] = useState(800);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; distance?: number } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth - 48; // Account for padding
        setPageWidth(Math.max(width, 600));
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Handle mouse wheel zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Browser's native zoom, don't interfere
        return;
      }
      
      e.preventDefault();
      
      const delta = -e.deltaY;
      const zoomSpeed = 0.001;
      const zoomChange = delta * zoomSpeed;
      
      setScale((prev) => {
        const newScale = prev + zoomChange;
        return Math.max(0.5, Math.min(3, newScale));
      });
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, []);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    toast.success("Floor plan loaded successfully");
  };

  const onDocumentLoadError = (error: Error) => {
    console.error("Error loading PDF:", error);
    toast.error("Failed to load floor plan. Please try again.");
  };

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning || isShiftPressed) return;
    
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate click position relative to the PDF page
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Check if clicking on existing pin
    const clickedPin = pins.find((pin) => {
      const pinX = pin.x_position;
      const pinY = pin.y_position;
      const distance = Math.sqrt(
        Math.pow(x - pinX, 2) + Math.pow(y - pinY, 2)
      );
      return distance < 3; // 3% radius for click detection
    });

    if (clickedPin) {
      onPinClick(clickedPin);
      return;
    }

    // Add new pin
    onAddPin(x, y);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isShiftPressed || e.button === 2) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
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

  // Touch gesture handlers for pinch-to-zoom and touch pan
  const getTouchDistance = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      // Two-finger pinch
      e.preventDefault();
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      setTouchStart({ 
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        distance 
      });
      setIsPanning(false);
    } else if (e.touches.length === 1) {
      // Single touch for panning
      setTouchStart({ 
        x: e.touches[0].clientX, 
        y: e.touches[0].clientY 
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStart) return;

    if (e.touches.length === 2 && touchStart.distance) {
      // Pinch zoom
      e.preventDefault();
      const newDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const scaleChange = newDistance / touchStart.distance;
      
      setScale((prev) => {
        const newScale = prev * scaleChange;
        return Math.max(0.5, Math.min(3, newScale));
      });

      setTouchStart({
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        distance: newDistance
      });
    } else if (e.touches.length === 1 && !touchStart.distance) {
      // Single touch pan (enabled when zoomed in or shift mode active)
      if (scale > 1 || isShiftPressed) {
        const deltaX = e.touches[0].clientX - touchStart.x;
        const deltaY = e.touches[0].clientY - touchStart.y;
        
        // Only pan if movement is significant (prevents accidental pans during taps)
        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
          setPanOffset(prev => ({
            x: prev.x + deltaX,
            y: prev.y + deltaY
          }));

          setTouchStart({ 
            x: e.touches[0].clientX, 
            y: e.touches[0].clientY 
          });
        }
      }
    }
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
    setIsPanning(false);
  };

  const getPinColor = (pin: Pin) => {
    if (pin.status === 'resolved') return '#9ca3af';
    if (pin.priority === 'critical') return '#dc2626';
    return pin.pin_type === 'snag' ? '#ef4444' : '#3b82f6';
  };

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden bg-muted/10">
      {/* Toolbar */}
      <div className="flex items-center gap-1 sm:gap-2 p-2 sm:p-3 border-b bg-card">
        <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
          <MapPin className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">Click to add pin</span>
          <span className="text-[10px] sm:text-xs">• Pinch to zoom • Hold Shift to pan</span>
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="icon" onClick={handleZoomOut} className="h-8 w-8 sm:h-9 sm:w-9">
          <ZoomOut className="w-3 h-3 sm:w-4 sm:h-4" />
        </Button>
        <span className="text-xs sm:text-sm text-muted-foreground min-w-8 sm:min-w-12 text-center">
          {Math.round(scale * 100)}%
        </span>
        <Button variant="outline" size="icon" onClick={handleZoomIn} className="h-8 w-8 sm:h-9 sm:w-9">
          <ZoomIn className="w-3 h-3 sm:w-4 sm:h-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={handleResetView} title="Reset view" className="h-8 w-8 sm:h-9 sm:w-9">
          <Maximize2 className="w-3 h-3 sm:w-4 sm:h-4" />
        </Button>
      </div>

      {/* PDF Viewer */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative bg-card"
        style={{ cursor: isPanning ? 'grabbing' : isShiftPressed ? 'grab' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          ref={pageRef}
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
            transformOrigin: 'top left',
            width: 'fit-content',
            margin: '24px',
            position: 'relative',
          }}
          onClick={handlePageClick}
        >
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading floor plan...</span>
                </div>
              </div>
            }
            error={
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <p className="text-destructive font-semibold mb-2">Failed to load PDF</p>
                  <p className="text-sm text-muted-foreground">Please check the file and try again</p>
                </div>
              </div>
            }
          >
            <Page
              pageNumber={1}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>

          {/* Render pins on top of PDF */}
          {pins.map((pin) => {
            // Calculate inverse scale so pins get smaller when zoomed in
            const pinSize = 40 / scale;
            const fontSize = 14 / scale;
            const borderWidth = 3 / scale;
            
            return (
              <div
                key={pin.id}
                style={{
                  position: 'absolute',
                  left: `${pin.x_position}%`,
                  top: `${pin.y_position}%`,
                  transform: 'translate(-50%, -50%)',
                  width: `${pinSize}px`,
                  height: `${pinSize}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPinClick(pin);
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    backgroundColor: getPinColor(pin),
                    border: `${borderWidth}px solid white`,
                    boxShadow: `0 ${2 / scale}px ${8 / scale}px rgba(0,0,0,0.3)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: `${fontSize}px`,
                  }}
                >
                  {pin.pin_number}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};