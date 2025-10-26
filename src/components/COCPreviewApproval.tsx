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
  // Certificate Identification (Required)
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  
  // Administrative Details (Required)
  administrativeDetails?: {
    physicalAddress?: string;
    erfNumber?: string;
    registeredPerson?: string;
    idNumber?: string;
    registrationNumber?: string;
    registrationType?: string;
    registrationDate?: string;
  };
  
  // Installation Details (Required)
  installationDetails?: {
    supplyType?: string; // Single phase / Three phase
    supplyVoltage?: string; // e.g., 230V / 400V
    mainSwitchRating?: string; // e.g., 80A
    distributionBoardType?: string;
    numberOfCircuits?: string;
  };
  
  // Scope of Work (Required)
  scopeOfWork?: string;
  
  // Test Results (All Required for Valid COC)
  testResults?: {
    earthElectrode?: {
      resistance?: string;
      method?: string;
      result?: string; // Pass/Fail
    };
    insulationResistance?: {
      phase1ToEarth?: string;
      phase2ToEarth?: string;
      phase3ToEarth?: string;
      phaseToPhase?: string;
      neutralToEarth?: string;
      result?: string; // Pass/Fail
    };
    polarity?: {
      verified?: string; // Yes/No
      result?: string; // Pass/Fail
    };
    earthContinuity?: {
      mainBonding?: string;
      circuitConductors?: string;
      result?: string; // Pass/Fail
    };
    circuitBreakers?: {
      ratings?: string;
      tested?: string; // Yes/No
      result?: string; // Pass/Fail
    };
    rcdTests?: {
      ratedCurrent?: string;
      tripTime?: string;
      testCurrent?: string;
      result?: string; // Pass/Fail
    };
    shortCircuitCapacity?: {
      prospectiveFaultCurrent?: string;
      verified?: string; // Yes/No
      result?: string; // Pass/Fail
    };
  };
  
  // Declaration & Signature (Required)
  declarationAndSignature?: {
    certifiedBy?: string;
    inspectorRegistrationNumber?: string;
    date?: string;
    signature?: string;
  };
  
  // Installation Summary (Optional but recommended)
  installationSummary?: string;
  
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
  const [editedData, setEditedData] = useState<ExtractedData>(extractedData || {
    cocNumber: '',
    cocIssueDate: '',
    cocType: '',
    administrativeDetails: {},
    installationDetails: {},
    installationSummary: '',
    testResults: {
      earthElectrode: {},
      insulationResistance: {},
      polarity: {},
      earthContinuity: {},
      circuitBreakers: {},
      rcdTests: {},
      shortCircuitCapacity: {}
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

  // Validation: Check if all required fields are filled based on what was originally extracted
  const validateCompleteness = (): { isComplete: boolean; missingFields: string[] } => {
    const missing: string[] = [];
    
    // Helper function to check if a field was originally populated (not just an empty nested object)
    const wasOriginallyExtracted = (value: any): boolean => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'object' && !Array.isArray(value)) {
        // Check if object has any non-empty values
        return Object.values(value).some(v => 
          typeof v === 'string' ? v.trim().length > 0 : !!v
        );
      }
      return false;
    };

    // ALWAYS REQUIRED: Core Certificate Fields (these must be on every COC)
    if (!editedData.cocNumber?.trim()) missing.push("COC Number");
    if (!editedData.cocType?.trim()) missing.push("COC Type");
    if (!editedData.cocIssueDate?.trim()) missing.push("Issue Date");
    
    // ALWAYS REQUIRED: Administrative Details
    if (!editedData.administrativeDetails?.physicalAddress?.trim()) {
      missing.push("Physical Address");
    }
    if (!editedData.administrativeDetails?.registeredPerson?.trim()) {
      missing.push("Registered Person");
    }
    if (!editedData.administrativeDetails?.registrationNumber?.trim()) {
      missing.push("Registration Number");
    }
    
    // CONDITIONALLY REQUIRED: Only validate if data was originally extracted
    
    // Installation Details - only required if originally extracted
    if (wasOriginallyExtracted(extractedData?.installationDetails)) {
      if (!editedData.installationDetails?.supplyType?.trim()) missing.push("Supply Type");
      if (!editedData.installationDetails?.mainSwitchRating?.trim()) missing.push("Main Switch Rating");
    }
    
    // Scope of Work - only required if originally extracted
    if (extractedData?.scopeOfWork || editedData.scopeOfWork?.trim()) {
      if (!editedData.scopeOfWork?.trim()) missing.push("Scope of Work");
    }
    
    // Test Results - only validate sections that were originally extracted
    if (wasOriginallyExtracted(extractedData?.testResults?.earthElectrode)) {
      if (!editedData.testResults?.earthElectrode?.resistance?.trim()) {
        missing.push("Earth Electrode Resistance");
      }
      if (!editedData.testResults?.earthElectrode?.result?.trim()) {
        missing.push("Earth Electrode Result");
      }
    }
    
    if (wasOriginallyExtracted(extractedData?.testResults?.insulationResistance)) {
      if (!editedData.testResults?.insulationResistance?.phase1ToEarth?.trim()) {
        missing.push("Insulation Resistance (Phase 1)");
      }
      if (!editedData.testResults?.insulationResistance?.result?.trim()) {
        missing.push("Insulation Resistance Result");
      }
    }
    
    if (wasOriginallyExtracted(extractedData?.testResults?.polarity)) {
      if (!editedData.testResults?.polarity?.verified?.trim()) {
        missing.push("Polarity Verification");
      }
      if (!editedData.testResults?.polarity?.result?.trim()) {
        missing.push("Polarity Result");
      }
    }
    
    if (wasOriginallyExtracted(extractedData?.testResults?.earthContinuity)) {
      if (!editedData.testResults?.earthContinuity?.result?.trim()) {
        missing.push("Earth Continuity Result");
      }
    }
    
    if (wasOriginallyExtracted(extractedData?.testResults?.circuitBreakers)) {
      if (!editedData.testResults?.circuitBreakers?.tested?.trim()) {
        missing.push("Circuit Breakers Tested");
      }
      if (!editedData.testResults?.circuitBreakers?.result?.trim()) {
        missing.push("Circuit Breakers Result");
      }
    }
    
    if (wasOriginallyExtracted(extractedData?.testResults?.rcdTests)) {
      if (!editedData.testResults?.rcdTests?.result?.trim()) {
        missing.push("RCD Test Result");
      }
    }
    
    // Declaration - only validate if originally extracted
    if (wasOriginallyExtracted(extractedData?.declarationAndSignature)) {
      if (!editedData.declarationAndSignature?.certifiedBy?.trim()) {
        missing.push("Certified By");
      }
      if (!editedData.declarationAndSignature?.inspectorRegistrationNumber?.trim()) {
        missing.push("Inspector Registration Number");
      }
      if (!editedData.declarationAndSignature?.date?.trim()) {
        missing.push("Certification Date");
      }
    }
    
    return {
      isComplete: missing.length === 0,
      missingFields: missing
    };
  };

  const { isComplete, missingFields } = validateCompleteness();

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
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {!hasExtractedData && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No data has been extracted yet. Fill in the fields below or click "Extract with AI" for automatic extraction.
                </AlertDescription>
              </Alert>
            )}
            
            {hasExtractedData && !isComplete && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-semibold">Incomplete COC - Missing {missingFields.length} required field(s):</p>
                    <ul className="list-disc list-inside text-sm">
                      {missingFields.slice(0, 5).map((field, idx) => (
                        <li key={idx}>{field}</li>
                      ))}
                      {missingFields.length > 5 && (
                        <li>...and {missingFields.length - 5} more fields</li>
                      )}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {hasExtractedData && isComplete && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  All required fields are complete. Review and approve to proceed with verification.
                </AlertDescription>
              </Alert>
            )}

            {/* COC FORM - Document Style */}
            <div className="space-y-4 bg-white dark:bg-slate-950 border-2 rounded-lg p-6">
              
              {/* Header Section */}
              <div className="border-b-2 pb-4 mb-4">
                <h2 className="text-xl font-bold text-center uppercase tracking-wide">
                  Certificate of Compliance
                </h2>
                <p className="text-center text-sm text-muted-foreground mt-1">
                  Electrical Installation Certificate
                </p>
              </div>

              {/* Section 1: Certificate Details */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  1. Certificate Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      COC Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.cocNumber || ''}
                      onChange={(e) => setEditedData({ ...editedData, cocNumber: e.target.value })}
                      className="h-9 font-mono"
                      placeholder="Enter COC number"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      COC Type <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.cocType || ''}
                      onChange={(e) => setEditedData({ ...editedData, cocType: e.target.value })}
                      className="h-9"
                      placeholder="e.g., New Installation"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Issue Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={editedData.cocIssueDate || ''}
                      onChange={(e) => setEditedData({ ...editedData, cocIssueDate: e.target.value })}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Installation Location */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  2. Installation Location & Details
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Physical Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.administrativeDetails?.physicalAddress || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          physicalAddress: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="Street address"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Erf/Lot Number</Label>
                    <Input
                      value={editedData.administrativeDetails?.erfNumber || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          erfNumber: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="Erf number"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Registered Person Details */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  3. Registered Person / Contractor Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.administrativeDetails?.registeredPerson || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          registeredPerson: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Registration Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.administrativeDetails?.registrationNumber || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          registrationNumber: e.target.value
                        }
                      })}
                      className="h-9 font-mono"
                      placeholder="Registration no."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Registration Type</Label>
                    <Input
                      value={editedData.administrativeDetails?.registrationType || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          registrationType: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="e.g., Electrical Contractor"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">ID Number</Label>
                    <Input
                      value={editedData.administrativeDetails?.idNumber || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        administrativeDetails: {
                          ...editedData.administrativeDetails,
                          idNumber: e.target.value
                        }
                      })}
                      className="h-9 font-mono"
                      placeholder="ID number"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Installation Particulars */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  4. Installation Particulars
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Supply Type <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.installationDetails?.supplyType || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          supplyType: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="Single/Three Phase"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Voltage</Label>
                    <Input
                      value={editedData.installationDetails?.supplyVoltage || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          supplyVoltage: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="230V/400V"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Main Switch <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.installationDetails?.mainSwitchRating || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          mainSwitchRating: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="e.g., 80A"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">DB Type</Label>
                    <Input
                      value={editedData.installationDetails?.distributionBoardType || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          distributionBoardType: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="Steel/Plastic"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">No. of Circuits</Label>
                    <Input
                      value={editedData.installationDetails?.numberOfCircuits || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          numberOfCircuits: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="e.g., 12"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    Scope of Work <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={editedData.scopeOfWork || ''}
                    onChange={(e) => setEditedData({ ...editedData, scopeOfWork: e.target.value })}
                    rows={3}
                    placeholder="Describe the work performed..."
                  />
                </div>
              </div>

              {/* Section 5: Test Results */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  5. Test Results & Measurements
                </h3>
                
                {/* Earth Electrode */}
                <div className="bg-background rounded p-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase">5.1 Earth Electrode System</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Resistance (Ω) <span className="text-destructive">*</span>
                      </Label>
                      <Input
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
                        className="h-8 text-sm"
                        placeholder="e.g., 2.5"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Method</Label>
                      <Input
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
                        className="h-8 text-sm"
                        placeholder="3-point"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Result <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={editedData.testResults?.earthElectrode?.result || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            earthElectrode: {
                              ...editedData.testResults?.earthElectrode,
                              result: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Pass/Fail"
                      />
                    </div>
                  </div>
                </div>

                {/* Insulation Resistance */}
                <div className="bg-background rounded p-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase">5.2 Insulation Resistance (MΩ)</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Phase to Earth <span className="text-destructive">*</span>
                      </Label>
                      <Input
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
                        className="h-8 text-sm"
                        placeholder=">1000"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Result <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={editedData.testResults?.insulationResistance?.result || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            insulationResistance: {
                              ...editedData.testResults?.insulationResistance,
                              result: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Pass/Fail"
                      />
                    </div>
                  </div>
                </div>

                {/* Polarity */}
                <div className="bg-background rounded p-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase">5.3 Polarity Test</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Verified <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={editedData.testResults?.polarity?.verified || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            polarity: {
                              ...editedData.testResults?.polarity,
                              verified: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Result <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={editedData.testResults?.polarity?.result || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            polarity: {
                              ...editedData.testResults?.polarity,
                              result: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Pass/Fail"
                      />
                    </div>
                  </div>
                </div>

                {/* Earth Continuity */}
                <div className="bg-background rounded p-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase">5.4 Earth Continuity</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Bonding Verified</Label>
                      <Input
                        value={editedData.testResults?.earthContinuity?.mainBonding || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            earthContinuity: {
                              ...editedData.testResults?.earthContinuity,
                              mainBonding: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Result <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={editedData.testResults?.earthContinuity?.result || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            earthContinuity: {
                              ...editedData.testResults?.earthContinuity,
                              result: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Pass/Fail"
                      />
                    </div>
                  </div>
                </div>

                {/* Circuit Breakers */}
                <div className="bg-background rounded p-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase">5.5 Circuit Protection Devices</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Ratings</Label>
                      <Input
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
                        className="h-8 text-sm"
                        placeholder="80A, 20A, 16A"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Tested <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={editedData.testResults?.circuitBreakers?.tested || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            circuitBreakers: {
                              ...editedData.testResults?.circuitBreakers,
                              tested: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Result <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={editedData.testResults?.circuitBreakers?.result || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            circuitBreakers: {
                              ...editedData.testResults?.circuitBreakers,
                              result: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Pass/Fail"
                      />
                    </div>
                  </div>
                </div>

                {/* RCD Tests */}
                <div className="bg-background rounded p-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase">5.6 RCD Tests</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Rating (mA)</Label>
                      <Input
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
                        className="h-8 text-sm"
                        placeholder="30"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Trip Time (ms)</Label>
                      <Input
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
                        className="h-8 text-sm"
                        placeholder="25"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Result <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={editedData.testResults?.rcdTests?.result || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            rcdTests: {
                              ...editedData.testResults?.rcdTests,
                              result: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Pass/Fail/N/A"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 6: Declaration */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  6. Declaration & Certification
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Certified By <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.declarationAndSignature?.certifiedBy || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        declarationAndSignature: {
                          ...editedData.declarationAndSignature,
                          certifiedBy: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Inspector Registration Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.declarationAndSignature?.inspectorRegistrationNumber || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        declarationAndSignature: {
                          ...editedData.declarationAndSignature,
                          inspectorRegistrationNumber: e.target.value
                        }
                      })}
                      className="h-9 font-mono"
                      placeholder="Registration number"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={editedData.declarationAndSignature?.date || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        declarationAndSignature: {
                          ...editedData.declarationAndSignature,
                          date: e.target.value
                        }
                      })}
                      className="h-9"
                    />
                  </div>
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
            disabled={isProcessing || !isComplete}
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
