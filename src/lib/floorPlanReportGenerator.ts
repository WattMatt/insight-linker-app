/**
 * Floor Plan Report Generator - pdfmake version
 * Generates PDF reports for floor plan inspections with pins/snags
 */

import {
  generatePdfBlob,
  buildDocument,
  createSectionHeader,
  createDataTable,
  createInfoTable,
  createKpiRow,
  logComplianceCheck,
  COLORS,
  mmToPt,
  A4_WIDTH_PT,
  CONTENT_WIDTH_PT,
  PDFComplianceCheck,
} from "./pdfMakeUtils";
import { DOCUMENT_DESIGN_STANDARDS } from "./documentDesignStandards";

const { margins } = DOCUMENT_DESIGN_STANDARDS;

type Content = any;

interface Pin {
  pin_number: number;
  pin_type: 'snag' | 'observation';
  status: 'open' | 'in_progress' | 'finished' | 'closed' | 'resolved';
  priority?: string;
  title?: string;
  notes?: string;
  detailed_description?: string;
  photo_url?: string;
  assigned_contractor?: string;
  stakeholders?: string;
  package?: string;
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  edit_history?: any[];
  rectification_photo_url?: string;
  rectification_notes?: string;
  rectified_at?: string;
  rectified_by?: string;
  comments?: Array<{
    user_name: string;
    comment: string;
    created_at: string;
  }>;
}

interface ReportData {
  projectName: string;
  siteName: string;
  subsectionName: string;
  floorPlanUrl: string;
  pins: Pin[];
  canvasDataUrl?: string;
}

export interface FloorPlanReportResult {
  blob: Blob;
  fileName: string;
  complianceChecks: PDFComplianceCheck;
}

/**
 * Generate a floor plan inspection report using pdfmake
 */
