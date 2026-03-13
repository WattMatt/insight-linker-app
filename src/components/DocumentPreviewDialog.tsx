import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  FileText
} from 'lucide-react';
import { downloadFile } from '@/lib/fileDownload';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFComplianceCheck, getComplianceCheckLabel } from '@/lib/pdfEngine';
import { renderAsync } from 'docx-preview';
import { supabase } from '@/integrations/supabase/client';
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
  // Compliance checks
  complianceChecks?: PDFComplianceCheck;
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
  complianceChecks,
}: DocumentPreviewDialogProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCompliancePanel, setShowCompliancePanel] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [docxReady, setDocxReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName);
  const isDocx = fileName.toLowerCase().endsWith('.docx');

  // Calculate compliance stats
  const complianceStats = complianceChecks ? {
    passed: Object.values(complianceChecks).filter(Boolean).length,
    total: Object.keys(complianceChecks).length,
    percentage: Math.round((Object.values(complianceChecks).filter(Boolean).length / Object.keys(complianceChecks).length) * 100),
  } : null;

  // Load DOCX file and render with docx-preview for true WYSIWYG
  useEffect(() => {
    if (open && isDocx && fileUrl && docxContainerRef.current) {
      setDocxLoading(true);
      setDocxError(null);
      setDocxReady(false);
      
      // Clear previous content
      if (docxContainerRef.current) {
        docxContainerRef.current.innerHTML = '';
      }
      
      fetch(fileUrl)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch document');
          return res.arrayBuffer();
        })
        .then(buffer => {
          if (!docxContainerRef.current) return;
          
          return renderAsync(buffer, docxContainerRef.current, undefined, {
            className: 'docx-wrapper',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: false,
            experimental: true,
            trimXmlDeclaration: true,
            useBase64URL: true,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            renderEndnotes: true,
          });
        })
        .then(() => {
          setDocxReady(true);
          console.log('[DOCX Preview] Rendered successfully with docx-preview');
        })
        .catch(err => {
          console.error('[DOCX Preview] Error:', err);
          setDocxError('Failed to load document preview');
        })
        .finally(() => setDocxLoading(false));
    }
  }, [open, isDocx, fileUrl]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setCurrentPage(1);
      setShowCompliancePanel(false);
      if (!isDocx) {
        setDocxReady(false);
        setDocxError(null);
      }
    }
  }, [open, fileUrl, isDocx]);

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

  const getComplianceBadgeVariant = () => {
    if (!complianceStats) return 'secondary';
    if (complianceStats.percentage === 100) return 'default';
    if (complianceStats.percentage >= 70) return 'secondary';
    return 'destructive';
  };

  const renderCompliancePanel = () => {
    if (!complianceChecks || !showCompliancePanel) return null;

    return (
      <div className="absolute top-0 right-0 w-64 bg-background border-l shadow-lg z-10 h-full overflow-auto">
        <div className="p-4 border-b bg-muted/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Standards Compliance</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={() => setShowCompliancePanel(false)}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
          {complianceStats && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{complianceStats.passed}/{complianceStats.total} checks passed</span>
                <span className={`font-bold ${complianceStats.percentage === 100 ? 'text-green-600' : complianceStats.percentage >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {complianceStats.percentage}%
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${complianceStats.percentage === 100 ? 'bg-green-500' : complianceStats.percentage >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${complianceStats.percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="p-3 space-y-2">
          {(Object.keys(complianceChecks) as (keyof PDFComplianceCheck)[]).map((key) => {
            const passed = complianceChecks[key];
            return (
              <div 
                key={key} 
                className={`flex items-center gap-2 p-2 rounded text-xs ${passed ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300' : 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'}`}
              >
                {passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                )}
                <span>{getComplianceCheckLabel(key)}</span>
              </div>
            );
          })}
        </div>
        
        <div className="p-3 border-t text-xs text-muted-foreground">
          <p>Compliance with DOCUMENT_DESIGN_STANDARDS ensures consistent branding, typography, and layout.</p>
        </div>
      </div>
    );
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

    // DOCX WYSIWYG preview using docx-preview library
    if (isDocx) {
      return (
        <div className="flex flex-col h-full w-full">
          {/* Loading overlay */}
          {docxLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Rendering document...</p>
            </div>
          )}
          
          {/* Error state */}
          {docxError && !docxLoading && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4 opacity-50" />
              <p className="mb-4">{docxError}</p>
              <Button onClick={() => downloadFile(fileUrl, fileName)}>
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
          )}
          
          {/* WYSIWYG Document Preview Container */}
          <div 
            ref={docxContainerRef}
            className="docx-wysiwyg-container flex-1 overflow-auto bg-muted/30"
            style={{
              minHeight: '500px',
            }}
          />
          
          {/* Styles for docx-preview library */}
          <style>{`
            .docx-wysiwyg-container {
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 20px;
            }
            .docx-wysiwyg-container .docx-wrapper {
              background: white;
              box-shadow: 0 4px 20px rgba(0,0,0,0.15);
              margin: 0 auto;
            }
            .docx-wysiwyg-container .docx-wrapper > section.docx {
              padding: 72pt 90pt !important;
              min-height: 11in;
              box-sizing: border-box;
              margin-bottom: 20px;
              border: 1px solid hsl(var(--border));
              background: white;
            }
            .docx-wysiwyg-container table {
              border-collapse: collapse;
              width: 100%;
            }
            .docx-wysiwyg-container td, 
            .docx-wysiwyg-container th {
              border: 1px solid #000;
              padding: 4px 8px;
            }
            .docx-wysiwyg-container img {
              max-width: 100%;
              height: auto;
            }
            /* Page break styling */
            .docx-wysiwyg-container .docx-wrapper > section.docx + section.docx {
              margin-top: 20px;
              page-break-before: always;
            }
          `}</style>
        </div>
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
              {/* Compliance badge */}
              {complianceStats && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="gap-1.5 px-2 h-8"
                  onClick={() => setShowCompliancePanel(!showCompliancePanel)}
                >
                  <Badge 
                    variant={getComplianceBadgeVariant()}
                    className="text-xs py-0 px-1.5"
                  >
                    {complianceStats.passed}/{complianceStats.total}
                  </Badge>
                  <span className="text-xs text-muted-foreground hidden sm:inline">Standards</span>
                  {showCompliancePanel ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              )}
              
              <div className="w-px h-6 bg-border mx-1" />
              
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

        {/* Document viewer with optional compliance panel */}
        <div className="flex-1 overflow-hidden relative">
          <div 
            ref={containerRef}
            className={`h-full overflow-auto bg-muted/50 ${showCompliancePanel ? 'mr-64' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onAuxClick={handleAuxClick}
            onWheel={isPdf ? undefined : handleWheel}
            style={{ cursor: isDragging ? 'grabbing' : (scale > 1 && !isPdf ? 'grab' : 'default') }}
          >
            <div 
              className="flex items-center justify-center min-h-full p-4"
              style={isPdf ? undefined : {
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
              }}
            >
              {renderContent()}
            </div>
          </div>
          
          {/* Compliance panel */}
          {renderCompliancePanel()}
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