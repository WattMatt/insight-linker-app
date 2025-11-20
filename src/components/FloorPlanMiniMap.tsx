import { useRef, useEffect, useState } from "react";
import { Document, Page } from "react-pdf";
import { X } from "lucide-react";
import { Button } from "./ui/button";

interface Pin {
  id: string;
  pin_number: number;
  x_position: number;
  y_position: number;
  pin_type: 'snag' | 'observation';
  status: 'open' | 'in_progress' | 'finished' | 'closed' | 'resolved';
  priority?: string;
}

interface FloorPlanMiniMapProps {
  pdfUrl: string;
  pins: Pin[];
  scale: number;
  panOffset: { x: number; y: number };
  containerWidth: number;
  containerHeight: number;
  pageWidth: number;
  onNavigate: (x: number, y: number) => void;
  onClose: () => void;
}

export const FloorPlanMiniMap = ({
  pdfUrl,
  pins,
  scale,
  panOffset,
  containerWidth,
  containerHeight,
  pageWidth,
  onNavigate,
  onClose,
}: FloorPlanMiniMapProps) => {
  const miniMapRef = useRef<HTMLDivElement>(null);
  const [miniMapWidth] = useState(200);
  const [miniMapHeight, setMiniMapHeight] = useState(150);

  const getPinColor = (pin: Pin) => {
    if (pin.status === 'resolved' || pin.status === 'closed' || pin.status === 'finished') return '#9ca3af';
    if (pin.priority === 'critical') return '#dc2626';
    return pin.pin_type === 'snag' ? '#ef4444' : '#3b82f6';
  };

  // Calculate viewport rectangle dimensions and position
  const getViewportRect = () => {
    // The main viewer shows pageWidth at current scale with pan offset
    const scaledPageWidth = pageWidth * scale;
    const scaledPageHeight = pageWidth * 1.414; // Approximate A4 ratio
    
    // Calculate what portion of the page is visible
    const visibleWidthRatio = Math.min(containerWidth / scaledPageWidth, 1);
    const visibleHeightRatio = Math.min(containerHeight / scaledPageHeight, 1);
    
    // Calculate viewport position as percentage of total page
    const viewportX = (-panOffset.x / scaledPageWidth) * 100;
    const viewportY = (-panOffset.y / scaledPageHeight) * 100;
    
    // Calculate viewport size as percentage of total page
    const viewportWidth = visibleWidthRatio * 100;
    const viewportHeight = visibleHeightRatio * 100;
    
    return {
      x: Math.max(0, Math.min(viewportX, 100)),
      y: Math.max(0, Math.min(viewportY, 100)),
      width: Math.min(viewportWidth, 100),
      height: Math.min(viewportHeight, 100),
    };
  };

  const viewport = getViewportRect();

  const handleMiniMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = miniMapRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate click position as percentage
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;

    // Convert to pan offset to center the viewport on click point
    const scaledPageWidth = pageWidth * scale;
    const scaledPageHeight = pageWidth * 1.414;
    
    // Center the viewport on the clicked point
    const targetPanX = -(clickX / 100) * scaledPageWidth + (containerWidth / 2);
    const targetPanY = -(clickY / 100) * scaledPageHeight + (containerHeight / 2);
    
    onNavigate(targetPanX, targetPanY);
  };

  return (
    <div className="absolute bottom-4 right-4 z-20 animate-scale-in">
      <div className="bg-card border-2 border-border rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-muted/50 border-b">
          <span className="text-xs font-medium text-foreground">Overview</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Mini Map */}
        <div
          ref={miniMapRef}
          className="relative cursor-pointer bg-muted/20"
          style={{ width: miniMapWidth, height: miniMapHeight }}
          onClick={handleMiniMapClick}
        >
          {/* PDF Thumbnail */}
          <div className="w-full h-full">
            <Document file={pdfUrl}>
              <Page
                pageNumber={1}
                width={miniMapWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="opacity-90"
              />
            </Document>
          </div>

          {/* Pins */}
          {pins.map((pin) => {
            const pinSize = 6;
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
                  borderRadius: '50%',
                  backgroundColor: getPinColor(pin),
                  border: '1px solid white',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  zIndex: 1,
                }}
              />
            );
          })}

          {/* Viewport Indicator */}
          <div
            style={{
              position: 'absolute',
              left: `${viewport.x}%`,
              top: `${viewport.y}%`,
              width: `${viewport.width}%`,
              height: `${viewport.height}%`,
              border: '2px solid hsl(var(--primary))',
              backgroundColor: 'hsl(var(--primary) / 0.15)',
              boxShadow: '0 0 0 1px hsl(var(--background)), 0 0 8px hsl(var(--primary) / 0.4)',
              pointerEvents: 'none',
              zIndex: 2,
              transition: 'all 0.15s ease-out',
            }}
            className="animate-pulse"
          />

          {/* Overlay gradient for depth */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, transparent 0%, hsl(var(--background) / 0.05) 100%)',
            }}
          />
        </div>

        {/* Info */}
        <div className="px-2 py-1 bg-muted/30 border-t text-[10px] text-muted-foreground text-center">
          Click to navigate • {Math.round(scale * 100)}% zoom
        </div>
      </div>
    </div>
  );
};
