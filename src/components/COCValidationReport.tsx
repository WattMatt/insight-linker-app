import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Eye } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { useState } from "react";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import {
  addCoverPage,
  addStandardHeader,
  addFootersToAllPages,
  addSectionHeader,
  logComplianceCheck,
  getTableOptionsWithSafeMargins,
  RGB_COLORS,
  PAGE,
  SAFE_BOTTOM_MARGIN,
  PDFComplianceCheck,
} from "@/lib/pdfUtils";
import { DOCUMENT_DESIGN_STANDARDS, getContentWidth } from "@/lib/documentDesignStandards";

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

  const generatePDF = (): { doc: jsPDF; fileName: string; blob: Blob } => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = getContentWidth();
    const { margins } = DOCUMENT_DESIGN_STANDARDS;

    // ===== PAGE 1: COVER PAGE using pdfUtils =====
    addCoverPage(doc, {
      title: 'Electrical COC Evaluation Report',
      subtitle: report.cocType || 'SANS 10142-1 Compliance Validation',
      siteName: report.cocNumber || 'Unknown',
      reportType: 'COC Validation',
      organizationName: 'Watson Mattheus Electrical Compliance',
      reportDate: new Date(report.evaluationDate || validation.validated_at),
      referenceNumber: report.cocNumber,
    });

    // Page 2: Executive Summary
    doc.addPage();
    let headerY = addStandardHeader(doc, 'Executive Summary', null);
    let yPosition = headerY + 5;
    
    // Status badge on summary page
    yPosition = addSectionHeader(doc, 'Validation Status', yPosition);
    
    const statusText = status?.toUpperCase() || 'UNKNOWN';
    let statusColorRGB: [number, number, number] = RGB_COLORS.textMuted;
    if (status?.toLowerCase() === 'pass') statusColorRGB = RGB_COLORS.success;
    else if (status?.toLowerCase() === 'fail') statusColorRGB = RGB_COLORS.error;
    else if (status?.toLowerCase() === 'incomplete') statusColorRGB = RGB_COLORS.warning;
    
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...statusColorRGB);
    doc.text(statusText, margins.left, yPosition + 8);
    yPosition += 20;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...RGB_COLORS.textPrimary);
    
    if (report.cocType) {
      doc.setFont('helvetica', 'bold');
      doc.text('COC Type:', margins.left, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(report.cocType, margins.left + 35, yPosition);
      yPosition += 7;
    }
    
    if (report.installationSummary) {
      yPosition += 5;
      yPosition = addSectionHeader(doc, 'Installation Summary', yPosition);
      doc.setFont('helvetica', 'normal');
      const summaryLines = doc.splitTextToSize(report.installationSummary, contentWidth);
      doc.text(summaryLines, margins.left, yPosition);
      yPosition += (summaryLines.length * 5) + 10;
    }
    
    if (report.overallAssessment) {
      yPosition = addSectionHeader(doc, 'Overall Assessment', yPosition);
      doc.setFont('helvetica', 'normal');
      const assessmentLines = doc.splitTextToSize(report.overallAssessment, contentWidth);
      doc.text(assessmentLines, margins.left, yPosition);
      yPosition += (assessmentLines.length * 5);
    }

    // Page 3+: Critical Failures
    if ((report.criticalFailures && report.criticalFailures.length > 0) || 
        (isLegacyFormat && report.violations && report.violations.length > 0)) {
      doc.addPage();
      headerY = addStandardHeader(doc, 'Critical Failures', null);
      yPosition = headerY + 5;
      
      const failureCount = report.criticalFailures?.length || report.violations?.length || 0;
      yPosition = addSectionHeader(doc, `${failureCount} Critical Issue${failureCount !== 1 ? 's' : ''} Found`, yPosition);
      
      const failures = report.criticalFailures || report.violations || [];
      
      failures.forEach((failure: any, index: number) => {
        if (yPosition > 260) {
          doc.addPage();
          headerY = addStandardHeader(doc, 'Critical Failures (continued)', null);
          yPosition = headerY + 5;
        }
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(...RGB_COLORS.error, 0.1);
        doc.rect(margins.left, yPosition - 5, contentWidth, 8, 'F');
        doc.setTextColor(...RGB_COLORS.error);
        doc.text(`${index + 1}. ${failure.clause || `Clause ${failure.clause}`}`, margins.left + 2, yPosition);
        yPosition += 10;
        
        doc.setTextColor(...RGB_COLORS.textPrimary);
        doc.setFont('helvetica', 'normal');
        const desc = doc.splitTextToSize(failure.description, contentWidth - 4);
        doc.text(desc, margins.left + 2, yPosition);
        yPosition += (desc.length * 5) + 3;
        
        doc.setFont('helvetica', 'bold');
        doc.text('Reason:', margins.left + 2, yPosition);
        doc.setFont('helvetica', 'normal');
        const reason = doc.splitTextToSize(failure.reason || failure.evidence || '', contentWidth - 4);
        doc.text(reason, margins.left + 2, yPosition + 5);
        yPosition += (reason.length * 5) + 10;
      });
    }

    // Administrative Details
    if (report.administrativeDetails) {
      doc.addPage();
      headerY = addStandardHeader(doc, 'Administrative Completeness', null);
      yPosition = headerY + 5;
      
      const details = report.administrativeDetails;
      
      const adminData = [
        ['Physical Address', details.physicalAddress || 'Not Found'],
        ['Erf / Lot No.', details.erfNumber || 'Not Found'],
        ['Registered Person', details.registeredPerson || 'Not Found'],
        ['Registration Number', details.registrationNumber || 'Not Found'],
        ['Type of Registration', details.registrationType || 'Not Found'],
        ['Date of Registration', details.registrationDate || 'Not Found'],
      ].filter(([field, value]) => {
        const lowerValue = value.toLowerCase();
        return !lowerValue.includes('not found') && 
               !lowerValue.includes('not provided') && 
               !lowerValue.includes('n/a') &&
               value.trim().length > 0;
      });
      
      autoTable(doc, {
        ...getTableOptionsWithSafeMargins(doc, yPosition, 'Administrative Details', null, 'Electrical Compliance'),
        head: [['Field', 'Value']],
        body: adminData,
        theme: 'grid',
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: contentWidth - 50 },
        },
      });
    }

    // Technical Evaluation
    if (report.technicalEvaluation && report.technicalEvaluation.length > 0) {
      doc.addPage();
      headerY = addStandardHeader(doc, 'Technical Evaluation', null);
      yPosition = headerY + 5;
      
      const techData = report.technicalEvaluation.map((item: any) => [
        `${item.section}\nClause ${item.clause}`,
        item.requirement,
        item.finding,
        item.status
      ]);
      
      autoTable(doc, {
        ...getTableOptionsWithSafeMargins(doc, yPosition, 'Technical Evaluation', null, 'Electrical Compliance'),
        head: [['Section', 'Requirement', 'Finding', 'Status']],
        body: techData,
        theme: 'grid',
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 55 },
          2: { cellWidth: 55 },
          3: { cellWidth: 25 }
        }
      });
    }

    // Recommendations
    if (report.recommendations && report.recommendations.length > 0) {
      doc.addPage();
      headerY = addStandardHeader(doc, 'Recommendations', null);
      yPosition = headerY + 5;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...RGB_COLORS.textPrimary);
      
      report.recommendations.forEach((rec: string, index: number) => {
        if (yPosition > 260) {
          doc.addPage();
          headerY = addStandardHeader(doc, 'Recommendations (continued)', null);
          yPosition = headerY + 5;
        }
        
        const recLines = doc.splitTextToSize(`${index + 1}. ${rec}`, contentWidth);
        doc.text(recLines, margins.left, yPosition);
        yPosition += (recLines.length * 5) + 5;
      });
    }

    // Add footers to all pages (skip cover page)
    addFootersToAllPages(doc, true);
    
    // Log compliance
    logComplianceCheck('COCValidationReport', {
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
    const blob = doc.output('blob');
    
    return { doc, fileName, blob };
  };

  const handlePreviewReport = () => {
    try {
      setGenerating(true);
      const result = generatePDF();
      
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
              {report.administrativeDetails.erfNumber && (
                <div>
                  <p className="text-sm text-muted-foreground">Erf / Lot No.</p>
                  <p className="font-medium">{report.administrativeDetails.erfNumber}</p>
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
              {report.administrativeDetails.registrationDate && (
                <div>
                  <p className="text-sm text-muted-foreground">Date of Registration</p>
                  <p className="font-medium">{report.administrativeDetails.registrationDate}</p>
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
                  <p className="font-medium">{item.requirement}</p>
                  <p className="text-sm text-muted-foreground mt-1">{item.finding}</p>
                  {item.notes && (
                    <p className="text-sm text-muted-foreground mt-2 italic">{item.notes}</p>
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
            <ul className="list-disc pl-5 space-y-2">
              {report.recommendations.map((rec, index) => (
                <li key={index} className="text-muted-foreground">{rec}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
        contextName={subsectionName || "Subsection"}
        isSaving={saving}
      />
    </div>
  );
}
