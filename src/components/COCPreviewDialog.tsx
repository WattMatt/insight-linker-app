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

// Keywords to search for each clause type
const clauseKeywords: Record<string, string[]> = {
  '8.6': ['insulation resistance', 'insulation', 'ir test', 'megohm', 'mω', 'mohm', '0 mω', '0mω'],
  '8.5': ['earth loop', 'loop impedance', 'earth fault', 'ze', 'zs', 'earth continuity'],
  '8.4': ['earth continuity', 'protective conductor', 'bonding'],
  '8.7': ['rcd', 'residual current', 'trip time', 'earth leakage', '30ma', '30 ma'],
  '6.1': ['installation', 'premises', 'address', 'description'],
  '6.2': ['circuit', 'schedule', 'distribution', 'db'],
  '7.1': ['inspection', 'visual', 'check'],
  '5.1': ['certificate', 'coc number', 'registration'],
  '5.2': ['installer', 'registered', 'accredited'],
};

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

  if (!document) return null;

  const isPdf = document.file_name.toLowerCase().endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(document.file_name);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = () => {
    setLoading(false);
  };

  const handleDownload = async () => {
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
      window.open(document.file_url, '_blank');
    }
  };

  // Get clause location and page info
  const getClauseLocation = (clause: string): { location: string; page: number } => {
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
  };

  // Handle clause click - navigate to relevant page
  const handleClauseClick = (clause: string) => {
    const newHighlight = highlightedClause === clause ? null : clause;
    setHighlightedClause(newHighlight);
    
    if (newHighlight) {
      const { page } = getClauseLocation(clause);
      if (page <= numPages) {
        setPageNumber(page);
      }
    }
  };

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
                        const clauseInfo = getClauseLocation(v.clause);
                        return (
                          <div 
                            key={i} 
                            className={`border rounded-lg p-3 bg-card cursor-pointer transition-all ${
                              highlightedClause === v.clause 
                                ? 'ring-2 ring-primary border-primary bg-primary/5' 
                                : 'hover:bg-muted/50 hover:border-muted-foreground/30'
                            }`}
                            onClick={() => handleClauseClick(v.clause)}
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
                                title="Highlight on document"
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

                            {/* Document Location Reference */}
                            <div className={`text-xs p-2 rounded mt-2 border ${
                              highlightedClause === v.clause 
                                ? 'bg-primary/10 text-primary border-primary/20' 
                                : 'bg-muted/50 text-muted-foreground border-transparent'
                            }`}>
                              <strong>📍 Location:</strong> {clauseInfo.location} (Page {clauseInfo.page})
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
