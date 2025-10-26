import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, AlertTriangle, FileText, RefreshCw, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface ExtractedData {
  // Core Certificate Identification
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  
  // Supplement Details (if supplementary certificate)
  supplementDetails?: {
    supplementNo?: string;
    initialCertificateNo?: string;
    issuedOn?: string;
  };
  
  // Administrative Details
  administrativeDetails?: {
    physicalAddress?: string;
    buildingName?: string;
    gpsCoordinates?: string;
    suburb?: string;
    poleNumber?: string;
    district?: string;
    erfNumber?: string;
    registeredPerson?: string;
    idNumber?: string;
    registrationNumber?: string;
    registrationType?: string;
    dateOfRegistration?: string;
  };
  
  // Registered Person Contact
  registeredPersonContact?: {
    address?: string;
    telNo?: string;
    faxNo?: string;
    cellNo?: string;
    email?: string;
  };
  
  // Electrical Contractor Details
  electricalContractor?: {
    name?: string;
    idNumber?: string;
    registrationNumber?: string;
    dateOfRegistration?: string;
    address?: string;
    telNo?: string;
    faxNo?: string;
    cellNo?: string;
    email?: string;
  };
  
  // Recipient
  recipient?: {
    name?: string;
    signatureDate?: string;
  };
  
  // Test Report Header
  testReport?: {
    issueDate?: string;
    testReportFor?: string;
    additionalPages?: string;
    numberOfPagesAdded?: string;
  };
  
  // Installation Details
  installationDetails?: {
    physicalAddress?: string;
    buildingName?: string;
    installationType?: string;
    voltage?: string;
    numberOfPhases?: string;
    phaseRotation?: string;
    frequency?: string;
    mainSwitchType?: string;
    numberOfPoles?: string;
    currentRating?: string;
    shortCircuitRating?: string;
    earthLeakageRating?: string;
    supplyInstalled?: string;
    supplyTested?: string;
    supplyOperational?: string;
  };

  // Installation Description (Section 3)
  installationDescription?: {
    lightingCircuits?: { new?: string; existing?: string };
    lightingPoints?: { new?: string; existing?: string };
    socketOutletCircuits?: { new?: string; existing?: string };
    socketOutlets?: { new?: string; existing?: string };
    airConditioningCircuits?: { new?: string; existing?: string };
    transformerCircuitsLighting?: { new?: string; existing?: string };
    transformerCircuitsBell?: { new?: string; existing?: string };
    transformerCircuitsOther?: { new?: string; existing?: string };
    heatingCircuits?: { new?: string; existing?: string };
    alternativePowerSupply?: { new?: string; existing?: string };
    otherCircuits?: { new?: string; existing?: string };
    fanCircuits?: { new?: string; existing?: string };
    fanCircuitsCooking?: { new?: string; existing?: string };
    fanCircuitsGeyser?: { new?: string; existing?: string };
    fixedAppliancePoolPump?: { new?: string; existing?: string };
    fixedApplianceBoreholeP?: { new?: string; existing?: string };
    fixedApplianceOther?: { new?: string; existing?: string };
    earthLeakageCompleteInstallation?: { new?: string; existing?: string };
    earthLeakagePartOfInstallation?: { new?: string; existing?: string };
  };
  
  // Inspection Checks
  inspectionChecks?: {
    conductorsCorrect?: string;
    componentsCorrect?: string;
    disconnectingDevicesCorrect?: string;
  };
  
  // Test Results
  testResults?: {
    continuityOfBonding?: string;
    earthContinuityResistance?: string;
    ringCircuitsContinuity?: string;
    earthLoopImpedance?: string;
    neutralLoopImpedance?: string;
    prospectiveShortCircuitCurrent?: string;
    elevatedVoltage?: string;
    insulationResistance?: string;
    voltageNoLoad?: string;
    voltageFullLoad?: string;
    earthLeakageOperation?: string;
    earthLeakageTestButton?: string;
    phaseRotation?: string;
    switchingDevices?: string;
  };
  
  // Comments
  comments?: string;
  
  // Responsibility Section
  responsibility?: {
    name?: string;
    registrationCertNo?: string;
    registrationType?: string;
    telNo?: string;
    signatureDate?: string;
  };
  
  // Scope of Work
  scopeOfWork?: string;
  
  // Metadata
  confidence?: 'high' | 'medium' | 'low';
  extractionNotes?: string;
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
    registeredPersonContact: {},
    electricalContractor: {},
    recipient: {},
    testReport: {},
    installationDetails: {},
    inspectionChecks: {},
    testResults: {},
    responsibility: {},
    scopeOfWork: '',
    comments: '',
    confidence: 'low'
  });

  // PDF viewer state
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Validation: Check if minimum required fields are filled
  const validateCompleteness = (): { isComplete: boolean; missingFields: string[] } => {
    const missing: string[] = [];
    
    // ALWAYS REQUIRED: Core Certificate Fields
    if (!editedData.cocNumber?.trim()) missing.push("COC Number");
    if (!editedData.cocType?.trim()) missing.push("COC Type");
    
    // Issue Date: Check both cocIssueDate (page 1) and testReport.issueDate (page 2)
    const hasIssueDate = editedData.cocIssueDate?.trim() || editedData.testReport?.issueDate?.trim();
    if (!hasIssueDate) missing.push("Issue Date");
    
    // ALWAYS REQUIRED: Key Administrative Details
    if (!editedData.administrativeDetails?.physicalAddress?.trim()) missing.push("Physical Address");
    if (!editedData.administrativeDetails?.registeredPerson?.trim()) missing.push("Registered Person");
    if (!editedData.administrativeDetails?.registrationNumber?.trim()) missing.push("Registration Number");
    
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
                <>Review extracted data from <strong>{documentName}</strong> before verification</>
              ) : (
                <>Preview <strong>{documentName}</strong> and fill fields manually or use AI extraction</>
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
                  No data extracted yet. Fill fields manually or click "Extract with AI".
                </AlertDescription>
              </Alert>
            )}
            
            {hasExtractedData && !isComplete && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-semibold">Incomplete - Missing {missingFields.length} required field(s):</p>
                    <ul className="list-disc list-inside text-sm">
                      {missingFields.map((field, idx) => (
                        <li key={idx}>{field}</li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {hasExtractedData && isComplete && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  All required fields complete. Review and approve to verify.
                </AlertDescription>
              </Alert>
            )}

            {/* COC FORM - Matching ECA Format */}
            <div className="space-y-4 bg-white dark:bg-slate-950 border-2 rounded-lg p-6">
              
              {/* Header */}
              <div className="border-b-2 pb-4 mb-4">
                <h2 className="text-xl font-bold text-center uppercase tracking-wide">
                  Certificate of Compliance
                </h2>
                <p className="text-center text-sm text-muted-foreground mt-1">
                  General Electrical Installation
                </p>
              </div>

              {/* Certificate Details */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Certificate Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Certificate No. <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.cocNumber || ''}
                      onChange={(e) => setEditedData({ ...editedData, cocNumber: e.target.value })}
                      className="h-9 font-mono"
                      placeholder="ECA 642760"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Certificate Type <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={editedData.cocType || ''}
                      onChange={(e) => setEditedData({ ...editedData, cocType: e.target.value })}
                      className="h-9"
                      placeholder="Initial / Supplementary"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Issue Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={editedData.cocIssueDate || editedData.testReport?.issueDate || ''}
                      onChange={(e) => setEditedData({ 
                        ...editedData, 
                        cocIssueDate: e.target.value,
                        testReport: {
                          ...editedData.testReport,
                          issueDate: e.target.value
                        }
                      })}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Installation Identification */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Installation Identification
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
                      placeholder="14 Voortrekker Street"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Building Name</Label>
                      <Input
                        value={editedData.administrativeDetails?.buildingName || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          administrativeDetails: {
                            ...editedData.administrativeDetails,
                            buildingName: e.target.value
                          }
                        })}
                        className="h-9"
                        placeholder="Shop 8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Erf/Lot No.</Label>
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
                        placeholder="2564"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Suburb/Township</Label>
                      <Input
                        value={editedData.administrativeDetails?.suburb || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          administrativeDetails: {
                            ...editedData.administrativeDetails,
                            suburb: e.target.value
                          }
                        })}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">District/Town/City</Label>
                      <Input
                        value={editedData.administrativeDetails?.district || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          administrativeDetails: {
                            ...editedData.administrativeDetails,
                            district: e.target.value
                          }
                        })}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Registered Person */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Declaration by Registered Person
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
                      placeholder="H.C. Koekemoer"
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
                      placeholder="25069"
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
                      placeholder="Installation electrician"
                    />
                  </div>
                </div>
              </div>

              {/* Installation Details */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Installation Details (Section 2)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Voltage</Label>
                    <Input
                      value={editedData.installationDetails?.voltage || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          voltage: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="230V/400V"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Phases</Label>
                    <Input
                      value={editedData.installationDetails?.numberOfPhases || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          numberOfPhases: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="Three"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Phase Rotation</Label>
                    <Input
                      value={editedData.installationDetails?.phaseRotation || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          phaseRotation: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="Clockwise"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Frequency</Label>
                    <Input
                      value={editedData.installationDetails?.frequency || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          frequency: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="50 Hz"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Main Switch Type</Label>
                    <Input
                      value={editedData.installationDetails?.mainSwitchType || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          mainSwitchType: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="Circuit-breaker"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Number of Poles</Label>
                    <Input
                      value={editedData.installationDetails?.numberOfPoles || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          numberOfPoles: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="3"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Current Rating</Label>
                    <Input
                      value={editedData.installationDetails?.currentRating || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          currentRating: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="80A"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Short-circuit Rating</Label>
                    <Input
                      value={editedData.installationDetails?.shortCircuitRating || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          shortCircuitRating: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="6 KA"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Earth Leakage Rating</Label>
                    <Input
                      value={editedData.installationDetails?.earthLeakageRating || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        installationDetails: {
                          ...editedData.installationDetails,
                          earthLeakageRating: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="N/A or 30mA"
                    />
                  </div>
                </div>
                <div className="border-t pt-3 mt-3">
                  <h4 className="text-xs font-semibold mb-2">Connection to Supply</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Installed?</Label>
                      <Input
                        value={editedData.installationDetails?.supplyInstalled || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          installationDetails: {
                            ...editedData.installationDetails,
                            supplyInstalled: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tested?</Label>
                      <Input
                        value={editedData.installationDetails?.supplyTested || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          installationDetails: {
                            ...editedData.installationDetails,
                            supplyTested: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Operational?</Label>
                      <Input
                        value={editedData.installationDetails?.supplyOperational || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          installationDetails: {
                            ...editedData.installationDetails,
                            supplyOperational: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Installation Description - Section 3 */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Section 3 - Description of Installation
                </h3>
                <p className="text-xs text-muted-foreground mb-3">Number of circuits or points</p>
                <div className="grid grid-cols-3 gap-2 text-xs font-semibold mb-2">
                  <div></div>
                  <div className="text-center">New</div>
                  <div className="text-center">Existing</div>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Lighting circuits', key: 'lightingCircuits' },
                    { label: 'Lighting points', key: 'lightingPoints' },
                    { label: 'Socket-outlet circuits', key: 'socketOutletCircuits' },
                    { label: 'Socket-outlets', key: 'socketOutlets' },
                    { label: 'Air-conditioning circuits', key: 'airConditioningCircuits' },
                    { label: 'Transformer circuits - Lighting', key: 'transformerCircuitsLighting' },
                    { label: 'Transformer circuits - Bell', key: 'transformerCircuitsBell' },
                    { label: 'Transformer circuits - Other', key: 'transformerCircuitsOther' },
                    { label: 'Heating circuits', key: 'heatingCircuits' },
                    { label: 'Alternative power supply connections', key: 'alternativePowerSupply' },
                    { label: 'Other circuits or points', key: 'otherCircuits' },
                    { label: 'Fan circuits', key: 'fanCircuits' },
                    { label: 'Fan circuits - Cooking', key: 'fanCircuitsCooking' },
                    { label: 'Fan circuits - Geyser', key: 'fanCircuitsGeyser' },
                    { label: 'Fixed appliance - Pool pump', key: 'fixedAppliancePoolPump' },
                    { label: 'Fixed appliance - Borehole pump', key: 'fixedApplianceBoreholeP' },
                    { label: 'Fixed appliance - Other', key: 'fixedApplianceOther' },
                    { label: 'Earth leakage - Complete installation', key: 'earthLeakageCompleteInstallation' },
                    { label: 'Earth leakage - Only part', key: 'earthLeakagePartOfInstallation' },
                  ].map(({ label, key }) => (
                    <div key={key} className="grid grid-cols-3 gap-2 items-center">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        value={(editedData.installationDescription as any)?.[key]?.new || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          installationDescription: {
                            ...editedData.installationDescription,
                            [key]: {
                              ...(editedData.installationDescription as any)?.[key],
                              new: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm text-center"
                        placeholder="-"
                      />
                      <Input
                        value={(editedData.installationDescription as any)?.[key]?.existing || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          installationDescription: {
                            ...editedData.installationDescription,
                            [key]: {
                              ...(editedData.installationDescription as any)?.[key],
                              existing: e.target.value
                            }
                          }
                        })}
                        className="h-8 text-sm text-center"
                        placeholder="-"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Inspection Checks */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Section 4 - Inspection Checks
                </h3>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">1. Conductors are of correct rating and current-carrying capacity</Label>
                    <Input
                      value={editedData.inspectionChecks?.conductorsCorrect || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        inspectionChecks: {
                          ...editedData.inspectionChecks,
                          conductorsCorrect: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="Yes/No/N/A"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">2. Components have been correctly selected and installed</Label>
                    <Input
                      value={editedData.inspectionChecks?.componentsCorrect || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        inspectionChecks: {
                          ...editedData.inspectionChecks,
                          componentsCorrect: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="Yes/No/N/A"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">3. Disconnecting devices are correctly located</Label>
                    <Input
                      value={editedData.inspectionChecks?.disconnectingDevicesCorrect || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        inspectionChecks: {
                          ...editedData.inspectionChecks,
                          disconnectingDevicesCorrect: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="Yes/No/N/A"
                    />
                  </div>
                </div>
              </div>

              {/* Test Results */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Test Results (Section 4)
                </h3>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Continuity of Bonding</Label>
                      <Input
                        value={editedData.testResults?.continuityOfBonding || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            continuityOfBonding: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Compliant"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Earth Continuity Resistance</Label>
                      <Input
                        value={editedData.testResults?.earthContinuityResistance || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            earthContinuityResistance: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Compliant"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ring Circuits Continuity</Label>
                      <Input
                        value={editedData.testResults?.ringCircuitsContinuity || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            ringCircuitsContinuity: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="N/A"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Earth Loop Impedance (Ω)</Label>
                      <Input
                        value={editedData.testResults?.earthLoopImpedance || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            earthLoopImpedance: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="0.16Ω"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Neutral Loop Impedance (Ω)</Label>
                      <Input
                        value={editedData.testResults?.neutralLoopImpedance || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            neutralLoopImpedance: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="0.16Ω"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Prospective Short Circuit Current</Label>
                      <Input
                        value={editedData.testResults?.prospectiveShortCircuitCurrent || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            prospectiveShortCircuitCurrent: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="1.44kA"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Elevated Voltage (V)</Label>
                      <Input
                        value={editedData.testResults?.elevatedVoltage || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            elevatedVoltage: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="0V"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Insulation Resistance (MΩ)</Label>
                      <Input
                        value={editedData.testResults?.insulationResistance || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            insulationResistance: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder=">90 MΩ"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Voltage No Load (V)</Label>
                      <Input
                        value={editedData.testResults?.voltageNoLoad || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            voltageNoLoad: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="237V, 237V, 237V"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Voltage Full Load (V)</Label>
                      <Input
                        value={editedData.testResults?.voltageFullLoad || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            voltageFullLoad: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="240V, 240V, 237V"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Earth Leakage Operation</Label>
                      <Input
                        value={editedData.testResults?.earthLeakageOperation || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            earthLeakageOperation: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="N/A or correct"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Earth Leakage Test Button</Label>
                      <Input
                        value={editedData.testResults?.earthLeakageTestButton || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            earthLeakageTestButton: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="correct"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phase Rotation</Label>
                      <Input
                        value={editedData.testResults?.phaseRotation || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            phaseRotation: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="correct"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Switching Devices</Label>
                      <Input
                        value={editedData.testResults?.switchingDevices || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          testResults: {
                            ...editedData.testResults,
                            switchingDevices: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="correct"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Responsibility */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Section 5 - Responsibility
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Name of Registered Person</Label>
                    <Input
                      value={editedData.responsibility?.name || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        responsibility: {
                          ...editedData.responsibility,
                          name: e.target.value
                        }
                      })}
                      className="h-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Registration Certificate No.</Label>
                      <Input
                        value={editedData.responsibility?.registrationCertNo || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          responsibility: {
                            ...editedData.responsibility,
                            registrationCertNo: e.target.value
                          }
                        })}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Registration Type</Label>
                      <Input
                        value={editedData.responsibility?.registrationType || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          responsibility: {
                            ...editedData.responsibility,
                            registrationType: e.target.value
                          }
                        })}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Tel No.</Label>
                      <Input
                        value={editedData.responsibility?.telNo || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          responsibility: {
                            ...editedData.responsibility,
                            telNo: e.target.value
                          }
                        })}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Signature Date</Label>
                      <Input
                        type="date"
                        value={editedData.responsibility?.signatureDate || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          responsibility: {
                            ...editedData.responsibility,
                            signatureDate: e.target.value
                          }
                        })}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Comments */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Comments
                </h3>
                <div className="space-y-1">
                  <Label className="text-xs">Comments on parts of installation not covered by this report</Label>
                  <Textarea
                    value={editedData.comments || ''}
                    onChange={(e) => setEditedData({
                      ...editedData,
                      comments: e.target.value
                    })}
                    className="min-h-[80px] text-sm"
                    placeholder="Enter any additional comments..."
                  />
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
