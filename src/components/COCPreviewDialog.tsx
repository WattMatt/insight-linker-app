import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle, XCircle, ZoomIn, ZoomOut, RotateCw, Download, ExternalLink } from "lucide-react";

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
    }>;
    report_data?: any;
  } | null;
}

export function COCPreviewDialog({ open, onClose, document, validation }: COCPreviewDialogProps) {
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);

  if (!document) return null;

  const isPdf = document.file_name.toLowerCase().endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(document.file_name);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const handleOpenExternal = () => {
    window.open(document.file_url, '_blank');
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-[95vw] h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
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

        <div className="flex-1 flex overflow-hidden">
          {/* Document Preview Panel */}
          <div className="flex-1 flex flex-col border-r">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
              <div className="flex items-center gap-2">
                {isImage && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleZoomOut} title="Zoom out">
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                      {Math.round(scale * 100)}%
                    </span>
                    <Button size="sm" variant="outline" onClick={handleZoomIn} title="Zoom in">
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Separator orientation="vertical" className="h-6 mx-2" />
                    <Button size="sm" variant="outline" onClick={handleRotate} title="Rotate">
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleOpenExternal} title="Open in new tab">
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownload} title="Download">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Document View */}
            <div className="flex-1 bg-muted/30 overflow-hidden">
              {isPdf ? (
                <iframe
                  src={`${document.file_url}#toolbar=1&navpanes=0`}
                  className="w-full h-full border-0"
                  title={document.file_name}
                />
              ) : isImage ? (
                <ScrollArea className="h-full">
                  <div className="flex items-center justify-center min-h-full p-4">
                    <img
                      src={document.file_url}
                      alt={document.file_name}
                      style={{
                        transform: `scale(${scale}) rotate(${rotation}deg)`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        transition: 'transform 0.2s ease'
                      }}
                      className="rounded shadow-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder.svg';
                      }}
                    />
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex items-center justify-center h-full text-center text-muted-foreground p-8">
                  <div>
                    <p className="mb-4">Unable to preview this file type</p>
                    <Button onClick={handleOpenExternal}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in New Tab
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Validation Results Panel */}
          <div className="w-[400px] flex flex-col bg-background">
            <div className="px-4 py-3 bg-muted/50 border-b">
              <h3 className="font-semibold">SANS 10142-1 Verification</h3>
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
                      <XCircle className="h-5 w-5 text-destructive" />
                      <div>
                        <p className="font-medium text-destructive">Validation Failed</p>
                        <p className="text-sm text-muted-foreground">
                          {validation.violations?.length || 0} issue(s) found
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {validation.violations?.map((v, i) => (
                        <div 
                          key={i} 
                          className="border rounded-lg p-3 bg-card hover:bg-muted/50 transition-colors"
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
                          </div>
                          
                          <p className="font-medium text-sm text-foreground mb-1">
                            {v.description}
                          </p>
                          
                          {v.reason && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {v.reason}
                            </p>
                          )}
                          
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
                      ))}
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
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
