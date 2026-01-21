import { useState, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle, XCircle, ZoomIn, ZoomOut, Download, ChevronLeft, ChevronRight, Loader2, Target } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface COCPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  document: {
    id: string;
    file_name: string;
    file_url: string;
    uploaded_at: string;
  } | null;
  validation: {
    status: string;
    violations: Array<{
      clause: string;
      description: string;
      reason?: string;
      riskLevel?: string;
      immediateAction?: string;
      evidence?: string;
      section?: string;
    }>;
    report_data?: any;
  } | null;
}

// Keywords to search for each clause type - matching actual COC form labels
const clauseKeywords: Record<string, string[]> = {
  // Clause 8.6 - Insulation Resistance (Row 9 in Section 4)
  '8.6': ['insulation resistance', '9. insulation resistance', '9.insulation', 'mω', 'mohm', 'megohm'],
  // Clause 8.5 - Earth Loop Impedance (Rows 5, 6, 7 in Section 4) 
  '8.5': ['earth loop impedance', 'loop impedance test', '5. earth loop', '6. earth loop', '7. prospective', 'pscc', 'zs of'],
  // Clause 8.4 - Earth Continuity (Row 4 in Section 4)
  '8.4': ['continuity of earth', 'earth continuity', '4. continuity', 'protective conductor'],
  // Clause 8.7 - RCD Testing (Rows 12, 13 in Section 4)
  '8.7': ['earth leakage', 'operation of earth leakage', '12. operation', '13. polarity'],
  // Other clauses
  '6.1': ['description of installation', 'section 3', 'premises'],
  '6.2': ['number of circuits', 'circuits or points', 'lighting', 'socket'],
  '7.1': ['section 1', 'installation data', 'type of supply'],
  '5.1': ['certificate number', 'coc number', 'eca m'],
  '5.2': ['registered person', 'registration certificate', 'accredited'],
};

// Visual highlight box positions for each clause on the PDF page (percentage-based for responsiveness)
// Format: { top: %, left: %, width: %, height: % } relative to page dimensions
const clauseHighlightBoxes: Record<string, { page: number; top: number; left: number; width: number; height: number }> = {
  '8.6': { page: 2, top: 55, left: 5, width: 90, height: 8 }, // Insulation Resistance section
  '8.5': { page: 2, top: 35, left: 5, width: 90, height: 15 }, // Earth Loop Impedance section
  '8.4': { page: 2, top: 25, left: 5, width: 90, height: 8 }, // Earth Continuity section
  '8.7': { page: 2, top: 70, left: 5, width: 90, height: 12 }, // RCD Testing section
  '6.1': { page: 1, top: 25, left: 5, width: 90, height: 15 }, // Installation Details
  '6.2': { page: 1, top: 45, left: 5, width: 90, height: 10 }, // Circuit Schedule
  '7.1': { page: 1, top: 10, left: 5, width: 90, height: 12 }, // Inspection Checks
  '5.1': { page: 1, top: 5, left: 5, width: 45, height: 5 }, // Certificate Details
  '5.2': { page: 1, top: 85, left: 5, width: 90, height: 10 }, // Installer Registration
};

// Extract page number from section string (e.g., "Section 4 (Page 2)" -> 2)
function extractPageFromSection(section?: string): number | null {
  if (!section) return null;
  const pageMatch = section.match(/\(?page\s*(\d+)\)?/i);
  return pageMatch ? parseInt(pageMatch[1], 10) : null;
}

// Normalize clause ID to match our lookup (e.g., "Clause 8.6" -> "8.6", "8.6.1" -> "8.6")
function normalizeClauseId(clause: string): string {
  // Extract just the numeric part like "8.6" from various formats
  const match = clause.match(/(\d+\.\d+)/);
  return match ? match[1] : clause;
}

