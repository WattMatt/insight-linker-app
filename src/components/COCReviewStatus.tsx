import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Eye, 
  RefreshCw, 
  FileText, 
  Calendar,
  User,
  AlertTriangle,
  History,
  Sparkles
} from "lucide-react";
import { format } from "date-fns";

interface ExtractionData {
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  administrativeDetails?: {
    physicalAddress?: string;
    registeredPerson?: string;
    registrationNumber?: string;
  };
  testReport?: {
    issueDate?: string;
  };
  confidence?: 'high' | 'medium' | 'low';
}

interface ValidationData {
  id: string;
  status: string;
  validated_at: string;
  violations?: any[];
  report_data?: any;
}

interface COCReviewStatusProps {
  documentId: string;
  documentName: string;
  extraction: {
    id: string;
    extracted_data: ExtractionData;
    confidence?: string;
    extraction_method?: string;
    extracted_at: string;
    extracted_by?: string;
  } | null;
  validation: ValidationData | null;
  onViewFullReport: () => void;
  onReExtract: () => void;
  onReValidate: () => void;
  onEditExtraction: () => void;
  onViewHistory?: () => void;
  isReExtracting?: boolean;
  isReValidating?: boolean;
}

export function COCReviewStatus({
  documentId,
  documentName,
  extraction,
  validation,
  onViewFullReport,
  onReExtract,
  onReValidate,
  onEditExtraction,
  onViewHistory,
  isReExtracting = false,
  isReValidating = false
}: COCReviewStatusProps) {
  const hasExtraction = !!extraction;
  const hasValidation = !!validation;
  const extractedData = extraction?.extracted_data;

  const getConfidenceBadge = (confidence?: string) => {
    switch (confidence) {
      case 'high':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-300">High Confidence</Badge>;
      case 'medium':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-300">Medium Confidence</Badge>;
      case 'low':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-300">Low Confidence</Badge>;
      default:
        return null;
    }
  };

  const getValidationStatusBadge = () => {
    if (!validation) return null;
    
    switch (validation.status) {
      case 'Pass':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Validated - Pass
          </Badge>
        );
      case 'Fail':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Validated - Fail
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {validation.status}
          </Badge>
        );
    }
  };

  // Not yet extracted
  if (!hasExtraction) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6">
          <div className="text-center">
            <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-1">Not Yet Extracted</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This COC document hasn't been extracted and validated yet.
            </p>
            <Button onClick={onReExtract} disabled={isReExtracting}>
              {isReExtracting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Extract & Validate COC
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Has extraction - show summary
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            COC Review Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            {getConfidenceBadge(extraction.confidence)}
            {getValidationStatusBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Extracted Data Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-muted/50 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">COC Number</p>
            <p className="font-medium text-sm">{extractedData?.cocNumber || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Type</p>
            <p className="font-medium text-sm">{extractedData?.cocType || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Issue Date</p>
            <p className="font-medium text-sm">
              {extractedData?.cocIssueDate || extractedData?.testReport?.issueDate || '-'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Registered Person</p>
            <p className="font-medium text-sm truncate">
              {extractedData?.administrativeDetails?.registeredPerson || '-'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Registration No.</p>
            <p className="font-medium text-sm">
              {extractedData?.administrativeDetails?.registrationNumber || '-'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Physical Address</p>
            <p className="font-medium text-sm truncate" title={extractedData?.administrativeDetails?.physicalAddress}>
              {extractedData?.administrativeDetails?.physicalAddress?.substring(0, 30) || '-'}
              {(extractedData?.administrativeDetails?.physicalAddress?.length || 0) > 30 && '...'}
            </p>
          </div>
        </div>

        {/* Validation Violations Summary */}
        {validation && validation.violations && validation.violations.length > 0 && (
          <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <p className="text-sm font-medium text-destructive">
                {validation.violations.length} SANS 10142-1 Violation(s)
              </p>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              {validation.violations.slice(0, 3).map((v: any, i: number) => (
                <li key={i}>• Clause {v.clause}: {v.description}</li>
              ))}
              {validation.violations.length > 3 && (
                <li className="text-destructive">+{validation.violations.length - 3} more violations</li>
              )}
            </ul>
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-3">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Extracted: {extraction.extracted_at ? format(new Date(extraction.extracted_at), 'MMM d, yyyy h:mm a') : 'Unknown'}
          </div>
          {validation && (
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Validated: {format(new Date(validation.validated_at), 'MMM d, yyyy h:mm a')}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {validation && (
            <Button size="sm" variant="default" onClick={onViewFullReport}>
              <Eye className="h-4 w-4 mr-1" />
              View Full Report
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onEditExtraction}>
            <FileText className="h-4 w-4 mr-1" />
            Edit Extraction
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={onReExtract}
            disabled={isReExtracting}
          >
            {isReExtracting ? (
              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            Re-extract
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={onReValidate}
            disabled={isReValidating || !hasExtraction}
          >
            {isReValidating ? (
              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-1" />
            )}
            Re-validate
          </Button>
          {onViewHistory && (
            <Button size="sm" variant="ghost" onClick={onViewHistory}>
              <History className="h-4 w-4 mr-1" />
              History
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
