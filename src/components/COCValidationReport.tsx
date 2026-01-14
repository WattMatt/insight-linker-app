import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Eye } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import {
  generatePdfBlob,
  buildDocument,
  createCoverPage,
  createSectionHeader,
  createInfoTable,
  createDataTable,
  createStatusBadge,
  getStatusType,
  logComplianceCheck,
  COLORS,
  PDFComplianceCheck,
} from "@/lib/pdfMakeUtils";

interface ValidationReport {
  cocNumber?: string;
  cocType?: string;
  evaluationDate?: string;
  overallStatus: string;
  installationSummary?: string;
  overallAssessment?: string;
  checks?: Array<{
    checkId: string;
    clause: string;
    description: string;
    result: string;
    measuredValue: string;
    limit: string;
    remediation: string;
    category: string;
    timestamp: string;
  }>;
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
    subsection_id: string;
    document_id?: string;
  };
  subsectionName?: string;
}

export function COCValidationReport({ validation, subsectionName }: COCValidationReportProps) {
  const report = (validation.report_data || {}) as ValidationReport;
  const status = report.overallStatus || report.status || validation.status;
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  
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

  const generatePDF = async (): Promise<{ blob: Blob; fileName: string; complianceChecks: PDFComplianceCheck }> => {
    const content: any[] = [];

    // ===== EXECUTIVE SUMMARY PAGE =====
    content.push(createSectionHeader('Validation Status', 'primary'));
    
    // Status display
    content.push({
      columns: [
        {
          text: (status || 'UNKNOWN').toUpperCase(),
          fontSize: 24,
          bold: true,
          color: status?.toLowerCase() === 'pass' ? COLORS.success :
                 status?.toLowerCase() === 'fail' ? COLORS.error :
                 status?.toLowerCase() === 'incomplete' ? COLORS.warning : COLORS.textMuted,
        },
        createStatusBadge(status || 'Unknown', getStatusType(status || '')),
      ],
      margin: [0, 0, 0, 15],
    });

    // COC Type
    if (report.cocType) {
      content.push({
        columns: [
          { text: 'COC Type:', bold: true, width: 80 },
          { text: report.cocType },
        ],
        margin: [0, 0, 0, 10],
      });
    }

    // Installation Summary
    if (report.installationSummary) {
      content.push(createSectionHeader('Installation Summary'));
      content.push({
        text: report.installationSummary,
        fontSize: 10,
        color: COLORS.textSecondary,
        margin: [0, 0, 0, 15],
      });
    }

    // Overall Assessment
    if (report.overallAssessment) {
      content.push(createSectionHeader('Overall Assessment'));
      content.push({
        text: report.overallAssessment,
        fontSize: 10,
        color: COLORS.textSecondary,
        margin: [0, 0, 0, 15],
      });
    }

    // ===== CRITICAL FAILURES =====
    const failures = report.criticalFailures || report.violations || [];
    if (failures.length > 0) {
      content.push({ text: '', pageBreak: 'before' });
      content.push(createSectionHeader(`Critical Failures (${failures.length})`, 'primary'));

      failures.forEach((failure: any, index: number) => {
        content.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                {
                  text: `${index + 1}. ${failure.clause || 'Clause ' + (index + 1)}`,
                  bold: true,
                  fontSize: 11,
                  color: COLORS.error,
                },
                {
                  text: failure.description,
                  fontSize: 10,
                  margin: [0, 5, 0, 5],
                },
                {
                  columns: [
                    { text: 'Reason:', bold: true, width: 50, fontSize: 9 },
                    { text: failure.reason || failure.evidence || 'Not specified', fontSize: 9 },
                  ],
                },
              ],
            }]],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0,
            hLineColor: () => COLORS.error,
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 8,
            paddingBottom: () => 8,
            fillColor: () => '#fef2f2', // Light red background
          },
          margin: [0, 0, 0, 10],
        });
      });
    }

    // ===== ADMINISTRATIVE DETAILS =====
    if (report.administrativeDetails) {
      content.push({ text: '', pageBreak: 'before' });
      content.push(createSectionHeader('Administrative Completeness', 'primary'));

      const details = report.administrativeDetails;
      const adminData: [string, string][] = [
        ['Physical Address', details.physicalAddress || 'Not Found'],
        ['Erf / Lot No.', details.erfNumber || 'Not Found'],
        ['Registered Person', details.registeredPerson || 'Not Found'],
        ['Registration Number', details.registrationNumber || 'Not Found'],
        ['Type of Registration', details.registrationType || 'Not Found'],
        ['Date of Registration', details.registrationDate || 'Not Found'],
      ].filter(([_, value]) => {
        const lowerValue = value.toLowerCase();
        return !lowerValue.includes('not found') &&
               !lowerValue.includes('not provided') &&
               !lowerValue.includes('n/a') &&
               value.trim().length > 0;
      }) as [string, string][];

      if (adminData.length > 0) {
        content.push(createInfoTable(adminData));
      }
    }

    // ===== TECHNICAL EVALUATION =====
    if (report.technicalEvaluation && report.technicalEvaluation.length > 0) {
      content.push({ text: '', pageBreak: 'before' });
      content.push(createSectionHeader('Technical Evaluation', 'primary'));

      content.push(createDataTable(
        [
          { header: 'Section', field: 'section', width: 80 },
          { header: 'Requirement', field: 'requirement', width: '*' },
          { header: 'Finding', field: 'finding', width: '*' },
          { header: 'Status', field: 'status', width: 60, alignment: 'center' },
        ],
        report.technicalEvaluation.map(item => ({
          section: `${item.section}\nClause ${item.clause}`,
          requirement: item.requirement,
          finding: item.finding,
          status: item.status,
        }))
      ));
    }

    // ===== RECOMMENDATIONS =====
    if (report.recommendations && report.recommendations.length > 0) {
      content.push({ text: '', pageBreak: 'before' });
      content.push(createSectionHeader('Recommendations', 'primary'));

      content.push({
        ol: report.recommendations.map(rec => ({
          text: rec,
          fontSize: 10,
          margin: [0, 0, 0, 5],
        })),
        margin: [0, 0, 0, 15],
      });
    }

    // Build document with cover page
    const docDefinition = buildDocument({
      title: 'Electrical COC Evaluation Report',
      coverPage: {
        title: 'Electrical COC Evaluation Report',
        subtitle: report.cocType || 'SANS 10142-1 Compliance Validation',
        siteName: report.cocNumber || 'Unknown',
        reportType: 'COC Validation',
        organizationName: 'Watson Mattheus Electrical Compliance',
        reportDate: new Date(report.evaluationDate || validation.validated_at),
        referenceNumber: report.cocNumber,
      },
      content,
    });

    // Generate blob
    const blob = await generatePdfBlob(docDefinition);

    // Log compliance
    const complianceChecks = logComplianceCheck('COCValidationReport', {
      hasCoverPage: true,
      logoPlacement: false,
      standardMargins: true,
      typographyScale: true,
      brandColors: true,
      pageHeaders: true,
      pageFooters: true,
      tableStyles: true,
      pageBreaks: true,
    });

    const fileName = `COC_Validation_Report_${report.cocNumber || 'Unknown'}_${new Date().toISOString().split('T')[0]}.pdf`;

    return { blob, fileName, complianceChecks };
  };

  const handlePreviewReport = async () => {
    try {
      setGenerating(true);
      const result = await generatePDF();

      const url = URL.createObjectURL(result.blob);
      setPreviewUrl(url);
      setPreviewFileName(result.fileName);
      setPdfBlob(result.blob);
      setPreviewOpen(true);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!pdfBlob || !validation.subsection_id) {
      toast.error("Cannot save: missing data");
      return;
    }

    try {
      setSaving(true);
      const result = await savePDFToDocuments({
        blob: pdfBlob,
        fileName: previewFileName,
        subsectionId: validation.subsection_id,
        categoryName: getReportCategoryName("coc-validation"),
      });

      if (result.success) {
        toast.success("Report saved to documents!");
      } else {
        toast.error(result.error || "Failed to save report");
      }
    } catch (error) {
      console.error("Error saving report:", error);
      toast.error("Failed to save report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header with Preview Button */}
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
              <Button onClick={handlePreviewReport} variant="default" size="sm" disabled={generating}>
                <Eye className="h-4 w-4 mr-2" />
                {generating ? "Generating..." : "Preview & Save Report"}
              </Button>
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

            {/* Legacy Summary */}
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
        <Card className="border-red-200">
          <CardHeader className="bg-red-50">
            <CardTitle className="text-red-800 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Critical Failures ({report.criticalFailures?.length || report.violations?.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {(report.criticalFailures || report.violations || []).map((failure: any, index: number) => (
              <div key={index} className="py-4 first:pt-6 last:pb-2">
                <div className="flex items-start gap-3">
                  <Badge variant="destructive" className="mt-0.5">
                    {failure.clause}
                  </Badge>
                  <div className="flex-1">
                    <p className="font-medium">{failure.description}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">Reason:</span> {failure.reason || failure.evidence}
                    </p>
                    {failure.category && (
                      <Badge variant="outline" className="mt-2">{failure.category}</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
            <div className="grid md:grid-cols-2 gap-4">
              {report.administrativeDetails.physicalAddress && (
                <div>
                  <p className="text-sm text-muted-foreground">Physical Address</p>
                  <p className="font-medium">{report.administrativeDetails.physicalAddress}</p>
                </div>
              )}
              {report.administrativeDetails.registeredPerson && (
                <div>
                  <p className="text-sm text-muted-foreground">Registered Person</p>
                  <p className="font-medium">{report.administrativeDetails.registeredPerson}</p>
                </div>
              )}
              {report.administrativeDetails.registrationNumber && (
                <div>
                  <p className="text-sm text-muted-foreground">Registration Number</p>
                  <p className="font-medium">{report.administrativeDetails.registrationNumber}</p>
                </div>
              )}
              {report.administrativeDetails.registrationType && (
                <div>
                  <p className="text-sm text-muted-foreground">Type of Registration</p>
                  <p className="font-medium">{report.administrativeDetails.registrationType}</p>
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
              {report.technicalEvaluation.map((item, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.section}</Badge>
                      <span className="text-sm text-muted-foreground">Clause {item.clause}</span>
                    </div>
                    <Badge
                      variant={item.status === 'Pass' ? 'default' : item.status === 'Fail' ? 'destructive' : 'secondary'}
                    >
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-sm mb-1"><span className="font-medium">Requirement:</span> {item.requirement}</p>
                  <p className="text-sm"><span className="font-medium">Finding:</span> {item.finding}</p>
                  {item.notes && (
                    <p className="text-sm text-muted-foreground mt-2">{item.notes}</p>
                  )}
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
            <ul className="space-y-2">
              {report.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="font-medium text-primary">{index + 1}.</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Preview Dialog */}
      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open && previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl("");
          }
        }}
        fileUrl={previewUrl}
        fileName={previewFileName}
        onSaveToDocuments={handleSaveToDocuments}
        saveLocation="subsection"
        contextName={subsectionName}
        isSaving={saving}
      />
    </div>
  );
}
