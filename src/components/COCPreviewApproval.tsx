import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, AlertTriangle, FileText, Edit2, Save, X, RefreshCw, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface ExtractedData {
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  administrativeDetails?: {
    physicalAddress?: string;
    erfNumber?: string;
    registeredPerson?: string;
    idNumber?: string;
    registrationNumber?: string;
    registrationType?: string;
    registrationDate?: string;
  };
  installationSummary?: string;
  testResults?: {
    earthElectrode?: {
      resistance?: string;
      method?: string;
      result?: string;
    };
    insulationResistance?: {
      phase1ToEarth?: string;
      phase2ToEarth?: string;
      phase3ToEarth?: string;
      result?: string;
    };
    polarity?: {
      verified?: boolean;
      result?: string;
    };
    circuitBreakers?: {
      ratings?: string;
      tested?: boolean;
      result?: string;
    };
    rcdTests?: {
      ratedCurrent?: string;
      tripTime?: string;
      result?: string;
    };
  };
  scopeOfWork?: string;
  declarationAndSignature?: {
    certifiedBy?: string;
    date?: string;
    signature?: string;
  };
  confidence?: 'high' | 'medium' | 'low';
}

interface COCPreviewApprovalProps {
  extractedData: ExtractedData | null;
  documentName: string;
  documentUrl: string;
  onApprove: (data: ExtractedData) => void;
  onReject: () => void;
  isProcessing?: boolean;
  onExtract?: () => void;
}

