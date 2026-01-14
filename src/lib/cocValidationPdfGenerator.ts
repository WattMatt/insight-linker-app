import {
  generatePdfBlob,
  createSectionHeader,
  createInfoTable,
  createDataTable,
  COLORS,
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

interface ValidationData {
  status: string;
  validated_at: string;
  validated_by?: string;
  report_data?: ValidationReport;
  subsection_id: string;
  document_id?: string;
}

export async function generateCOCValidationPDF(validation: ValidationData): Promise<{ blob: Blob; fileName: string }> {
  const report = (validation.report_data || {}) as ValidationReport;
  const status = report.overallStatus || report.status || validation.status;
  const content: any[] = [];

  // ===== VALIDATION STATUS & SUMMARY =====
  content.push(createSectionHeader('Validation Status', 'primary'));
  
  // Compact status display with COC Type inline
  content.push({
    columns: [
      {
        width: 'auto',
        text: (status || 'UNKNOWN').toUpperCase(),
        fontSize: 20,
        bold: true,
        color: status?.toLowerCase() === 'pass' ? COLORS.success :
               status?.toLowerCase() === 'fail' ? COLORS.error :
               status?.toLowerCase() === 'incomplete' ? COLORS.warning : COLORS.textMuted,
      },
      { width: 20, text: '' },
      report.cocType ? {
        width: 'auto',
        text: `COC Type: ${report.cocType}`,
        fontSize: 10,
        margin: [0, 6, 0, 0],
      } : { text: '' },
    ],
    margin: [0, 0, 0, 12],
  });

  // Installation Summary (compact)
  if (report.installationSummary) {
    content.push({
      text: [
        { text: 'Installation Summary: ', bold: true, fontSize: 10 },
        { text: report.installationSummary, fontSize: 10, color: COLORS.textSecondary },
      ],
      margin: [0, 0, 0, 8],
    });
  }

  // Overall Assessment (compact)
  if (report.overallAssessment) {
    content.push({
      text: [
        { text: 'Assessment: ', bold: true, fontSize: 10 },
        { text: report.overallAssessment, fontSize: 10, color: COLORS.textSecondary },
      ],
      margin: [0, 0, 0, 12],
    });
  }

  // ===== ADMINISTRATIVE DETAILS =====
  if (report.administrativeDetails) {
    content.push(createSectionHeader('Administrative Details', 'secondary'));

    const details = report.administrativeDetails;
    const adminData: [string, string][] = [
      ['Physical Address', details.physicalAddress || 'Not Found'],
      ['Registered Person', details.registeredPerson || 'Not Found'],
      ['Registration Number', details.registrationNumber || 'Not Found'],
      ['Type of Registration', details.registrationType || 'Not Found'],
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
    content.push(createSectionHeader('Technical Evaluation', 'secondary'));

    content.push(createDataTable(
      [
        { header: 'Section', field: 'section', width: 70 },
        { header: 'Requirement', field: 'requirement', width: '*' },
        { header: 'Finding', field: 'finding', width: '*' },
        { header: 'Status', field: 'status', width: 50, alignment: 'center' },
      ],
      report.technicalEvaluation.map(item => ({
        section: item.section,
        requirement: item.requirement,
        finding: item.finding,
        status: item.status,
      }))
    ));
  }

  // ===== CRITICAL FAILURES =====
  const failures = report.criticalFailures || report.violations || [];
  if (failures.length > 0) {
    content.push(createSectionHeader(`Critical Failures (${failures.length})`, 'primary'));

    const failureRows = failures.map((failure: any, index: number) => [
      { text: `${index + 1}`, fontSize: 9, alignment: 'center' as const },
      { text: failure.clause || '-', fontSize: 9, bold: true, color: COLORS.error },
      { text: failure.description, fontSize: 9 },
      { text: failure.reason || failure.evidence || '-', fontSize: 9, color: COLORS.textSecondary },
    ]);

    content.push({
      table: {
        headerRows: 1,
        widths: [25, 60, '*', '*'],
        body: [
          [
            { text: '#', bold: true, fontSize: 9, fillColor: '#fef2f2' },
            { text: 'Clause', bold: true, fontSize: 9, fillColor: '#fef2f2' },
            { text: 'Description', bold: true, fontSize: 9, fillColor: '#fef2f2' },
            { text: 'Reason', bold: true, fontSize: 9, fillColor: '#fef2f2' },
          ],
          ...failureRows,
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#fecaca',
        vLineColor: () => '#fecaca',
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 0, 0, 12],
    });
  }

  // ===== RECOMMENDATIONS =====
  if (report.recommendations && report.recommendations.length > 0) {
    content.push(createSectionHeader('Recommendations', 'secondary'));

    content.push({
      ol: report.recommendations.map(rec => ({
        text: rec,
        fontSize: 9,
        margin: [0, 0, 0, 4],
      })),
      margin: [0, 0, 0, 10],
    });
  }

  // Build document
  const reportDate = new Date(report.evaluationDate || validation.validated_at);
  const docDefinition = {
    pageSize: 'A4' as const,
    pageMargins: [40, 60, 40, 50] as [number, number, number, number],
    header: {
      columns: [
        { text: 'COC Validation Report', fontSize: 10, bold: true, margin: [40, 20, 0, 0] },
        { text: `REF: ${report.cocNumber || 'N/A'}`, fontSize: 9, alignment: 'right' as const, margin: [0, 20, 40, 0] },
      ],
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'CONFIDENTIAL', fontSize: 8, color: COLORS.textMuted, margin: [40, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 8, alignment: 'center' as const },
        { text: reportDate.toLocaleDateString(), fontSize: 8, alignment: 'right' as const, margin: [0, 0, 40, 0] },
      ],
      margin: [0, 10, 0, 0],
    }),
    content,
    defaultStyle: {
      fontSize: 10,
    },
  };

  const blob = await generatePdfBlob(docDefinition);
  const fileName = `COC_Validation_Report_${report.cocNumber || 'Unknown'}_${new Date().toISOString().split('T')[0]}.pdf`;

  return { blob, fileName };
}