export const generateFloorPlanReport = async (data: ReportData): Promise<FloorPlanReportResult> => {
  const content: Content[] = [];

  const snags = data.pins.filter(p => p.pin_type === 'snag');
  const observations = data.pins.filter(p => p.pin_type === 'observation');

  // Status breakdown
  const statusCount = {
    open: data.pins.filter(p => p.status === 'open').length,
    in_progress: data.pins.filter(p => p.status === 'in_progress').length,
    finished: data.pins.filter(p => p.status === 'finished').length,
    closed: data.pins.filter(p => p.status === 'closed').length,
    resolved: data.pins.filter(p => p.status === 'resolved').length,
  };

  const totalPins = data.pins.length || 1; // Avoid division by zero

  // ===== EXECUTIVE SUMMARY PAGE =====
  content.push(createSectionHeader('Executive Summary', 'primary'));

  // KPI row
  content.push(createKpiRow([
    { value: data.pins.length.toString(), label: 'Total Items', color: COLORS.primary },
    { value: snags.length.toString(), label: 'Snags', color: COLORS.error },
    { value: observations.length.toString(), label: 'Observations', color: COLORS.accent },
    { value: `${Math.round(((statusCount.closed + statusCount.resolved) / totalPins) * 100)}%`, label: 'Resolved', color: COLORS.success },
  ]));

  // Status breakdown table
  content.push(createSectionHeader('Status Overview'));
  content.push(createDataTable(
    [
      { header: 'Status', field: 'status', width: '*' },
      { header: 'Count', field: 'count', width: 60, alignment: 'center' },
      { header: 'Percentage', field: 'percentage', width: 80, alignment: 'center' },
    ],
    [
      { status: 'Open', count: statusCount.open, percentage: `${Math.round((statusCount.open / totalPins) * 100)}%` },
      { status: 'In Progress', count: statusCount.in_progress, percentage: `${Math.round((statusCount.in_progress / totalPins) * 100)}%` },
      { status: 'Finished', count: statusCount.finished, percentage: `${Math.round((statusCount.finished / totalPins) * 100)}%` },
      { status: 'Closed/Resolved', count: statusCount.closed + statusCount.resolved, percentage: `${Math.round(((statusCount.closed + statusCount.resolved) / totalPins) * 100)}%` },
    ]
  ));

  // Priority breakdown for snags
  if (snags.length > 0) {
    content.push(createSectionHeader('Snags by Priority'));

    const priorityCount = {
      critical: snags.filter(s => s.priority === 'critical').length,
      high: snags.filter(s => s.priority === 'high').length,
      medium: snags.filter(s => s.priority === 'medium').length,
      low: snags.filter(s => s.priority === 'low').length,
    };

    const snagTotal = snags.length || 1;

    content.push(createDataTable(
      [
        { header: 'Priority', field: 'priority', width: '*' },
        { header: 'Count', field: 'count', width: 60, alignment: 'center' },
        { header: 'Percentage', field: 'percentage', width: 80, alignment: 'center' },
      ],
      [
        { priority: 'Critical', count: priorityCount.critical, percentage: `${Math.round((priorityCount.critical / snagTotal) * 100)}%` },
        { priority: 'High', count: priorityCount.high, percentage: `${Math.round((priorityCount.high / snagTotal) * 100)}%` },
        { priority: 'Medium', count: priorityCount.medium, percentage: `${Math.round((priorityCount.medium / snagTotal) * 100)}%` },
        { priority: 'Low', count: priorityCount.low, percentage: `${Math.round((priorityCount.low / snagTotal) * 100)}%` },
      ],
      { headerStyle: 'secondary' }
    ));
  }

  // Contractor breakdown
  const contractorCounts: Record<string, number> = {};
  snags.forEach(snag => {
    if (snag.assigned_contractor) {
      contractorCounts[snag.assigned_contractor] = (contractorCounts[snag.assigned_contractor] || 0) + 1;
    }
  });

  if (Object.keys(contractorCounts).length > 0) {
    content.push(createSectionHeader('Snags by Contractor'));

    const contractorData = Object.entries(contractorCounts).map(([contractor]) => {
      const contractorSnags = snags.filter(s => s.assigned_contractor === contractor);
      return {
        contractor,
        total: contractorSnags.length,
        open: contractorSnags.filter(s => s.status === 'open').length,
        inProgress: contractorSnags.filter(s => s.status === 'in_progress').length,
        finished: contractorSnags.filter(s => ['finished', 'closed', 'resolved'].includes(s.status)).length,
      };
    });

    content.push(createDataTable(
      [
        { header: 'Contractor', field: 'contractor', width: '*' },
        { header: 'Total', field: 'total', width: 50, alignment: 'center' },
        { header: 'Open', field: 'open', width: 50, alignment: 'center' },
        { header: 'In Progress', field: 'inProgress', width: 70, alignment: 'center' },
        { header: 'Finished', field: 'finished', width: 60, alignment: 'center' },
      ],
      contractorData
    ));
  }

  // ===== FLOOR PLAN OVERVIEW =====
  if (data.canvasDataUrl) {
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('Floor Plan Overview', 'primary'));
    
    content.push({
      image: data.canvasDataUrl,
      width: CONTENT_WIDTH_PT - 20,
      alignment: 'center',
      margin: [0, 10, 0, 10],
    });
  }

  // ===== ITEMS SUMMARY TABLE =====
  content.push({ text: '', pageBreak: 'before' });
  content.push(createSectionHeader('Items Summary', 'primary'));

  content.push(createDataTable(
    [
      { header: '#', field: 'number', width: 30, alignment: 'center' },
      { header: 'Type', field: 'type', width: 60 },
      { header: 'Title', field: 'title', width: '*' },
      { header: 'Priority', field: 'priority', width: 60 },
      { header: 'Status', field: 'status', width: 70 },
      { header: 'Contractor', field: 'contractor', width: 80 },
    ],
    data.pins.sort((a, b) => a.pin_number - b.pin_number).map(pin => ({
      number: pin.pin_number,
      type: pin.pin_type,
      title: pin.title || 'Untitled',
      priority: pin.priority || '-',
      status: pin.status.replace('_', ' '),
      contractor: pin.assigned_contractor || '-',
    }))
  ));

  // ===== INDIVIDUAL ITEM DETAILS =====
  for (const pin of data.pins.sort((a, b) => a.pin_number - b.pin_number)) {
    content.push({ text: '', pageBreak: 'before' });

    // Item header with colored bar
    const headerColor = pin.status === 'closed' || pin.status === 'resolved' ? COLORS.success :
                        pin.status === 'in_progress' ? COLORS.warning :
                        pin.status === 'open' && pin.priority === 'critical' ? COLORS.error : COLORS.primary;

    content.push({
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            {
              text: `Item #${pin.pin_number}`,
              fontSize: 18,
              bold: true,
              color: COLORS.white,
            },
            {
              text: `${pin.pin_type.toUpperCase()} • ${pin.status.replace('_', ' ').toUpperCase()}`,
              fontSize: 10,
              color: COLORS.white,
              margin: [0, 3, 0, 0],
            },
          ],
        }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => mmToPt(margins.left),
        paddingRight: () => mmToPt(margins.right),
        paddingTop: () => 12,
        paddingBottom: () => 12,
        fillColor: () => headerColor,
      },
      margin: [0, 0, 0, 15],
    });

    // Info grid
    const infoData: [string, string][] = [];
    if (pin.priority) infoData.push(['Priority', pin.priority.toUpperCase()]);
    if (pin.assigned_contractor) infoData.push(['Contractor', pin.assigned_contractor]);
    if (pin.stakeholders) infoData.push(['Stakeholders', pin.stakeholders]);
    if (pin.package) infoData.push(['Package', pin.package]);
    if (pin.due_date) infoData.push(['Due Date', new Date(pin.due_date).toLocaleDateString()]);

    if (infoData.length > 0) {
      content.push(createInfoTable(infoData));
    }

    // Title
    if (pin.title) {
      content.push(createSectionHeader('Title'));
      content.push({
        text: pin.title,
        fontSize: 11,
        margin: [0, 0, 0, 10],
      });
    }

    // Photo comparison
    if (pin.photo_url && pin.rectification_photo_url) {
      content.push(createSectionHeader('Before / After Comparison'));
      content.push({
        columns: [
          {
            stack: [
              { text: 'BEFORE', fontSize: 10, bold: true, color: COLORS.error, margin: [0, 0, 0, 5] },
              { image: pin.photo_url, width: 200, height: 150 },
            ],
          },
          {
            stack: [
              { text: 'AFTER', fontSize: 10, bold: true, color: COLORS.success, margin: [0, 0, 0, 5] },
              { image: pin.rectification_photo_url, width: 200, height: 150 },
            ],
          },
        ],
        columnGap: 20,
        margin: [0, 0, 0, 10],
      });

      if (pin.rectification_notes) {
        content.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { text: 'Rectification Notes:', bold: true, fontSize: 10 },
                { text: pin.rectification_notes, fontSize: 9, margin: [0, 3, 0, 0] },
              ],
            }]],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 8,
            paddingBottom: () => 8,
            fillColor: () => '#e8f5e9',
          },
          margin: [0, 0, 0, 10],
        });
      }
    } else if (pin.photo_url) {
      content.push(createSectionHeader('Photo'));
      content.push({
        image: pin.photo_url,
        width: 300,
        height: 200,
        margin: [0, 0, 0, 10],
      });
    }

    // Detailed description
    if (pin.detailed_description) {
      content.push(createSectionHeader('Detailed Description'));
      content.push({
        text: pin.detailed_description,
        fontSize: 10,
        margin: [0, 0, 0, 10],
      });
    }

    // Notes
    if (pin.notes) {
      content.push(createSectionHeader('Notes'));
      content.push({
        text: pin.notes,
        fontSize: 10,
        margin: [0, 0, 0, 10],
      });
    }

    // Comments
    if (pin.comments && pin.comments.length > 0) {
      content.push(createSectionHeader(`Comments (${pin.comments.length})`));

      pin.comments.forEach(comment => {
        content.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                {
                  columns: [
                    { text: comment.user_name || 'User', bold: true, fontSize: 9 },
                    { text: new Date(comment.created_at).toLocaleDateString(), fontSize: 8, color: COLORS.textMuted, alignment: 'right' },
                  ],
                },
                { text: comment.comment, fontSize: 9, margin: [0, 3, 0, 0] },
              ],
            }]],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0,
            hLineColor: () => COLORS.border,
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 6,
            paddingBottom: () => 6,
          },
          margin: [0, 0, 0, 5],
        });
      });
    }
  }

  // Build document
  const docDefinition = buildDocument({
    title: 'Floor Plan Inspection Report',
    coverPage: {
      title: 'Floor Plan Inspection Report',
      subtitle: data.subsectionName,
      siteName: data.siteName,
      reportType: 'Floor Plan Report',
      organizationName: data.projectName,
      reportDate: new Date(),
    },
    content,
  });

  // Generate blob
  const blob = await generatePdfBlob(docDefinition);

  // Log compliance
  const complianceChecks = logComplianceCheck('FloorPlanReport', {
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

  const fileName = `Floor_Plan_Report_${data.subsectionName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

  return { blob, fileName, complianceChecks };
};
