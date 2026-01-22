/**
 * COC Validation Report Generator
 * Migrated to use unified PDFShift-based generation via generate-pdf edge function
 */

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

interface ValidationData {
  status: string;
  validated_at: string;
  validated_by?: string;
  report_data?: ValidationReport;
  subsection_id: string;
  document_id?: string;
}

/**
 * Generates a COC Validation PDF report using PDFShift via edge function
 * Returns a blob and filename for preview/download
 */
export async function generateCOCValidationPDF(validation: ValidationData): Promise<{ blob: Blob; fileName: string }> {
  const report = (validation.report_data || {}) as ValidationReport;
  const status = report.overallStatus || report.status || validation.status;

  // Build the report data payload for the edge function
  const reportData = {
    reportType: 'coc-validation' as const,
    title: 'COC Validation Report',
    subtitle: `COC Number: ${report.cocNumber || 'N/A'}`,
    generatedAt: new Date().toISOString(),
    cocValidation: {
      cocNumber: report.cocNumber,
      cocType: report.cocType,
      evaluationDate: report.evaluationDate || validation.validated_at,
      overallStatus: status,
      installationSummary: report.installationSummary,
      overallAssessment: report.overallAssessment,
      checks: report.checks?.map(check => ({
        checkId: check.checkId,
        clause: check.clause,
        description: check.description,
        result: check.result,
        measuredValue: check.measuredValue,
        limit: check.limit,
        category: check.category,
      })),
      criticalFailures: report.criticalFailures || report.violations?.map(v => ({
        category: 'General',
        clause: v.clause,
        description: v.description,
        reason: v.evidence,
      })),
      administrativeDetails: report.administrativeDetails ? {
        physicalAddress: report.administrativeDetails.physicalAddress,
        registeredPerson: report.administrativeDetails.registeredPerson,
        registrationNumber: report.administrativeDetails.registrationNumber,
        registrationType: report.administrativeDetails.registrationType,
      } : undefined,
      technicalEvaluation: report.technicalEvaluation?.map(te => ({
        section: te.section,
        requirement: te.requirement,
        finding: te.finding,
        status: te.status,
      })),
      recommendations: report.recommendations,
      subsectionName: validation.subsection_id,
    },
  };

  console.log('[COCValidationPDF] Generating via PDFShift edge function');

  const { data: result, error } = await supabase.functions.invoke('generate-pdf', {
    body: reportData,
  });

  if (error) {
    console.error('PDF generation error:', error);
    throw new Error(error.message || 'Failed to generate PDF');
  }

  if (!result?.url) {
    throw new Error('No storage URL received from PDF generation');
  }

  // Fetch the blob from the generated URL
  const response = await fetch(result.url);
  const blob = await response.blob();
  
  const fileName = result.filename || `COC_Validation_Report_${report.cocNumber || 'Unknown'}_${new Date().toISOString().split('T')[0]}.pdf`;

  return { blob, fileName };
}
