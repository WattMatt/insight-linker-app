import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, AlertTriangle, FileText, RefreshCw, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, X, Sparkles, RotateCcw, Clock, FileCheck, FilePlus } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from 'react-pdf';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Field display names for user-friendly messaging
const FIELD_DISPLAY_NAMES: Record<string, string> = {
  'cocNumber': 'COC Number',
  'cocType': 'COC Type',
  'cocIssueDate': 'Issue Date',
  'physicalAddress': 'Physical Address',
  'registeredPerson': 'Registered Person',
  'registrationNumber': 'Registration Number',
  'initialCertificateNo': 'Initial COC Reference',
  'expiryDate': 'Expiry Date',
};
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
  
  // Temporary Details (if temporary certificate)
  temporaryDetails?: {
    expiryDate?: string;
    validityPeriod?: string;
    reason?: string;
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

  // Test Report Section 1 - Location
  testReportLocation?: {
    physicalAddress?: string;
    buildingName?: string;
  };

  // Installation Details
  installationDetails?: {
    physicalAddress?: string;
    buildingName?: string;
    installationType?: string;
    electricitySupplySystem?: string;
    voltage?: string;
    numberOfPhases?: string;
    phaseRotation?: string;
    frequency?: string;
    mainSwitchType?: string;
    numberOfPoles?: string;
    currentRating?: string;
    shortCircuitRating?: string;
    earthLeakageRating?: string;
    surgeProtectionInstalled?: string;
    lightningProtectionInstalled?: string;
    alternativePowerSupply?: string;
    specializedInstallation?: string;
    voltageAbove1kV?: string;
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
    markingAndLabelling?: string;
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
    polarityOfPoints?: string;
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
  
  // All dates found during extraction for manual selection
  allDatesFound?: Array<{
    rawDate: string;
    convertedDate: string;
    location: string;
    usedFor?: string;
  }>;
}

interface COCPreviewApprovalProps {
  extractedData: ExtractedData | null;
  documentName: string;
  documentUrl: string;
  onApprove: (data: ExtractedData) => void;
  onReject: () => void;
  isProcessing?: boolean;
  onExtract?: () => void;
  onDataUpdate?: (data: ExtractedData) => void;
}

export function COCPreviewApproval({ 
  extractedData, 
  documentName,
  documentUrl,
  onApprove, 
  onReject,
  isProcessing = false,
  onExtract,
  onDataUpdate
}: COCPreviewApprovalProps) {
  // Helper to normalize cocType from various extraction formats
  const normalizeCocType = (type?: string): string => {
    if (!type) return '';
    const normalized = type.toLowerCase().trim();
    if (normalized.includes('initial') && !normalized.includes('unknown')) return 'Initial';
    if (normalized.includes('supplementary')) return 'Supplementary';
    if (normalized.includes('temporary')) return 'Temporary';
    if (normalized.includes('unknown') || normalized === '') return 'Unknown';
    return type; // Return original if no match
  };

  const [editedData, setEditedData] = useState<ExtractedData>(() => {
    if (!extractedData) {
      return {
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
      };
    }
    
    // Normalize cocType from extraction
    return {
      ...extractedData,
      cocType: normalizeCocType(extractedData.cocType)
    };
  });

  // Sync when extractedData changes (e.g., after re-extraction)
  useEffect(() => {
    if (extractedData) {
      setEditedData(prev => ({
        ...prev,
        ...extractedData,
        cocType: normalizeCocType(extractedData.cocType)
      }));
    }
  }, [extractedData]);

  // PDF viewer state
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [retryingFields, setRetryingFields] = useState<string[]>([]);
  const [isRetryingAll, setIsRetryingAll] = useState(false);

  // Get list of missing required fields (must match validateCompleteness logic)
  const getMissingFields = useCallback(() => {
    const missing: string[] = [];
    if (!editedData.cocNumber?.trim()) missing.push('cocNumber');
    if (!editedData.cocType?.trim()) missing.push('cocType');
    if (!editedData.cocIssueDate?.trim() && !editedData.testReport?.issueDate?.trim()) missing.push('cocIssueDate');
    if (!editedData.administrativeDetails?.physicalAddress?.trim()) missing.push('physicalAddress');
    if (!editedData.administrativeDetails?.registeredPerson?.trim()) missing.push('registeredPerson');
    if (!editedData.administrativeDetails?.registrationNumber?.trim()) missing.push('registrationNumber');
    
    // CONDITIONAL: Supplementary/Temporary require Initial COC Reference
    if (editedData.cocType === 'Supplementary' || editedData.cocType === 'Temporary') {
      if (!editedData.supplementDetails?.initialCertificateNo?.trim()) {
        missing.push('initialCertificateNo');
      }
    }
    
    // CONDITIONAL: Temporary requires Expiry Date
    if (editedData.cocType === 'Temporary') {
      if (!editedData.temporaryDetails?.expiryDate?.trim()) {
        missing.push('expiryDate');
      }
    }
    
    return missing;
  }, [editedData]);

  // Re-extract specific fields
  const handleRetryField = async (fieldName: string) => {
    setRetryingFields(prev => [...prev, fieldName]);
    
    try {
      const { data, error } = await supabase.functions.invoke('extract-coc', {
        body: { 
          documentUrl, 
          fileName: documentName,
          retryFields: [FIELD_DISPLAY_NAMES[fieldName] || fieldName]
        }
      });

      if (error) {
        toast.error(`Failed to re-extract ${FIELD_DISPLAY_NAMES[fieldName] || fieldName}`);
        console.error('Retry extraction error:', error);
        return;
      }

      if (data?.extractedData) {
        const newData = data.extractedData;
        let updated = false;
        
        // Map the response to the correct field
        if (fieldName === 'cocNumber' && newData.cocNumber) {
          setEditedData(prev => ({ ...prev, cocNumber: newData.cocNumber }));
          updated = true;
        }
        if (fieldName === 'cocIssueDate' && newData.cocIssueDate) {
          setEditedData(prev => ({ 
            ...prev, 
            cocIssueDate: newData.cocIssueDate,
            testReport: { ...prev.testReport, issueDate: newData.cocIssueDate }
          }));
          updated = true;
        }
        if (fieldName === 'physicalAddress' && newData.physicalAddress) {
          setEditedData(prev => ({
            ...prev,
            administrativeDetails: { ...prev.administrativeDetails, physicalAddress: newData.physicalAddress }
          }));
          updated = true;
        }
        if (fieldName === 'registeredPerson' && newData.registeredPerson) {
          setEditedData(prev => ({
            ...prev,
            administrativeDetails: { ...prev.administrativeDetails, registeredPerson: newData.registeredPerson }
          }));
          updated = true;
        }
        if (fieldName === 'registrationNumber' && newData.registrationNumber) {
          setEditedData(prev => ({
            ...prev,
            administrativeDetails: { ...prev.administrativeDetails, registrationNumber: newData.registrationNumber }
          }));
          updated = true;
        }

        if (updated) {
          toast.success(`${FIELD_DISPLAY_NAMES[fieldName] || fieldName} extracted successfully!`);
        } else {
          toast.warning(`Could not find ${FIELD_DISPLAY_NAMES[fieldName] || fieldName} in document`);
        }
      }
    } catch (err) {
      console.error('Field retry error:', err);
      toast.error('Failed to re-extract field');
    } finally {
      setRetryingFields(prev => prev.filter(f => f !== fieldName));
    }
  };

  // Re-extract all missing fields
  const handleRetryAllMissing = async () => {
    const missing = getMissingFields();
    if (missing.length === 0) {
      toast.info('All required fields are already filled');
      return;
    }

    setIsRetryingAll(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('extract-coc', {
        body: { 
          documentUrl, 
          fileName: documentName,
          retryFields: missing.map(f => FIELD_DISPLAY_NAMES[f] || f)
        }
      });

      if (error) {
        toast.error('Failed to re-extract missing fields');
        console.error('Retry all error:', error);
        return;
      }

      if (data?.extractedData) {
        const newData = data.extractedData;
        let updatedCount = 0;
        
        setEditedData(prev => {
          const updated = { ...prev };
          
          if (missing.includes('cocNumber') && (newData.cocNumber || newData['COC Number'])) {
            updated.cocNumber = newData.cocNumber || newData['COC Number'];
            updatedCount++;
          }
          if (missing.includes('cocType') && (newData.cocType || newData['COC Type'])) {
            updated.cocType = newData.cocType || newData['COC Type'];
            updatedCount++;
          }
          if (missing.includes('cocIssueDate') && (newData.cocIssueDate || newData['Issue Date'])) {
            const issueDate = newData.cocIssueDate || newData['Issue Date'];
            updated.cocIssueDate = issueDate;
            updated.testReport = { ...updated.testReport, issueDate };
            updatedCount++;
          }
          if (missing.includes('physicalAddress') && (newData.physicalAddress || newData['Physical Address'])) {
            updated.administrativeDetails = { ...updated.administrativeDetails, physicalAddress: newData.physicalAddress || newData['Physical Address'] };
            updatedCount++;
          }
          if (missing.includes('registeredPerson') && (newData.registeredPerson || newData['Registered Person'])) {
            updated.administrativeDetails = { ...updated.administrativeDetails, registeredPerson: newData.registeredPerson || newData['Registered Person'] };
            updatedCount++;
          }
          if (missing.includes('registrationNumber') && (newData.registrationNumber || newData['Registration Number'])) {
            updated.administrativeDetails = { ...updated.administrativeDetails, registrationNumber: newData.registrationNumber || newData['Registration Number'] };
            updatedCount++;
          }
          // Handle conditional fields for Supplementary/Temporary COCs - check both internal and display names
          if (missing.includes('initialCertificateNo')) {
            const initialCertRef = newData.initialCertificateNo || newData['Initial COC Reference'] || newData.supplementDetails?.initialCertificateNo;
            if (initialCertRef) {
              updated.supplementDetails = { 
                ...updated.supplementDetails, 
                initialCertificateNo: initialCertRef
              };
              updatedCount++;
            }
          }
          if (missing.includes('expiryDate')) {
            const expiryDate = newData.expiryDate || newData['Expiry Date'] || newData.temporaryDetails?.expiryDate;
            if (expiryDate) {
              updated.temporaryDetails = { 
                ...updated.temporaryDetails, 
                expiryDate: expiryDate
              };
              updatedCount++;
            }
          }
          
          return updated;
        });

        if (updatedCount > 0) {
          toast.success(`Extracted ${updatedCount} of ${missing.length} missing fields`);
        } else {
          toast.warning('Could not extract any additional fields. Please fill manually.');
        }
      }
    } catch (err) {
      console.error('Retry all error:', err);
      toast.error('Failed to re-extract fields');
    } finally {
      setIsRetryingAll(false);
    }
  };

  // Render a re-extract button for a field
  const renderRetryButton = (fieldName: string, isEmpty: boolean) => {
    if (!isEmpty) return null;
    
    const isRetrying = retryingFields.includes(fieldName);
    
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs gap-1"
        onClick={() => handleRetryField(fieldName)}
        disabled={isRetrying || isProcessing}
        title={`Re-extract ${FIELD_DISPLAY_NAMES[fieldName] || fieldName} using AI`}
      >
        {isRetrying ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        {isRetrying ? 'Extracting...' : 'Re-extract'}
      </Button>
    );
  };

  // Validation: Check if minimum required fields are filled
  // Note: "Initial COC Reference" is NOT a blocking field - verification will catch it
  const validateCompleteness = (): { isComplete: boolean; missingFields: string[]; warnings: string[] } => {
    const missing: string[] = [];
    const warnings: string[] = [];
    
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
    
    // WARNING ONLY: Supplementary/Temporary should have Initial COC Reference (verification will fail without it)
    if (editedData.cocType === 'Supplementary' || editedData.cocType === 'Temporary') {
      if (!editedData.supplementDetails?.initialCertificateNo?.trim()) {
        warnings.push("Initial COC Reference (verification may fail for " + editedData.cocType + ")");
      }
    }
    
    // WARNING ONLY: Temporary should have Expiry Date (verification will flag this)
    if (editedData.cocType === 'Temporary') {
      if (!editedData.temporaryDetails?.expiryDate?.trim()) {
        warnings.push("Expiry Date (verification may fail for Temporary)");
      }
    }
    
    return {
      isComplete: missing.length === 0,
      missingFields: missing,
      warnings
    };
  };

  const { isComplete, missingFields, warnings } = validateCompleteness();

  const handleApprove = () => {
    onApprove(editedData);
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPdfLoadError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error);
    setPdfLoadError('Failed to load PDF. The document may be inaccessible or corrupted.');
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
                    onLoadError={onDocumentLoadError}
                    loading={
                      <div className="flex items-center justify-center h-full">
                        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    }
                    error={
                      <div className="flex flex-col items-center justify-center h-full p-4">
                        <XCircle className="h-12 w-12 text-destructive mb-2" />
                        <p className="text-sm text-destructive text-center">
                          {pdfLoadError || 'Failed to load PDF document'}
                        </p>
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
                  <div className="space-y-2">
                    <p className="font-semibold">Please complete the following required fields:</p>
                    <ul className="list-disc list-inside text-sm">
                      {missingFields.map((field, idx) => (
                        <li key={idx}>{field}</li>
                      ))}
                    </ul>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 gap-2"
                      onClick={handleRetryAllMissing}
                      disabled={isRetryingAll || isProcessing}
                    >
                      {isRetryingAll ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      {isRetryingAll ? 'Re-extracting...' : 'Re-extract All Missing Fields'}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {hasExtractedData && warnings.length > 0 && (
              <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <div className="space-y-2">
                    <p className="font-semibold">Optional fields missing (verification may flag issues):</p>
                    <ul className="list-disc list-inside text-sm">
                      {warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                    <p className="text-xs mt-1">You can proceed, but verification will check these fields.</p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {hasExtractedData && isComplete && warnings.length === 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  All required fields complete. Review and approve to verify.
                </AlertDescription>
              </Alert>
            )}

            {hasExtractedData && isComplete && warnings.length > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Required fields complete. You can approve now - verification will check optional fields.
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
                      {renderRetryButton('cocNumber', !editedData.cocNumber?.trim())}
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
                    <Select
                      value={editedData.cocType || ''}
                      onValueChange={(value) => setEditedData({ ...editedData, cocType: value })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select certificate type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Initial">
                          <div className="flex items-center gap-2">
                            <FileCheck className="h-4 w-4 text-green-600" />
                            Initial Certificate
                          </div>
                        </SelectItem>
                        <SelectItem value="Supplementary">
                          <div className="flex items-center gap-2">
                            <FilePlus className="h-4 w-4 text-blue-600" />
                            Supplementary Certificate
                          </div>
                        </SelectItem>
                        <SelectItem value="Temporary">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-amber-600" />
                            Temporary Certificate
                          </div>
                        </SelectItem>
                        <SelectItem value="Unknown">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            Unknown (Not marked on document)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {editedData.cocType && (
                      <div className="mt-1">
                        {editedData.cocType === 'Initial' && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            <FileCheck className="h-3 w-3 mr-1" />
                            Initial - Original installation COC
                          </Badge>
                        )}
                        {editedData.cocType === 'Supplementary' && (
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            <FilePlus className="h-3 w-3 mr-1" />
                            Supplementary - Requires Initial COC Reference
                          </Badge>
                        )}
                        {editedData.cocType === 'Temporary' && (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            <Clock className="h-3 w-3 mr-1" />
                            Temporary - Time-limited, requires Initial COC
                          </Badge>
                        )}
                        {editedData.cocType === 'Unknown' && (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Unknown - COC type not marked, will FAIL validation
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      Issue Date <span className="text-destructive">*</span>
                      {renderRetryButton('cocIssueDate', !editedData.cocIssueDate?.trim() && !editedData.testReport?.issueDate?.trim())}
                      {extractedData?.confidence === 'low' && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Please verify
                        </Badge>
                      )}
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
                    
                    {/* Show all dates found for manual selection if extraction found multiple */}
                    {extractedData?.allDatesFound && extractedData.allDatesFound.length > 1 && (
                      <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded text-xs">
                        <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                          Multiple dates found in document. Select the correct COC issue date:
                        </p>
                        <div className="space-y-1">
                          {extractedData.allDatesFound.map((d, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setEditedData({
                                ...editedData,
                                cocIssueDate: d.convertedDate,
                                testReport: {
                                  ...editedData.testReport,
                                  issueDate: d.convertedDate
                                }
                              })}
                              className={`w-full text-left px-2 py-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 flex justify-between items-center ${
                                editedData.cocIssueDate === d.convertedDate ? 'bg-amber-200 dark:bg-amber-800' : ''
                              }`}
                            >
                              <span className="font-mono">{d.rawDate} → {d.convertedDate}</span>
                              <span className="text-muted-foreground truncate ml-2">{d.location}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Supplementary/Temporary Details - Show when applicable */}
                  {(editedData.cocType === 'Supplementary' || editedData.cocType === 'Temporary') && (
                    <div className="col-span-2 border-t pt-3 mt-2 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {editedData.cocType === 'Supplementary' ? (
                          <FilePlus className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Clock className="h-4 w-4 text-amber-600" />
                        )}
                        {editedData.cocType === 'Supplementary' ? 'Supplementary Certificate Details' : 'Temporary Certificate Details'}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold flex items-center gap-1">
                            Initial COC Reference <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            value={editedData.supplementDetails?.initialCertificateNo || ''}
                            onChange={(e) => setEditedData({
                              ...editedData,
                              supplementDetails: {
                                ...editedData.supplementDetails,
                                initialCertificateNo: e.target.value
                              }
                            })}
                            className="h-9 font-mono"
                            placeholder="Original COC number"
                          />
                          <p className="text-xs text-muted-foreground">
                            The original Initial COC this certificate references
                          </p>
                        </div>
                        
                        {editedData.cocType === 'Supplementary' && (
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                              Supplement Number
                            </Label>
                            <Input
                              value={editedData.supplementDetails?.supplementNo || ''}
                              onChange={(e) => setEditedData({
                                ...editedData,
                                supplementDetails: {
                                  ...editedData.supplementDetails,
                                  supplementNo: e.target.value
                                }
                              })}
                              className="h-9"
                              placeholder="e.g., 1, 2, 3"
                            />
                          </div>
                        )}
                        
                        {editedData.cocType === 'Temporary' && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold flex items-center gap-1">
                                Expiry Date <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                type="date"
                                value={editedData.temporaryDetails?.expiryDate || ''}
                                onChange={(e) => setEditedData({
                                  ...editedData,
                                  temporaryDetails: {
                                    ...editedData.temporaryDetails,
                                    expiryDate: e.target.value
                                  }
                                })}
                                className="h-9"
                              />
                            </div>
                            <div className="space-y-1 col-span-2">
                              <Label className="text-xs font-semibold">
                                Reason for Temporary
                              </Label>
                              <Input
                                value={editedData.temporaryDetails?.reason || ''}
                                onChange={(e) => setEditedData({
                                  ...editedData,
                                  temporaryDetails: {
                                    ...editedData.temporaryDetails,
                                    reason: e.target.value
                                  }
                                })}
                                className="h-9"
                                placeholder="Why was a temporary certificate issued?"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
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
                      {renderRetryButton('physicalAddress', !editedData.administrativeDetails?.physicalAddress?.trim())}
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
                      {renderRetryButton('registeredPerson', !editedData.administrativeDetails?.registeredPerson?.trim())}
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
                      {renderRetryButton('registrationNumber', !editedData.administrativeDetails?.registrationNumber?.trim())}
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

              {/* Test Report Header */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Test Report Header (Page 2)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Test Report For</Label>
                    <Input
                      value={editedData.testReport?.testReportFor || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        testReport: {
                          ...editedData.testReport,
                          testReportFor: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="DB/Supply description"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Additional Pages Added</Label>
                    <Input
                      value={editedData.testReport?.additionalPages || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        testReport: {
                          ...editedData.testReport,
                          additionalPages: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="Yes/No"
                    />
                  </div>
                </div>
              </div>

              {/* Section 1 - Location */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Section 1 - Location (Page 2)
                </h3>
                <p className="text-xs text-muted-foreground">Only required if not provided on Certificate of Compliance</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Physical Address</Label>
                    <Input
                      value={editedData.testReportLocation?.physicalAddress || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        testReportLocation: {
                          ...editedData.testReportLocation,
                          physicalAddress: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="14 Voortrekker Street"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Name of Building (include shop/unit number)</Label>
                    <Input
                      value={editedData.testReportLocation?.buildingName || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        testReportLocation: {
                          ...editedData.testReportLocation,
                          buildingName: e.target.value
                        }
                      })}
                      className="h-9"
                      placeholder="Shop 8 Seqonyane"
                    />
                  </div>
                </div>
              </div>

              {/* Installation Details */}
              <div className="border-2 rounded p-4 space-y-3 bg-muted/20">
                <h3 className="font-bold text-sm uppercase tracking-wide border-b pb-2">
                  Section 2 - Installation Details
                </h3>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Type of electricity supply system</Label>
                  <Input
                    value={editedData.installationDetails?.electricitySupplySystem || ''}
                    onChange={(e) => setEditedData({
                      ...editedData,
                      installationDetails: {
                        ...editedData.installationDetails,
                        electricitySupplySystem: e.target.value
                      }
                    })}
                    className="h-8 text-sm"
                    placeholder="TN-S / TN-C-S / TN-C / TT / IT"
                  />
                </div>
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
                  <h4 className="text-xs font-semibold mb-2">Additional Installation Questions</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Is surge protection installed?</Label>
                      <Input
                        value={editedData.installationDetails?.surgeProtectionInstalled || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          installationDetails: {
                            ...editedData.installationDetails,
                            surgeProtectionInstalled: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Is lightning protection installed?</Label>
                      <Input
                        value={editedData.installationDetails?.lightningProtectionInstalled || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          installationDetails: {
                            ...editedData.installationDetails,
                            lightningProtectionInstalled: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Is alternative power supply installed?</Label>
                      <Input
                        value={editedData.installationDetails?.alternativePowerSupply || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          installationDetails: {
                            ...editedData.installationDetails,
                            alternativePowerSupply: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Specialized electrical installation?</Label>
                      <Input
                        value={editedData.installationDetails?.specializedInstallation || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          installationDetails: {
                            ...editedData.installationDetails,
                            specializedInstallation: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Installation at voltage above 1 kV?</Label>
                      <Input
                        value={editedData.installationDetails?.voltageAbove1kV || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          installationDetails: {
                            ...editedData.installationDetails,
                            voltageAbove1kV: e.target.value
                          }
                        })}
                        className="h-8 text-sm"
                        placeholder="Yes/No"
                      />
                    </div>
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
                  Section 4 - Inspection (Mark as appropriate)
                </h3>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">1. Conductors are of the correct rating and current-carrying capacity for the protective devices and connected load</Label>
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
                    <Label className="text-xs font-medium">2. Components have been correctly selected and installed</Label>
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
                    <Label className="text-xs font-medium">3. Disconnecting devices are correctly located and all switchgear switches the phase conductors</Label>
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
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">4. Circuits, fuses, switches, terminals, earth leakage units, circuit-breakers, distribution boards are correctly and permanently marked or labelled</Label>
                    <Input
                      value={editedData.inspectionChecks?.markingAndLabelling || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        inspectionChecks: {
                          ...editedData.inspectionChecks,
                          markingAndLabelling: e.target.value
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
                  Section 4 - Tests
                </h3>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">1. Continuity of bonding</Label>
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
                    <Label className="text-xs font-medium">2. Resistance of earth continuity conductor at all points of consumption</Label>
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
                    <Label className="text-xs font-medium">3. Continuity of ring circuits (if applicable)</Label>
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
                    <Label className="text-xs font-medium">4. Earth loop impedance test: at main or local switch (Ω)</Label>
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
                      placeholder="0.16"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">5. Neutral loop impedance test: at main or local switch (Ω)</Label>
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
                      placeholder="0.16"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">6. Prospective short-circuit current at main or local switch (PSCC) - kA</Label>
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
                      placeholder="1.44 kA Calculated/Measured"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">7. Elevated voltage between incoming neutral and external earth (ground) - V</Label>
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
                    <Label className="text-xs font-medium">8. Insulation resistance - MΩ</Label>
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
                      placeholder="∞ or >∞"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">9. Voltage at distribution board with no load for each phase to neutral - V</Label>
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
                      placeholder="237, 237, 237"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">10. Voltage at distribution board with load (as calculated for full load) for each phase to neutral - V</Label>
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
                      placeholder="240, 240, 237"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">11. Value of operation of earth leakage units - mA</Label>
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
                      placeholder="N/A or value"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">12. Operation of earth leakage test button</Label>
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
                    <Label className="text-xs font-medium">13. Polarity of points of consumption</Label>
                    <Input
                      value={editedData.testResults?.polarityOfPoints || ''}
                      onChange={(e) => setEditedData({
                        ...editedData,
                        testResults: {
                          ...editedData.testResults,
                          polarityOfPoints: e.target.value
                        }
                      })}
                      className="h-8 text-sm"
                      placeholder="correct"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">14. Phase rotation is consistent at points all of consumption for three-phase systems</Label>
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
                    <Label className="text-xs font-medium">15. All switching devices, make-and-break circuits</Label>
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