export function COCPreviewApproval({ 
  extractedData, 
  documentName,
  documentUrl,
  onApprove, 
  onReject,
  isProcessing = false,
  onExtract
}: COCPreviewApprovalProps) {
  const [isEditing, setIsEditing] = useState(!extractedData);
  const [editedData, setEditedData] = useState<ExtractedData>(extractedData || {
    cocNumber: '',
    cocIssueDate: '',
    cocType: '',
    administrativeDetails: {},
    installationSummary: '',
    testResults: {
      earthElectrode: {},
      insulationResistance: {},
      polarity: {},
      circuitBreakers: {},
      rcdTests: {}
    },
    scopeOfWork: '',
    declarationAndSignature: {},
    confidence: 'low'
  });

  // PDF viewer state
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleSaveEdits = () => {
    setIsEditing(false);
  };

  const handleApprove = () => {
    onApprove(editedData);
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
  const handlePrevPage = () => setPageNumber(prev => Math.max(prev - 1, 1));
  const handleNextPage = () => setPageNumber(prev => Math.min(prev + 1, numPages));

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.5, Math.min(3.0, prev + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const getConfidenceBadge = (confidence?: string) => {
    switch (confidence) {
      case 'high':
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />High Confidence</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" />Medium Confidence</Badge>;
      case 'low':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Low Confidence</Badge>;
      default:
        return null;
    }
  };

  const hasExtractedData = extractedData !== null;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>{hasExtractedData ? 'Review Extracted COC Information' : 'COC Document Preview'}</CardTitle>
            </div>
            <CardDescription>
              {hasExtractedData ? (
                <>Please review the information extracted from <strong>{documentName}</strong> before starting verification</>
              ) : (
                <>Preview of <strong>{documentName}</strong>. Fill in the fields manually or use AI extraction.</>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {!hasExtractedData && onExtract && (
              <Button onClick={onExtract} variant="outline" size="sm" disabled={isProcessing}>
                <FileText className="h-4 w-4 mr-2" />
                Extract with AI
              </Button>
            )}
            {extractedData?.confidence && getConfidenceBadge(extractedData.confidence)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Side - Document Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Document Preview</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                  {Math.round(scale * 100)}%
                </span>
                <Button variant="outline" size="sm" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div 
              className="border rounded-lg overflow-auto bg-muted h-[600px] flex flex-col"
              onWheel={handleWheel}
            >
              <div 
                className="flex-1 overflow-hidden p-4 flex items-center justify-center relative"
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
              >
                <div 
                  style={{ 
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                  }}
                >
                  <Document
                    file={documentUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                      <div className="flex items-center justify-center h-full">
                        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    }
                  >
                    <Page
                      pageNumber={pageNumber}
                      scale={scale}
                      loading={
                        <div className="flex items-center justify-center">
                          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      }
                    />
                  </Document>
                </div>
              </div>
              {numPages > 1 && (
                <div className="border-t bg-background p-2 flex items-center justify-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handlePrevPage}
                    disabled={pageNumber === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground min-w-[100px] text-center">
                    Page {pageNumber} of {numPages}
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleNextPage}
                    disabled={pageNumber === numPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Right Side - Extracted Fields */}
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
            {!hasExtractedData && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No data has been extracted yet. You can manually fill in the fields below or click "Extract with AI" to automatically extract information from the document.
                </AlertDescription>
              </Alert>
            )}
            
            {hasExtractedData && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Review the extracted information carefully. You can edit any incorrect values before proceeding with verification.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Certificate Information</h3>
            {!isEditing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="gap-2"
              >
                <Edit2 className="h-4 w-4" />
                Edit Information
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditedData(extractedData || {
                      cocNumber: '',
                      cocIssueDate: '',
                      cocType: '',
                      administrativeDetails: {},
                      installationSummary: '',
                      confidence: 'low'
                    });
                    setIsEditing(false);
                  }}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveEdits}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* Core Certificate Fields */}
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cocNumber">COC Number</Label>
              {isEditing ? (
                <Input
                  id="cocNumber"
                  value={editedData.cocNumber || ''}
                  onChange={(e) => setEditedData({ ...editedData, cocNumber: e.target.value })}
                  placeholder="Enter COC number"
                />
              ) : (
                <div className="p-2 bg-muted rounded-md font-mono">
                  {editedData.cocNumber || <span className="text-muted-foreground">Not extracted</span>}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cocType">COC Type</Label>
              {isEditing ? (
                <Input
                  id="cocType"
                  value={editedData.cocType || ''}
                  onChange={(e) => setEditedData({ ...editedData, cocType: e.target.value })}
                  placeholder="e.g., ECA, ECSA"
                />
              ) : (
                <div className="p-2 bg-muted rounded-md">
                  {editedData.cocType || <span className="text-muted-foreground">Not extracted</span>}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cocIssueDate">Issue Date</Label>
              {isEditing ? (
                <Input
                  id="cocIssueDate"
                  type="date"
                  value={editedData.cocIssueDate || ''}
                  onChange={(e) => setEditedData({ ...editedData, cocIssueDate: e.target.value })}
                />
              ) : (
                <div className="p-2 bg-muted rounded-md">
                  {editedData.cocIssueDate || <span className="text-muted-foreground">Not extracted</span>}
                </div>
              )}
            </div>
          </div>

          {/* Administrative Details */}
          {editedData.administrativeDetails && (
            <>
              <Separator className="my-6" />
              <h3 className="text-lg font-semibold">Administrative Details</h3>
              
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="registeredPerson">Registered Person</Label>
                  {isEditing ? (
                    <Input
                      id="registeredPerson"
                      value={editedData.administrativeDetails?.registeredPerson || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          registeredPerson: e.target.value
                        }
                      })}
                      placeholder="Enter registered person name"
                    />
                  ) : (
                    <div className="p-2 bg-muted rounded-md">
                      {editedData.administrativeDetails?.registeredPerson || <span className="text-muted-foreground">Not extracted</span>}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number</Label>
                  {isEditing ? (
                    <Input
                      id="registrationNumber"
                      value={editedData.administrativeDetails?.registrationNumber || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          registrationNumber: e.target.value
                        }
                      })}
                      placeholder="Enter registration number"
                    />
                  ) : (
                    <div className="p-2 bg-muted rounded-md font-mono">
                      {editedData.administrativeDetails?.registrationNumber || <span className="text-muted-foreground">Not extracted</span>}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registrationType">Registration Type</Label>
                  {isEditing ? (
                    <Input
                      id="registrationType"
                      value={editedData.administrativeDetails?.registrationType || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          registrationType: e.target.value
                        }
                      })}
                      placeholder="e.g., Electrical Contractor"
                    />
                  ) : (
                    <div className="p-2 bg-muted rounded-md">
                      {editedData.administrativeDetails?.registrationType || <span className="text-muted-foreground">Not extracted</span>}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="idNumber">ID Number</Label>
                  {isEditing ? (
                    <Input
                      id="idNumber"
                      value={editedData.administrativeDetails?.idNumber || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          idNumber: e.target.value
                        }
                      })}
                      placeholder="Enter ID number"
                    />
                  ) : (
                    <div className="p-2 bg-muted rounded-md font-mono">
                      {editedData.administrativeDetails?.idNumber || <span className="text-muted-foreground">Not extracted</span>}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="physicalAddress">Physical Address</Label>
                  {isEditing ? (
                    <Input
                      id="physicalAddress"
                      value={editedData.administrativeDetails?.physicalAddress || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          physicalAddress: e.target.value
                        }
                      })}
                      placeholder="Enter physical address"
                    />
                  ) : (
                    <div className="p-2 bg-muted rounded-md">
                      {editedData.administrativeDetails?.physicalAddress || <span className="text-muted-foreground">Not extracted</span>}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="erfNumber">Erf / Lot Number</Label>
                  {isEditing ? (
                    <Input
                      id="erfNumber"
                      value={editedData.administrativeDetails?.erfNumber || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          erfNumber: e.target.value
                        }
                      })}
                      placeholder="Enter erf/lot number"
                    />
                  ) : (
                    <div className="p-2 bg-muted rounded-md">
                      {editedData.administrativeDetails?.erfNumber || <span className="text-muted-foreground">Not extracted</span>}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Scope of Work */}
          <Separator className="my-6" />
          <div className="space-y-2">
            <Label htmlFor="scopeOfWork">Scope of Work / Installation Details</Label>
            {isEditing ? (
              <Textarea
                id="scopeOfWork"
                value={editedData.scopeOfWork || ''}
                onChange={(e) => setEditedData({ ...editedData, scopeOfWork: e.target.value })}
                placeholder="Describe the electrical installation work performed..."
                rows={4}
              />
            ) : (
              <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap">
                {editedData.scopeOfWork || <span className="text-muted-foreground">Not extracted</span>}
              </div>
            )}
          </div>

          {/* Test Results Section */}
          <Separator className="my-6" />
          <h3 className="text-lg font-semibold">Test Results & Measurements</h3>
          
          {/* Earth Electrode Tests */}
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <h4 className="font-semibold text-sm">Earth Electrode System</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="earthResistance">Resistance (Ohms)</Label>
                {isEditing ? (
                  <Input
                    id="earthResistance"
                    value={editedData.testResults?.earthElectrode?.resistance || ''}
                    onChange={(e) => setEditedData({
                      ...editedData,
                      testResults: {
                        ...editedData.testResults,
                        earthElectrode: {
                          ...editedData.testResults?.earthElectrode,
                          resistance: e.target.value
                        }
                      }
                    })}
                    placeholder="e.g., 2.5"
                  />
                ) : (
                  <div className="p-2 bg-background rounded-md font-mono">
                    {editedData.testResults?.earthElectrode?.resistance || <span className="text-muted-foreground">Not extracted</span>}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="earthMethod">Test Method</Label>
                {isEditing ? (
                  <Input
                    id="earthMethod"
                    value={editedData.testResults?.earthElectrode?.method || ''}
                    onChange={(e) => setEditedData({
                      ...editedData,
                      testResults: {
                        ...editedData.testResults,
                        earthElectrode: {
                          ...editedData.testResults?.earthElectrode,
                          method: e.target.value
                        }
                      }
                    })}
                    placeholder="e.g., 3-point method"
                  />
                ) : (
                  <div className="p-2 bg-background rounded-md">
                    {editedData.testResults?.earthElectrode?.method || <span className="text-muted-foreground">Not extracted</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Insulation Resistance Tests */}
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <h4 className="font-semibold text-sm">Insulation Resistance (MΩ)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phase1ToEarth">Phase 1 to Earth</Label>
                {isEditing ? (
                  <Input
                    id="phase1ToEarth"
                    value={editedData.testResults?.insulationResistance?.phase1ToEarth || ''}
                    onChange={(e) => setEditedData({
                      ...editedData,
                      testResults: {
                        ...editedData.testResults,
                        insulationResistance: {
                          ...editedData.testResults?.insulationResistance,
                          phase1ToEarth: e.target.value
                        }
                      }
                    })}
                    placeholder="e.g., >1000"
                  />
                ) : (
                  <div className="p-2 bg-background rounded-md font-mono">
                    {editedData.testResults?.insulationResistance?.phase1ToEarth || <span className="text-muted-foreground">Not extracted</span>}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phase2ToEarth">Phase 2 to Earth</Label>
                {isEditing ? (
                  <Input
                    id="phase2ToEarth"
                    value={editedData.testResults?.insulationResistance?.phase2ToEarth || ''}
                    onChange={(e) => setEditedData({
                      ...editedData,
                      testResults: {
                        ...editedData.testResults,
                        insulationResistance: {
                          ...editedData.testResults?.insulationResistance,
                          phase2ToEarth: e.target.value
                        }
                      }
                    })}
                    placeholder="e.g., >1000"
                  />
                ) : (
                  <div className="p-2 bg-background rounded-md font-mono">
                    {editedData.testResults?.insulationResistance?.phase2ToEarth || <span className="text-muted-foreground">Not extracted</span>}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phase3ToEarth">Phase 3 to Earth</Label>
                {isEditing ? (
                  <Input
                    id="phase3ToEarth"
                    value={editedData.testResults?.insulationResistance?.phase3ToEarth || ''}
                    onChange={(e) => setEditedData({
                      ...editedData,
                      testResults: {
                        ...editedData.testResults,
                        insulationResistance: {
                          ...editedData.testResults?.insulationResistance,
                          phase3ToEarth: e.target.value
                        }
                      }
                    })}
                    placeholder="e.g., >1000"
                  />
                ) : (
                  <div className="p-2 bg-background rounded-md font-mono">
                    {editedData.testResults?.insulationResistance?.phase3ToEarth || <span className="text-muted-foreground">Not extracted</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Circuit Breaker Tests */}
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <h4 className="font-semibold text-sm">Circuit Breakers</h4>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cbRatings">Ratings & Details</Label>
                {isEditing ? (
                  <Input
                    id="cbRatings"
                    value={editedData.testResults?.circuitBreakers?.ratings || ''}
                    onChange={(e) => setEditedData({
                      ...editedData,
                      testResults: {
                        ...editedData.testResults,
                        circuitBreakers: {
                          ...editedData.testResults?.circuitBreakers,
                          ratings: e.target.value
                        }
                      }
                    })}
                    placeholder="e.g., Main: 80A, Sub: 20A, 16A, 10A"
                  />
                ) : (
                  <div className="p-2 bg-background rounded-md">
                    {editedData.testResults?.circuitBreakers?.ratings || <span className="text-muted-foreground">Not extracted</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RCD Tests */}
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <h4 className="font-semibold text-sm">RCD (Residual Current Device) Tests</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rcdCurrent">Rated Current (mA)</Label>
                {isEditing ? (
                  <Input
                    id="rcdCurrent"
                    value={editedData.testResults?.rcdTests?.ratedCurrent || ''}
                    onChange={(e) => setEditedData({
                      ...editedData,
                      testResults: {
                        ...editedData.testResults,
                        rcdTests: {
                          ...editedData.testResults?.rcdTests,
                          ratedCurrent: e.target.value
                        }
                      }
                    })}
                    placeholder="e.g., 30"
                  />
                ) : (
                  <div className="p-2 bg-background rounded-md font-mono">
                    {editedData.testResults?.rcdTests?.ratedCurrent || <span className="text-muted-foreground">Not extracted</span>}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="rcdTripTime">Trip Time (ms)</Label>
                {isEditing ? (
                  <Input
                    id="rcdTripTime"
                    value={editedData.testResults?.rcdTests?.tripTime || ''}
                    onChange={(e) => setEditedData({
                      ...editedData,
                      testResults: {
                        ...editedData.testResults,
                        rcdTests: {
                          ...editedData.testResults?.rcdTests,
                          tripTime: e.target.value
                        }
                      }
                    })}
                    placeholder="e.g., 25"
                  />
                ) : (
                  <div className="p-2 bg-background rounded-md font-mono">
                    {editedData.testResults?.rcdTests?.tripTime || <span className="text-muted-foreground">Not extracted</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Declaration & Signature */}
          <Separator className="my-6" />
          <h3 className="text-lg font-semibold">Declaration & Certification</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="certifiedBy">Certified By</Label>
              {isEditing ? (
                <Input
                  id="certifiedBy"
                  value={editedData.declarationAndSignature?.certifiedBy || ''}
                  onChange={(e) => setEditedData({
                    ...editedData,
                    declarationAndSignature: {
                      ...editedData.declarationAndSignature,
                      certifiedBy: e.target.value
                    }
                  })}
                  placeholder="Name of certifying person"
                />
              ) : (
                <div className="p-2 bg-muted rounded-md">
                  {editedData.declarationAndSignature?.certifiedBy || <span className="text-muted-foreground">Not extracted</span>}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="certDate">Certification Date</Label>
              {isEditing ? (
                <Input
                  id="certDate"
                  type="date"
                  value={editedData.declarationAndSignature?.date || ''}
                  onChange={(e) => setEditedData({
                    ...editedData,
                    declarationAndSignature: {
                      ...editedData.declarationAndSignature,
                      date: e.target.value
                    }
                  })}
                />
              ) : (
                <div className="p-2 bg-muted rounded-md">
                  {editedData.declarationAndSignature?.date || <span className="text-muted-foreground">Not extracted</span>}
                </div>
              )}
            </div>
          </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={isProcessing}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleApprove}
            disabled={isProcessing || !editedData.cocNumber}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isProcessing ? 'Starting Verification...' : 'Approve & Start Verification'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
