import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface ValidationReport {
  cocNumber?: string;
  cocType?: string;
  evaluationDate?: string;
  overallStatus: string;
  installationSummary?: string;
  overallAssessment?: string;
  criticalFailures?: Array<{
    category: string;
    clause: string;
    description: string;
    reason: string;
  }>;
  administrativeDetails?: {
    physicalAddress?: string;
    erfNumber?: string;
    registeredPerson?: string;
    idNumber?: string;
    registrationNumber?: string;
    registrationType?: string;
    registrationDate?: string;
  };
  technicalEvaluation?: Array<{
    section: string;
    clause: string;
    requirement: string;
    finding: string;
    status: string;
    notes?: string;
  }>;
  recommendations?: string[];
  // Legacy format support
  status?: string;
  violations?: Array<{
    clause: string;
    description: string;
    evidence: string;
  }>;
  summary?: string;
}

interface COCValidationReportProps {
  validation: {
    status: string;
    validated_at: string;
    validated_by?: string;
    report_data?: ValidationReport;
  };
}

export function COCValidationReport({ validation }: COCValidationReportProps) {
  const report = (validation.report_data || {}) as ValidationReport;
  const status = report.overallStatus || report.status || validation.status;
  
  // Legacy format handling
  const isLegacyFormat = !report.overallStatus && report.violations;

  const getStatusIcon = () => {
    switch (status?.toLowerCase()) {
      case 'pass':
        return <CheckCircle2 className="h-8 w-8 text-green-600" />;
      case 'fail':
        return <XCircle className="h-8 w-8 text-red-600" />;
      case 'incomplete':
        return <AlertTriangle className="h-8 w-8 text-yellow-600" />;
      default:
        return <AlertTriangle className="h-8 w-8 text-gray-600" />;
    }
  };

  const getStatusColor = () => {
    switch (status?.toLowerCase()) {
      case 'pass':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'fail':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'incomplete':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl font-bold">
                Electrical COC Evaluation Report
              </CardTitle>
              {report.cocNumber && (
                <p className="text-muted-foreground mt-2">
                  COC Number: {report.cocNumber}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {getStatusIcon()}
              <Badge className={getStatusColor()}>
                {status?.toUpperCase()}
              </Badge>
            </div>
          </div>
          {report.evaluationDate && (
            <p className="text-sm text-muted-foreground mt-2">
              Date of Evaluation: {new Date(report.evaluationDate).toLocaleDateString()}
            </p>
          )}
        </CardHeader>
      </Card>

      {/* Executive Summary */}
      {(report.installationSummary || report.overallAssessment || isLegacyFormat) && (
        <Card>
          <CardHeader>
            <CardTitle>Executive Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.cocType && (
              <div>
                <span className="font-semibold">COC Type:</span> {report.cocType}
              </div>
            )}
            
            {report.installationSummary && (
              <div>
                <h4 className="font-semibold mb-2">Installation Summary:</h4>
                <p className="text-muted-foreground">{report.installationSummary}</p>
              </div>
            )}
            
            {report.overallAssessment && (
              <div>
                <h4 className="font-semibold mb-2">Overall Assessment:</h4>
                <p className="text-muted-foreground">{report.overallAssessment}</p>
              </div>
            )}

            {isLegacyFormat && report.summary && (
              <div>
                <h4 className="font-semibold mb-2">Summary:</h4>
                <p className="text-muted-foreground">{report.summary}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Critical Failures */}
      {((report.criticalFailures && report.criticalFailures.length > 0) || 
        (isLegacyFormat && report.violations && report.violations.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">
              Summary of Critical Failures ({report.criticalFailures?.length || report.violations?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.criticalFailures?.map((failure, idx) => (
                <Alert key={idx} variant="destructive">
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="shrink-0">
                          {failure.category}
                        </Badge>
                        <div className="flex-1">
                          <p className="font-semibold">{failure.clause}</p>
                          <p className="text-sm mt-1">{failure.description}</p>
                        </div>
                      </div>
                      <div className="pl-0 mt-2">
                        <span className="font-semibold text-sm">Reason: </span>
                        <span className="text-sm">{failure.reason}</span>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
              
              {isLegacyFormat && report.violations?.map((violation, idx) => (
                <Alert key={idx} variant="destructive">
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">Clause {violation.clause}</p>
                      <p className="text-sm">{violation.description}</p>
                      <div className="mt-2">
                        <span className="font-semibold text-sm">Evidence: </span>
                        <span className="text-sm">{violation.evidence}</span>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Administrative Details */}
      {report.administrativeDetails && (
        <Card>
          <CardHeader>
            <CardTitle>Administrative Completeness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.administrativeDetails.physicalAddress && (
                <div>
                  <span className="font-semibold">Physical Address:</span>
                  <p className="text-muted-foreground">{report.administrativeDetails.physicalAddress}</p>
                </div>
              )}
              {report.administrativeDetails.erfNumber && (
                <div>
                  <span className="font-semibold">Erf / Lot No.:</span>
                  <p className="text-muted-foreground">{report.administrativeDetails.erfNumber}</p>
                </div>
              )}
              {report.administrativeDetails.registeredPerson && (
                <div>
                  <span className="font-semibold">Registered Person Name:</span>
                  <p className="text-muted-foreground">{report.administrativeDetails.registeredPerson}</p>
                </div>
              )}
              {report.administrativeDetails.idNumber && (
                <div>
                  <span className="font-semibold">ID Number:</span>
                  <p className="text-muted-foreground">{report.administrativeDetails.idNumber}</p>
                </div>
              )}
              {report.administrativeDetails.registrationNumber && (
                <div>
                  <span className="font-semibold">Registration Number:</span>
                  <p className="text-muted-foreground">{report.administrativeDetails.registrationNumber}</p>
                </div>
              )}
              {report.administrativeDetails.registrationType && (
                <div>
                  <span className="font-semibold">Type of Registration:</span>
                  <p className="text-muted-foreground">{report.administrativeDetails.registrationType}</p>
                </div>
              )}
              {report.administrativeDetails.registrationDate && (
                <div>
                  <span className="font-semibold">Date of Registration:</span>
                  <p className="text-muted-foreground">{report.administrativeDetails.registrationDate}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Technical Evaluation */}
      {report.technicalEvaluation && report.technicalEvaluation.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Technical Evaluation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.technicalEvaluation.map((item, idx) => (
                <div key={idx}>
                  {idx > 0 && <Separator className="my-4" />}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold">{item.section}</h4>
                        <p className="text-sm text-muted-foreground">Clause {item.clause}</p>
                      </div>
                      <Badge
                        variant={
                          item.status === 'Pass' ? 'default' :
                          item.status === 'Fail' ? 'destructive' :
                          'secondary'
                        }
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-semibold text-sm">Requirement: </span>
                      <span className="text-sm text-muted-foreground">{item.requirement}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-sm">Finding: </span>
                      <span className="text-sm text-muted-foreground">{item.finding}</span>
                    </div>
                    {item.notes && (
                      <div>
                        <span className="font-semibold text-sm">Notes: </span>
                        <span className="text-sm text-muted-foreground">{item.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {report.recommendations && report.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2">
              {report.recommendations.map((rec, idx) => (
                <li key={idx} className="text-muted-foreground">{rec}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Validation Metadata */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Validated on: {new Date(validation.validated_at).toLocaleString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}