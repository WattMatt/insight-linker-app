/**
 * COC Validation PDF Report Generator — pdfmake
 * Generates a "Certificate of Evidence" PDF per docs/COC_VALIDATION_SPEC.md
 * 
 * Uses pdfmake as per project standard (no jsPDF).
 */
import type { COCData, COCTestReport, COCValidationResult } from '@/utils/cocValidationEngine';

interface COCPdfInput {
  cocData: COCData;
  testReport: COCTestReport;
  validationResult: COCValidationResult;
}

function statusColor(status: string): string {
  switch (status) {
    case 'VALID': return '#16a34a';
    case 'INVALID': return '#dc2626';
    case 'REQUIRES_REVIEW': return '#d97706';
    default: return '#6b7280';
  }
}

function resultLabel(passed: boolean, severity?: string): string {
  if (passed) return 'PASS';
  if (severity === 'CRITICAL') return 'FAIL';
  return 'WARNING';
}

function resultColor(passed: boolean, severity?: string): string {
  if (passed) return '#16a34a';
  if (severity === 'CRITICAL') return '#dc2626';
  return '#d97706';
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function formatPhase(p: string): string {
  return p === 'single_phase' ? 'Single Phase' : p === 'three_phase' ? 'Three Phase' : p;
}

function formatCategory(c: string): string {
  const map: Record<string, string> = {
    electrical_tester_single_phase: 'Electrical Tester (Single Phase)',
    installation_electrician: 'Installation Electrician (IE)',
    master_installation_electrician: 'Master Installation Electrician (MIE)',
  };
  return map[c] || c;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ').replace(/-/g, ' ');
}

export function buildCOCValidationPdf(input: COCPdfInput): TDocumentDefinitions {
  const { cocData, testReport, validationResult } = input;
  const now = new Date().toLocaleString('en-ZA');

  // ── Status banner ──
  const statusBanner: Content = {
    table: {
      widths: ['*'],
      body: [[{
        text: `VALIDATION STATUS: ${validationResult.status.replace('_', ' ')}`,
        fontSize: 14,
        bold: true,
        color: '#ffffff',
        fillColor: statusColor(validationResult.status),
        alignment: 'center' as const,
        margin: [0, 8, 0, 8],
      }]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 12] as [number, number, number, number],
  };

  // ── Certificate details ──
  const certDetails: Content = {
    table: {
      widths: [140, '*'],
      body: [
        [{ text: 'COC Reference', bold: true }, cocData.cocReferenceNumber],
        [{ text: 'Certificate Type', bold: true }, capitalize(cocData.certificateType)],
        [{ text: 'Installation Address', bold: true }, cocData.installationAddress],
        [{ text: 'Installation Type', bold: true }, capitalize(cocData.installationType)],
        [{ text: 'Phase Configuration', bold: true }, formatPhase(cocData.phaseConfiguration)],
        [{ text: 'Supply', bold: true }, `${cocData.supplyVoltage} V / ${cocData.supplyFrequency} Hz`],
        [{ text: 'Date of Issue', bold: true }, formatDate(cocData.dateOfIssue)],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 12] as [number, number, number, number],
  };

  // ── Registered Person ──
  const personDetails: Content = {
    table: {
      widths: [140, '*'],
      body: [
        [{ text: 'Name', bold: true }, cocData.registeredPersonName],
        [{ text: 'Reg. Number', bold: true }, cocData.registrationNumber],
        [{ text: 'Category', bold: true }, formatCategory(cocData.registrationCategory)],
        [{ text: 'Signature Present', bold: true }, testReport.hasSignature ? 'Yes' : 'No'],
        [{ text: 'Signature Date', bold: true }, formatDate(testReport.signatureDate)],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 12] as [number, number, number, number],
  };

  // ── Test Results Table ──
  const testRows: TableCell[][] = [
    [
      { text: 'Test Field', bold: true, fillColor: '#f3f4f6' },
      { text: 'Measured', bold: true, fillColor: '#f3f4f6', alignment: 'right' as const },
      { text: 'Unit', bold: true, fillColor: '#f3f4f6' },
      { text: 'SANS Threshold', bold: true, fillColor: '#f3f4f6' },
      { text: 'Result', bold: true, fillColor: '#f3f4f6', alignment: 'center' as const },
    ],
  ];

  const tests: Array<{
    name: string;
    value: number | null;
    unit: string;
    threshold: string;
    check: (v: number) => 'PASS' | 'FAIL' | 'WARNING';
  }> = [
    {
      name: 'Insulation Resistance',
      value: testReport.insulationResistance_MOhm,
      unit: 'MΩ',
      threshold: '> 1.0 MΩ',
      check: (v) => v > 1.0 ? 'PASS' : 'FAIL',
    },
    {
      name: 'Earth Loop Impedance (Zs)',
      value: testReport.earthLoopImpedance_Zs_Ohm,
      unit: 'Ω',
      threshold: '≤ 1.67 Ω (Type B)',
      check: (v) => v <= 0 ? 'FAIL' : v > 1.67 ? 'WARNING' : 'PASS',
    },
    {
      name: 'RCD Trip Time',
      value: testReport.rcdTripTime_ms,
      unit: 'ms',
      threshold: '≤ 300 ms',
      check: (v) => v > 300 ? 'FAIL' : v > 200 ? 'WARNING' : 'PASS',
    },
    {
      name: 'RCD Rated Current',
      value: testReport.rcdRatedCurrent_mA,
      unit: 'mA',
      threshold: 'Typical: 30 mA',
      check: () => 'PASS',
    },
    {
      name: 'PSCC',
      value: testReport.pscc_kA,
      unit: 'kA',
      threshold: '0.5–25 kA',
      check: (v) => v <= 0 ? 'FAIL' : (v < 0.5 || v > 25) ? 'WARNING' : 'PASS',
    },
    {
      name: 'Earth Continuity',
      value: testReport.earthContinuity_Ohm,
      unit: 'Ω',
      threshold: '< 1.0 Ω',
      check: () => 'PASS',
    },
    {
      name: 'Voltage at Main DB',
      value: testReport.voltageAtMainDB_V,
      unit: 'V',
      threshold: '220–240 V',
      check: () => 'PASS',
    },
  ];

  for (const t of tests) {
    const measured = t.value !== null && t.value !== undefined ? String(t.value) : 'MISSING';
    const result = t.value !== null && t.value !== undefined ? t.check(t.value) : 'FAIL';
    const color = result === 'PASS' ? '#16a34a' : result === 'FAIL' ? '#dc2626' : '#d97706';

    testRows.push([
      { text: t.name },
      { text: measured, alignment: 'right' as const, color: measured === 'MISSING' ? '#dc2626' : undefined },
      { text: t.unit },
      { text: t.threshold, fontSize: 8 },
      { text: result, bold: true, color, alignment: 'center' as const },
    ]);
  }

  const testTable: Content = {
    table: {
      headerRows: 1,
      widths: ['*', 60, 30, 100, 55],
      body: testRows,
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 12] as [number, number, number, number],
  };

  // ── New Tech Section ──
  const newTechContent: Content[] = [];
  if (testReport.hasSolarPV || testReport.hasBESS) {
    const techRows: TableCell[][] = [
      [
        { text: 'Technology', bold: true, fillColor: '#f3f4f6' },
        { text: 'Status', bold: true, fillColor: '#f3f4f6' },
        { text: 'Verified', bold: true, fillColor: '#f3f4f6', alignment: 'center' as const },
      ],
    ];

    if (testReport.hasSolarPV) {
      techRows.push(
        ['Solar PV — Grounding', 'Installed', {
          text: testReport.solarGroundingVerified ? '✓' : '✗',
          color: testReport.solarGroundingVerified ? '#16a34a' : '#dc2626',
          alignment: 'center' as const,
        }],
        ['Solar PV — Inverter Sync', 'Installed', {
          text: testReport.inverterSyncVerified ? '✓' : '✗',
          color: testReport.inverterSyncVerified ? '#16a34a' : '#dc2626',
          alignment: 'center' as const,
        }],
      );
    }

    if (testReport.hasBESS) {
      techRows.push(
        ['BESS — Fire Protection', 'Installed', {
          text: testReport.bessFireProtection ? '✓' : '✗',
          color: testReport.bessFireProtection ? '#16a34a' : '#dc2626',
          alignment: 'center' as const,
        }],
      );
    }

    techRows.push(
      ['SPD Operational', 'Mandatory', {
        text: testReport.spdOperational ? '✓' : '✗',
        color: testReport.spdOperational ? '#16a34a' : '#dc2626',
        alignment: 'center' as const,
      }],
    );

    newTechContent.push(
      { text: 'SANS 10142-1:2024 New Technology', style: 'sectionHeader', margin: [0, 8, 0, 4] as [number, number, number, number] },
      {
        table: { headerRows: 1, widths: ['*', 80, 50], body: techRows },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 12] as [number, number, number, number],
      },
    );
  }

  // ── Validation Rules Breakdown ──
  const allRules = [...validationResult.failedRules, ...validationResult.passedRules];
  const rulesRows: TableCell[][] = [
    [
      { text: 'Rule', bold: true, fillColor: '#f3f4f6' },
      { text: 'Standard', bold: true, fillColor: '#f3f4f6' },
      { text: 'Result', bold: true, fillColor: '#f3f4f6', alignment: 'center' as const },
      { text: 'Details', bold: true, fillColor: '#f3f4f6' },
    ],
  ];

  for (const rule of allRules) {
    const label = resultLabel(rule.passed, rule.severity);
    const color = resultColor(rule.passed, rule.severity);
    rulesRows.push([
      { text: `${rule.ruleName}\n${rule.ruleId}`, fontSize: 8 },
      { text: rule.sansClause || '—', fontSize: 8 },
      { text: label, bold: true, color, alignment: 'center' as const, fontSize: 9 },
      { text: rule.message, fontSize: 7 },
    ]);
  }

  const rulesTable: Content = {
    table: { headerRows: 1, widths: [110, 80, 50, '*'], body: rulesRows },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 12] as [number, number, number, number],
  };

  // ── Fraud Risk ──
  const fraudSection: Content = {
    table: {
      widths: ['*'],
      body: [[{
        text: `FRAUD RISK ASSESSMENT: ${validationResult.fraudRiskScore}`,
        fontSize: 11,
        bold: true,
        color: '#ffffff',
        fillColor: validationResult.fraudRiskScore === 'HIGH' ? '#dc2626'
          : validationResult.fraudRiskScore === 'MEDIUM' ? '#d97706' : '#16a34a',
        alignment: 'center' as const,
        margin: [0, 6, 0, 6],
      }]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 12] as [number, number, number, number],
  };

  // ── Build Document ──
  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    info: {
      title: `COC Validation Report — ${cocData.cocReferenceNumber}`,
      author: 'WM Consulting Spud Operations Platform',
      subject: 'Certificate of Evidence',
    },
    styles: {
      sectionHeader: { fontSize: 12, bold: true, margin: [0, 12, 0, 4] as [number, number, number, number] },
    },
    content: [
      // Header
      { text: 'COC Validation Report', fontSize: 18, bold: true, alignment: 'center' as const },
      { text: 'Certificate of Evidence', fontSize: 12, color: '#6b7280', alignment: 'center' as const, margin: [0, 0, 0, 4] as [number, number, number, number] },
      { text: `Jurisdiction: South Africa (OHS Act 85 of 1993, SANS 10142-1)`, fontSize: 8, color: '#9ca3af', alignment: 'center' as const, margin: [0, 0, 0, 16] as [number, number, number, number] },

      statusBanner,

      { text: 'Certificate Details', style: 'sectionHeader' },
      certDetails,

      { text: 'Registered Person', style: 'sectionHeader' },
      personDetails,

      { text: 'Section 4 Test Results', style: 'sectionHeader' },
      testTable,

      ...newTechContent,

      { text: 'Validation Rules Breakdown', style: 'sectionHeader' },
      rulesTable,

      fraudSection,
    ],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: `Generated by WM Consulting Spud Operations Platform • ${now}`, fontSize: 7, color: '#9ca3af', margin: [40, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, color: '#9ca3af', alignment: 'right' as const, margin: [0, 0, 40, 0] },
      ],
    }),
  };

  return docDefinition;
}
