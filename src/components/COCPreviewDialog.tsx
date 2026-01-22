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

// Extract page number from section string (e.g., "Section 4 (Page 2)" -> 2)
function extractPageFromSection(section?: string): number | null {
  if (!section) return null;
  const pageMatch = section.match(/\(?page\s*(\d+)\)?/i);
  return pageMatch ? parseInt(pageMatch[1], 10) : null;
}

// Normalize clause ID to match our lookup (e.g., "Clause 8.6" -> "8.6", "8.6.1" -> "8.6")
function normalizeClauseId(clause: string): string {
  const match = clause.match(/(\d+\.\d+)/);
  return match ? match[1] : clause;
}

// Default page mapping for common SANS 10142-1 clause categories
const defaultClausePages: Record<string, number> = {
  // Test results typically on page 2
  '8.4': 2, '8.5': 2, '8.6': 2, '8.7': 2, '8.8': 2,
  // Installation details on page 1
  '6.1': 1, '6.2': 1, '6.3': 1,
  // Annexure references
  'annexure': 1,
};

export function COCPreviewDialog({ open, onClose, document, validation }: COCPreviewDialogProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [highlightedClause, setHighlightedClause] = useState<string | null>(null);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [, setLoading] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });
  const [showPageIndicator, setShowPageIndicator] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
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

  // Handle clause click - navigate to relevant page and show indicator
  const handleClauseClick = useCallback((clause: string, section?: string) => {
    console.log('[COC Navigation] Clicked clause:', clause, 'section:', section);
    
    const normalizedClause = normalizeClauseId(clause);
    
    // Set highlight states
    setHighlightedClause(clause);
    setHighlightedSection(section || null);
    setShowPageIndicator(true);
    
    // Determine target page - priority: section string > default mapping > fallback to 1
    let targetPage = 1;
    
    // First try to extract page from section string (most accurate - comes from AI)
    const sectionPage = extractPageFromSection(section);
    if (sectionPage && sectionPage <= numPages && numPages > 0) {
      targetPage = sectionPage;
      console.log('[COC Navigation] Using page from section:', targetPage);
    } else if (defaultClausePages[normalizedClause] && numPages > 0) {
      // Use default mapping for common clauses
      targetPage = Math.min(defaultClausePages[normalizedClause], numPages);
      console.log('[COC Navigation] Using default page for clause:', targetPage);
    } else if (section?.toLowerCase().includes('annexure')) {
      // Annexure typically on page 1
      targetPage = 1;
    }
    
    console.log('[COC Navigation] Target page:', targetPage, 'of', numPages);
    
    // Navigate to the target page
    setPageNumber(targetPage);
    
    // Scroll to top of page after navigation using scrollRef
    setTimeout(() => {
      // Try multiple selectors for scroll container
      const scrollViewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') 
        || containerRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      
      if (scrollViewport) {
        scrollViewport.scrollTo({ top: 0, behavior: 'smooth' });
        console.log('[COC Navigation] Scrolled to top via viewport');
      } else {
        // Fallback: try direct scroll on scrollRef
        if (scrollRef.current) {
          scrollRef.current.scrollTop = 0;
          console.log('[COC Navigation] Scrolled to top via scrollRef');
        }
      }
    }, 200);
    
    // Auto-hide page indicator after 5 seconds
    setTimeout(() => {
      setShowPageIndicator(false);
    }, 5000);
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

  // Simple text renderer - no keyword highlighting (unreliable)
  const customTextRenderer = useCallback(
    (textItem: { str: string }) => textItem.str,
    []
  );

  // Early return after all hooks
  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-[95vw] h-[90vh] p-0 flex flex-col">
        {/* Minimal styles for PDF text layer */}
        <style>{`
          .react-pdf__Page__textContent {
            pointer-events: none;
          }
          .react-pdf__Page__textContent span {
            color: transparent !important;
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
              <div ref={scrollRef} className="h-full">
                <ScrollArea className="h-full bg-muted/30">
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
                      {/* Page indicator banner - shows when navigating to a clause */}
                      {showPageIndicator && highlightedClause && (
                        <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
                          <div className="mx-2 mt-2 bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg animate-pulse flex items-center gap-3">
                            <AlertTriangle className="h-5 w-5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm">
                                Clause {highlightedClause} Issue
                              </p>
                              {highlightedSection && (
                                <p className="text-xs opacity-90 truncate">
                                  📍 {highlightedSection}
                                </p>
                              )}
                            </div>
                            <Badge variant="outline" className="bg-destructive-foreground/10 border-destructive-foreground/30 text-destructive-foreground shrink-0">
                              Page {pageNumber}
                            </Badge>
                          </div>
                        </div>
                      )}
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
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 text-primary" />
                    <h4 className="font-semibold text-lg text-primary">COC Validated</h4>
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
                              <div className="text-sm bg-accent/50 dark:bg-accent/30 text-accent-foreground p-2 rounded mt-2">
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