export function COCPreviewDialog({ open, onClose, document, validation }: COCPreviewDialogProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [highlightedClause, setHighlightedClause] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track the current highlight info for the overlay
  const [currentHighlightInfo, setCurrentHighlightInfo] = useState<{
    page: number;
    top: number;
    left: number;
    width: number;
    height: number;
    clause: string;
  } | null>(null);
  
  const isPdf = document?.file_name?.toLowerCase().endsWith('.pdf') ?? false;
  const isImage = document?.file_name ? /\.(jpg|jpeg|png|gif|webp)$/i.test(document.file_name) : false;

  const handleZoomIn = useCallback(() => setScale(prev => Math.min(prev + 0.2, 3)), []);
  const handleZoomOut = useCallback(() => setScale(prev => Math.max(prev - 0.2, 0.5)), []);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  const onDocumentLoadError = useCallback(() => {
    setLoading(false);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!document) return;
    try {
      const response = await fetch(document.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.file_name;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
    } catch {
      if (document) window.open(document.file_url, '_blank');
    }
  }, [document]);

  // Get clause location and page info - can accept override from violation data
  const getClauseLocation = useCallback((clause: string, section?: string): { location: string; page: number } => {
    // If section contains page info like "(Page 1)", extract it
    if (section) {
      const pageMatch = section.match(/\(Page\s*(\d+)\)/i);
      const extractedPage = pageMatch ? parseInt(pageMatch[1], 10) : 1;
      // Remove page reference from location display
      const cleanLocation = section.replace(/\s*\(Page\s*\d+\)/i, '').trim();
      return { location: cleanLocation || `SANS 10142-1 Clause ${clause}`, page: extractedPage };
    }
    
    const clauseLocations: Record<string, { location: string; page: number }> = {
      '8.6': { location: 'Test Results - Insulation Resistance', page: 2 },
      '8.5': { location: 'Test Results - Earth Loop Impedance', page: 2 },
      '8.4': { location: 'Test Results - Earth Continuity', page: 2 },
      '8.7': { location: 'Test Results - RCD Testing', page: 2 },
      '6.1': { location: 'Installation Details', page: 1 },
      '6.2': { location: 'Circuit Schedule', page: 1 },
      '7.1': { location: 'Inspection Checks', page: 1 },
      '5.1': { location: 'Certificate Details', page: 1 },
      '5.2': { location: 'Installer Registration', page: 1 },
    };
    return clauseLocations[clause] || { location: `SANS 10142-1 Clause ${clause}`, page: 1 };
  }, []);

  // Handle clause click - navigate to relevant page and show visual highlight
  const handleClauseClick = useCallback((clause: string, section?: string) => {
    console.log('[COC Navigation] Clicked clause:', clause, 'section:', section);
    
    // Normalize the clause ID for lookup
    const normalizedClause = normalizeClauseId(clause);
    console.log('[COC Navigation] Normalized clause:', normalizedClause);
    
    // Always set the highlight
    setHighlightedClause(clause);
    
    // Determine target page - priority: section string > predefined box > fallback to 1
    let targetPage = 1;
    let highlightBox: { page: number; top: number; left: number; width: number; height: number } | null = null;
    
    // First try to extract page from section string (most accurate - comes from AI)
    const sectionPage = extractPageFromSection(section);
    if (sectionPage) {
      targetPage = sectionPage;
      console.log('[COC Navigation] Using page from section:', targetPage);
    }
    
    // Check if we have a predefined highlight box
    if (clauseHighlightBoxes[normalizedClause]) {
      highlightBox = clauseHighlightBoxes[normalizedClause];
      // If section didn't specify page, use box's page
      if (!sectionPage) {
        targetPage = highlightBox.page;
      }
      console.log('[COC Navigation] Found predefined box for clause:', normalizedClause);
    } else {
      // Create a default highlight box for unknown clauses (full-width banner at top)
      highlightBox = { page: targetPage, top: 10, left: 5, width: 90, height: 15 };
      console.log('[COC Navigation] Using default highlight box');
    }
    
    // Update the current highlight info with correct page
    highlightBox = { ...highlightBox, page: targetPage };
    setCurrentHighlightInfo({ ...highlightBox, clause });
    
    console.log('[COC Navigation] Target page:', targetPage, 'numPages:', numPages);
    
    // Navigate to the target page
    if (targetPage <= numPages && targetPage > 0) {
      setPageNumber(targetPage);
      console.log('[COC Navigation] Set page number to:', targetPage);
      
      // Scroll to show the highlighted area after page renders
      setTimeout(() => {
        if (containerRef.current) {
          const scrollContainer = containerRef.current.querySelector('[data-radix-scroll-area-viewport]');
          const pageElement = containerRef.current.querySelector('.react-pdf__Page');
          
          if (scrollContainer && pageElement && highlightBox) {
            const pageHeight = pageElement.clientHeight;
            const containerHeight = scrollContainer.clientHeight;
            const targetScrollTop = (pageHeight * highlightBox.top / 100) - (containerHeight / 4);
            scrollContainer.scrollTop = Math.max(0, targetScrollTop);
            console.log('[COC Navigation] Scrolled to:', targetScrollTop);
          }
        }
      }, 200);
    } else if (numPages === 0) {
      // PDF not loaded yet, just set the page number and it will navigate when loaded
      setPageNumber(targetPage);
      console.log('[COC Navigation] PDF not loaded yet, queued page:', targetPage);
    }
  }, [numPages]);

  // Handle mouse wheel zoom (Ctrl+scroll or pinch to zoom, normal scroll to pan)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Only zoom when Ctrl/Cmd is held (for pinch-to-zoom on trackpads and Ctrl+scroll on mouse)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.min(Math.max(prev + delta, 0.5), 3));
    }
    // Otherwise let normal scroll behavior happen for panning
  }, []);

  // Handle pan start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && containerRef.current) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      const scrollContainer = containerRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        setScrollStart({ x: scrollContainer.scrollLeft, y: scrollContainer.scrollTop });
      }
    }
  }, []);

  // Handle pan move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !containerRef.current) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    const scrollContainer = containerRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollContainer) {
      scrollContainer.scrollLeft = scrollStart.x - dx;
      scrollContainer.scrollTop = scrollStart.y - dy;
    }
  }, [isPanning, panStart, scrollStart]);

  // Handle pan end
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Custom text renderer to highlight matching text
  const customTextRenderer = useCallback(
    (textItem: { str: string }) => {
      if (!highlightedClause) return textItem.str;

      const keywords = clauseKeywords[highlightedClause] || [];
      const text = textItem.str.toLowerCase();
      
      // Check if any keyword matches
      const hasMatch = keywords.some(keyword => text.includes(keyword.toLowerCase()));
      
      if (hasMatch) {
        return `<mark class="coc-highlight">${textItem.str}</mark>`;
      }
      
      return textItem.str;
    },
    [highlightedClause]
  );

  // Early return after all hooks
  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-[95vw] h-[90vh] p-0 flex flex-col">
        {/* Custom styles for highlighting */}
        <style>{`
          .coc-highlight {
            background-color: #ffff00 !important;
            border: 3px solid #ff0000 !important;
            border-radius: 4px;
            padding: 4px 2px;
            margin: -2px;
            box-shadow: 0 0 20px 8px rgba(255, 0, 0, 0.6), 0 0 40px 15px rgba(255, 255, 0, 0.4) !important;
            animation: pulse-highlight 0.8s ease-in-out infinite;
            position: relative;
            z-index: 1000;
          }
          @keyframes pulse-highlight {
            0%, 100% { 
              background-color: #ffff00;
              box-shadow: 0 0 20px 8px rgba(255, 0, 0, 0.6), 0 0 40px 15px rgba(255, 255, 0, 0.4);
            }
            50% { 
              background-color: #ff6b6b;
              box-shadow: 0 0 30px 12px rgba(255, 0, 0, 0.8), 0 0 60px 25px rgba(255, 255, 0, 0.6);
            }
          }
          .coc-highlight-box .animate-pulse-highlight {
            animation: box-pulse 1.2s ease-in-out infinite;
          }
          @keyframes box-pulse {
            0%, 100% { 
              border-color: #ef4444;
              background-color: rgba(239, 68, 68, 0.15);
              box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7), inset 0 0 20px rgba(239, 68, 68, 0.3);
            }
            50% { 
              border-color: #dc2626;
              background-color: rgba(239, 68, 68, 0.3);
              box-shadow: 0 0 30px 10px rgba(239, 68, 68, 0.5), inset 0 0 30px rgba(239, 68, 68, 0.4);
            }
          }
          .react-pdf__Page__textContent {
            pointer-events: none;
          }
          .react-pdf__Page__textContent span {
            color: transparent !important;
          }
          .react-pdf__Page__textContent .coc-highlight {
            color: #000 !important;
            font-weight: bold !important;
          }
        `}</style>

        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold">{document.file_name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Uploaded: {new Date(document.uploaded_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {validation && (
                <Badge 
                  variant={validation.status === 'Pass' ? 'default' : validation.status === 'Fail' ? 'destructive' : 'secondary'}
                  className="text-sm px-3 py-1"
                >
                  {validation.status === 'Pass' && <CheckCircle className="h-4 w-4 mr-1" />}
                  {validation.status === 'Fail' && <XCircle className="h-4 w-4 mr-1" />}
                  {validation.status}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Document Preview Panel */}
          <div className="flex-1 flex flex-col border-r min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b shrink-0">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleZoomOut} title="Zoom out">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                  {Math.round(scale * 100)}%
                </span>
                <Button size="sm" variant="outline" onClick={handleZoomIn} title="Zoom in">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                
                {isPdf && numPages > 1 && (
                  <>
                    <Separator orientation="vertical" className="h-6 mx-2" />
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                      disabled={pageNumber <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground min-w-[80px] text-center">
                      Page {pageNumber} / {numPages}
                    </span>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                      disabled={pageNumber >= numPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {highlightedClause && (
                  <Badge variant="secondary" className="gap-1">
                    <Target className="h-3 w-3" />
                    Highlighting Clause {highlightedClause}
                  </Badge>
                )}
                <Button size="sm" variant="outline" onClick={handleDownload} title="Download">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            </div>

            {/* Document View */}
            <div 
              ref={containerRef}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              className="flex-1 overflow-hidden"
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            >
              <ScrollArea className="h-full bg-muted/30" ref={scrollRef}>
                <div className="flex items-start justify-center p-4 min-h-full select-none">
                {isPdf ? (
                  <Document
                    file={document.file_url}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading={
                      <div className="flex flex-col items-center justify-center h-64 gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Loading PDF...</p>
                      </div>
                    }
                    error={
                      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center p-4">
                        <AlertTriangle className="h-12 w-12 text-destructive" />
                        <p className="text-sm text-muted-foreground">Failed to load PDF</p>
                        <Button variant="outline" onClick={handleDownload}>
                          <Download className="h-4 w-4 mr-2" />
                          Download Instead
                        </Button>
                      </div>
                    }
                    className="flex justify-center"
                  >
                    <div className="relative">
                      <Page
                        key={`page-${pageNumber}-${highlightedClause}`}
                        pageNumber={pageNumber}
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        customTextRenderer={customTextRenderer}
                        className="shadow-lg rounded overflow-hidden"
                        loading={
                          <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        }
                      />
                      {/* Visual highlight overlay box - uses currentHighlightInfo for dynamic positioning */}
                      {currentHighlightInfo && currentHighlightInfo.page === pageNumber && (
                        <div 
                          className="absolute pointer-events-none coc-highlight-box"
                          style={{
                            top: `${currentHighlightInfo.top}%`,
                            left: `${currentHighlightInfo.left}%`,
                            width: `${currentHighlightInfo.width}%`,
                            height: `${currentHighlightInfo.height}%`,
                          }}
                        >
                          <div className="w-full h-full border-4 border-destructive bg-destructive/20 rounded-lg animate-pulse-highlight" />
                          <div className="absolute -top-8 left-0 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap">
                            ⚠️ Clause {currentHighlightInfo.clause} - Issue Area
                          </div>
                        </div>
                      )}
                    </div>
                  </Document>
                ) : isImage ? (
                  <img
                    src={document.file_url}
                    alt={document.file_name}
                    style={{
                      transform: `scale(${scale})`,
                      transformOrigin: 'top center',
                      maxWidth: '100%',
                      objectFit: 'contain',
                      transition: 'transform 0.2s ease'
                    }}
                    className="rounded shadow-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder.svg';
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mb-4 opacity-50" />
                    <p className="mb-4">Unable to preview this file type</p>
                    <Button onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Download File
                    </Button>
                  </div>
                )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Validation Results Panel */}
          <div className="w-[420px] flex flex-col bg-background shrink-0">
            <div className="px-4 py-3 bg-muted/50 border-b shrink-0">
              <h3 className="font-semibold">SANS 10142-1 Verification</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Click a clause to highlight it on the document
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {!validation ? (
                  <div className="text-center text-muted-foreground py-8">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No validation results yet</p>
                    <p className="text-sm mt-1">Click "Verify COC" to validate this document</p>
                  </div>
                ) : validation.status === 'Pass' ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-600" />
                    <h4 className="font-semibold text-lg text-green-700">COC Validated</h4>
                    <p className="text-sm text-muted-foreground mt-2">
                      This certificate meets SANS 10142-1 requirements
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                      <XCircle className="h-5 w-5 text-destructive shrink-0" />
                      <div>
                        <p className="font-medium text-destructive">Validation Failed</p>
                        <p className="text-sm text-muted-foreground">
                          {validation.violations?.length || 0} issue(s) found
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {validation.violations?.map((v, i) => {
                        const clauseInfo = getClauseLocation(v.clause, v.section);
                        return (
                          <div 
                            key={i} 
                            className={`border rounded-lg p-3 bg-card cursor-pointer transition-all ${
                              highlightedClause === v.clause 
                                ? 'ring-2 ring-primary border-primary bg-primary/5' 
                                : 'hover:bg-muted/50 hover:border-muted-foreground/30'
                            }`}
                            onClick={() => handleClauseClick(v.clause, v.section)}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs font-mono">
                                  Clause {v.clause}
                                </Badge>
                                {v.riskLevel && (
                                  <Badge 
                                    variant={v.riskLevel === 'High' ? 'destructive' : v.riskLevel === 'Medium' ? 'secondary' : 'outline'} 
                                    className="text-xs"
                                  >
                                    {v.riskLevel}
                                  </Badge>
                                )}
                              </div>
                              <Button 
                                size="sm" 
                                variant={highlightedClause === v.clause ? 'default' : 'ghost'}
                                className="h-6 w-6 p-0 shrink-0"
                                title="Go to location in document"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClauseClick(v.clause, v.section);
                                }}
                              >
                                <Target className="h-3 w-3" />
                              </Button>
                            </div>
                            
                            <p className="font-medium text-sm text-foreground mb-1">
                              {v.description}
                            </p>
                            
                            {v.reason && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {v.reason}
                              </p>
                            )}

                            {/* Document Location Reference - Clickable */}
                            <div 
                              className={`text-xs p-2 rounded mt-2 border flex items-center gap-2 group/loc ${
                                highlightedClause === v.clause 
                                  ? 'bg-primary/10 text-primary border-primary/20' 
                                  : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-muted-foreground/20'
                              }`}
                              title="Click to navigate to this location"
                            >
                              <Target className={`h-3 w-3 shrink-0 ${highlightedClause === v.clause ? 'text-primary' : 'text-muted-foreground group-hover/loc:text-foreground'}`} />
                              <span><strong>📍 Location:</strong> {clauseInfo.location} (Page {clauseInfo.page})</span>
                            </div>
                            
                            {v.immediateAction && (
                              <div className="text-sm bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 p-2 rounded mt-2">
                                <strong>Action:</strong> {v.immediateAction}
                              </div>
                            )}
                            
                            {v.evidence && (
                              <p className="text-xs italic text-muted-foreground mt-2 border-t pt-2">
                                Evidence: {v.evidence}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Extracted Data Summary if available */}
                {validation?.report_data?.extractedFields && (
                  <>
                    <Separator className="my-4" />
                    <div>
                      <h4 className="font-medium text-sm mb-3">Extracted Data</h4>
                      <div className="space-y-2 text-sm">
                        {validation.report_data.extractedFields.cocNumber && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">COC Number:</span>
                            <span className="font-mono">{validation.report_data.extractedFields.cocNumber}</span>
                          </div>
                        )}
                        {validation.report_data.extractedFields.issueDate && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Issue Date:</span>
                            <span>{validation.report_data.extractedFields.issueDate}</span>
                          </div>
                        )}
                        {validation.report_data.extractedFields.installerName && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Installer:</span>
                            <span>{validation.report_data.extractedFields.installerName}</span>
                          </div>
                        )}
                        {validation.report_data.extractedFields.registrationNumber && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Registration:</span>
                            <span className="font-mono">{validation.report_data.extractedFields.registrationNumber}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Legend */}
                <Separator className="my-4" />
                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Highlighting Guide
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Click any clause above to highlight the relevant test results or sections on the COC document. 
                    The document will automatically navigate to the correct page.
                  </p>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
