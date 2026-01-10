import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Maximize2,
  Minimize2,
  Save,
  Loader2
} from 'lucide-react';
import { downloadFile } from '@/lib/fileDownload';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  fileName: string;
  // New props for save functionality
  onSaveToDocuments?: () => Promise<void>;
  saveLocation?: 'site' | 'subsection';
  contextName?: string; // Site or subsection name for display
  isSaving?: boolean;
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  fileUrl,
  fileName,
  onSaveToDocuments,
  saveLocation,
  contextName,
  isSaving = false,
}: DocumentPreviewDialogProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setCurrentPage(1);
    }
  }, [open, fileUrl]);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle mouse button (wheel click) or left click when zoomed
    if (e.button === 1 || (e.button === 0 && scale > 1)) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [scale, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = () => setIsDragging(false);
  
  // Prevent default middle-click behavior (auto-scroll)
  const handleAuxClick = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    // Always zoom with mouse wheel (no modifier needed)
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const newScale = Math.max(0.25, Math.min(4, scale + delta));
    
    if (newScale !== scale) {
      // Get cursor position relative to container
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left - rect.width / 2;
        const cursorY = e.clientY - rect.top - rect.height / 2;
        
        // Adjust position to zoom toward cursor
        const scaleDiff = newScale / scale;
        setPosition(prev => ({
          x: cursorX - (cursorX - prev.x) * scaleDiff,
          y: cursorY - (cursorY - prev.y) * scaleDiff
        }));
      }
      setScale(newScale);
    }
  }, [scale]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  const handlePrevPage = () => setCurrentPage(prev => Math.max(1, prev - 1));
  const handleNextPage = () => setCurrentPage(prev => Math.min(numPages, prev + 1));

  const toggleFullscreen = () => setIsFullscreen(prev => !prev);

  const getSaveButtonLabel = () => {
    if (isSaving) return "Saving...";
    if (saveLocation === 'site') return "Save to Site Documents";
    if (saveLocation === 'subsection') return "Save to Subsection Documents";
    return "Save to Documents";
  };

  const renderContent = () => {
    if (isPdf) {
      return (
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <p>Failed to load PDF</p>
              <Button variant="outline" className="mt-2" onClick={() => window.open(fileUrl, '_blank')}>
                Open in new tab
              </Button>
            </div>
          }
        >
          <Page
            pageNumber={currentPage}
            scale={scale}
            rotate={rotation}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      );
    }

    if (isImage) {
      return (
        <img
          src={fileUrl}
          alt={fileName}
          className="max-w-none"
          style={{
            transform: `rotate(${rotation}deg)`,
            maxHeight: isFullscreen ? '90vh' : '70vh'
          }}
          draggable={false}
        />
      );
    }

    // Unsupported file type
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p className="mb-4">Preview not available for this file type</p>
        <Button onClick={() => downloadFile(fileUrl, fileName)}>
          <Download className="h-4 w-4 mr-2" />
          Download File
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={`${isFullscreen ? 'max-w-[95vw] h-[95vh]' : 'max-w-4xl max-h-[90vh]'} flex flex-col p-0 gap-0`}
      >
        {/* Header */}
        <DialogHeader className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <DialogTitle className="text-sm font-medium truncate max-w-[40%]">
                {fileName}
              </DialogTitle>
              {contextName && saveLocation && (
                <span className="text-xs text-muted-foreground mt-0.5">
                  {saveLocation === 'site' ? 'Site' : 'Subsection'}: {contextName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom Out">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground min-w-[50px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom In">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleRotate} title="Rotate">
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleFullscreen} title="Fullscreen">
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button variant="ghost" size="icon" onClick={() => downloadFile(fileUrl, fileName)} title="Download">
                <Download className="h-4 w-4" />
              </Button>
              {onSaveToDocuments && (
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={onSaveToDocuments} 
                  disabled={isSaving}
                  className="ml-1"
                  title={getSaveButtonLabel()}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Document viewer */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-hidden bg-muted/50 relative"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onAuxClick={handleAuxClick}
          onWheel={handleWheel}
          style={{ cursor: isDragging ? 'grabbing' : (scale > 1 ? 'grab' : 'default') }}
        >
          <div 
            className="flex items-center justify-center min-h-full p-4"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${isPdf ? 1 : scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out'
            }}
          >
            {renderContent()}
          </div>
        </div>

        {/* PDF pagination */}
        {isPdf && numPages > 1 && (
          <div className="flex items-center justify-center gap-4 p-3 border-t bg-background">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handlePrevPage} 
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {numPages}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleNextPage} 
              disabled={currentPage >= numPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
