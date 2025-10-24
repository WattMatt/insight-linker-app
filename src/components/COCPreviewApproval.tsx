import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, AlertTriangle, FileText, Edit2, Save, X, RefreshCw } from "lucide-react";
import { useState } from "react";

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
  const [isEditing, setIsEditing] = useState(!extractedData); // Auto-enable editing if no data
  const [editedData, setEditedData] = useState<ExtractedData>(extractedData || {
    cocNumber: '',
    cocIssueDate: '',
    cocType: '',
    administrativeDetails: {},
    installationSummary: '',
    confidence: 'low'
  });

  const handleSaveEdits = () => {
    setIsEditing(false);
  };

  const handleApprove = () => {
    onApprove(editedData);
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
            <Label>Document Preview</Label>
            <div className="border rounded-lg overflow-hidden bg-muted h-[600px]">
              <object
                data={`${documentUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                type="application/pdf"
                className="w-full h-full"
              >
                <embed
                  src={`${documentUrl}#toolbar=0`}
                  type="application/pdf"
                  className="w-full h-full"
                />
              </object>
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

          {/* Installation Summary */}
          {editedData.installationSummary && (
            <>
              <Separator className="my-6" />
              <div className="space-y-2">
                <Label>Installation Summary</Label>
                <div className="p-3 bg-muted rounded-md text-sm">
                  {editedData.installationSummary}
                </div>
              </div>
            </>
          )}
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
