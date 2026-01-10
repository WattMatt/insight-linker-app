import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DOCUMENT_DESIGN_STANDARDS,
  hexToRgb,
  RGB_COLORS,
  PAGE,
  addCoverPage,
  addStandardHeader,
  addFootersToAllPages,
  addSectionHeader,
  addFullWidthSectionHeader,
  getStandardTableStyles,
  addPrimaryHeaderTable,
  logComplianceCheck,
  drawKpiCard,
} from "./pdfUtils";

const { typography, colors, margins, tables, footers } = DOCUMENT_DESIGN_STANDARDS;

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
  canvasDataUrl?: string; // Canvas with pins rendered on floor plan
}

export const generateFloorPlanReport = async (data: ReportData): Promise<jsPDF> => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - (2 * margins.left);
  let yPos = margins.top;

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

  // ===== PAGE 1: DEDICATED COVER PAGE =====
  addCoverPage(doc, {
    title: 'Floor Plan Inspection Report',
    subtitle: `${data.subsectionName}`,
    siteName: data.siteName,
    reportType: 'Floor Plan Report',
    organizationName: data.projectName,
    reportDate: new Date(),
  });

  // Executive Summary Page
  doc.addPage();
  let pageNum = 2;
  
  yPos = addFullWidthSectionHeader(doc, "Executive Summary", 0, RGB_COLORS.primary);
  
  doc.setTextColor(...RGB_COLORS.textPrimary);

  // Status breakdown table
  doc.setFontSize(typography.scale.h4);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.text("Status Overview", margins.left, yPos);
  yPos += 7;

  autoTable(doc, {
    ...getStandardTableStyles(),
    startY: yPos,
    head: [['Status', 'Count', 'Percentage']],
    body: [
      ['Open', statusCount.open.toString(), `${Math.round((statusCount.open / data.pins.length) * 100)}%`],
      ['In Progress', statusCount.in_progress.toString(), `${Math.round((statusCount.in_progress / data.pins.length) * 100)}%`],
      ['Finished', statusCount.finished.toString(), `${Math.round((statusCount.finished / data.pins.length) * 100)}%`],
      ['Closed', (statusCount.closed + statusCount.resolved).toString(), `${Math.round(((statusCount.closed + statusCount.resolved) / data.pins.length) * 100)}%`],
    ],
    headStyles: { fillColor: RGB_COLORS.primary, textColor: RGB_COLORS.white, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 40, halign: 'center' },
      2: { cellWidth: 40, halign: 'center' },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // Priority breakdown for snags
  if (snags.length > 0) {
    doc.setFontSize(typography.scale.h4);
    doc.text("Snags by Priority", margins.left, yPos);
    yPos += 7;

    const priorityCount = {
      critical: snags.filter(s => s.priority === 'critical').length,
      high: snags.filter(s => s.priority === 'high').length,
      medium: snags.filter(s => s.priority === 'medium').length,
      low: snags.filter(s => s.priority === 'low').length,
    };

    autoTable(doc, {
      ...getStandardTableStyles(),
      startY: yPos,
      head: [['Priority', 'Count', 'Percentage']],
      body: [
        ['Critical', priorityCount.critical.toString(), `${Math.round((priorityCount.critical / snags.length) * 100)}%`],
        ['High', priorityCount.high.toString(), `${Math.round((priorityCount.high / snags.length) * 100)}%`],
        ['Medium', priorityCount.medium.toString(), `${Math.round((priorityCount.medium / snags.length) * 100)}%`],
        ['Low', priorityCount.low.toString(), `${Math.round((priorityCount.low / snags.length) * 100)}%`],
      ],
      headStyles: { fillColor: RGB_COLORS.error, textColor: RGB_COLORS.white, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 40, halign: 'center' },
        2: { cellWidth: 40, halign: 'center' },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 12;
  }

  // Contractor breakdown
  const contractorCounts: Record<string, number> = {};
  snags.forEach(snag => {
    if (snag.assigned_contractor) {
      contractorCounts[snag.assigned_contractor] = (contractorCounts[snag.assigned_contractor] || 0) + 1;
    }
  });

  if (Object.keys(contractorCounts).length > 0) {
    doc.setFontSize(typography.scale.h4);
    doc.text("Snags by Contractor", margins.left, yPos);
    yPos += 7;

    autoTable(doc, {
      ...getStandardTableStyles(),
      startY: yPos,
      head: [['Contractor', 'Total', 'Open', 'In Progress', 'Finished']],
      body: Object.entries(contractorCounts).map(([contractor]) => {
        const contractorSnags = snags.filter(s => s.assigned_contractor === contractor);
        return [
          contractor,
          contractorSnags.length.toString(),
          contractorSnags.filter(s => s.status === 'open').length.toString(),
          contractorSnags.filter(s => s.status === 'in_progress').length.toString(),
          contractorSnags.filter(s => s.status === 'finished' || s.status === 'closed' || s.status === 'resolved').length.toString(),
        ];
      }),
      headStyles: { fillColor: RGB_COLORS.textMuted, textColor: RGB_COLORS.white, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 30, halign: 'center' },
        4: { cellWidth: 30, halign: 'center' },
      },
    });
  }

  // Floor Plan Overview Page
  if (data.canvasDataUrl) {
    doc.addPage();
    pageNum++;
    
    yPos = addFullWidthSectionHeader(doc, "Floor Plan Overview", 0, RGB_COLORS.primary);
    doc.setTextColor(...RGB_COLORS.textPrimary);
    
    // Add floor plan image with pins
    const imgWidth = pageWidth - (2 * margins.left);
    const imgHeight = pageHeight - (2 * margins.top) - 30;
    
    try {
      doc.addImage(data.canvasDataUrl, 'PNG', margins.left, margins.top + 10, imgWidth, imgHeight, undefined, 'FAST');
    } catch (error) {
      console.error('Error adding floor plan image:', error);
      doc.text('Error loading floor plan image', margins.left, margins.top + 20);
    }
  }

  // Items Summary Table
  doc.addPage();
  pageNum++;
  
  yPos = addFullWidthSectionHeader(doc, "Items Summary", 0, RGB_COLORS.primary);
  doc.setTextColor(...RGB_COLORS.textPrimary);
  
  autoTable(doc, {
    ...getStandardTableStyles(),
    startY: yPos,
    head: [['#', 'Type', 'Title', 'Priority', 'Status', 'Contractor']],
    body: data.pins
      .sort((a, b) => a.pin_number - b.pin_number)
      .map(pin => [
        pin.pin_number.toString(),
        pin.pin_type,
        pin.title || 'Untitled',
        pin.priority || '-',
        pin.status.replace('_', ' '),
        pin.assigned_contractor || '-',
      ]),
    headStyles: { fillColor: RGB_COLORS.primary, textColor: RGB_COLORS.white, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: RGB_COLORS.tableAltRow },
  });

  // Individual Item Detail Pages
  for (const pin of data.pins.sort((a, b) => a.pin_number - b.pin_number)) {
    doc.addPage();
    pageNum++;
    yPos = margins.top;

    // Item header with status color
    let headerColor: [number, number, number] = RGB_COLORS.primary;
    if (pin.status === 'closed' || pin.status === 'resolved') headerColor = RGB_COLORS.success;
    else if (pin.status === 'in_progress') headerColor = RGB_COLORS.warning;
    else if (pin.status === 'open' && pin.priority === 'critical') headerColor = RGB_COLORS.error;
    
    doc.setFillColor(...headerColor);
    doc.rect(0, 0, pageWidth, 30, "F");
    
    doc.setTextColor(...RGB_COLORS.white);
    doc.setFontSize(typography.scale.h2);
    doc.setFont(typography.fonts.heading, 'bold');
    doc.text(`Item #${pin.pin_number}`, margins.left, 12);
    
    doc.setFontSize(typography.scale.body);
    doc.text(`${pin.pin_type.toUpperCase()} • ${pin.status.replace('_', ' ').toUpperCase()}`, margins.left, 22);
    
    doc.setTextColor(...RGB_COLORS.textPrimary);
    yPos = 40;

    // Info grid
    doc.setFontSize(typography.scale.body);
    doc.setFont(typography.fonts.heading, "bold");
    
    let infoYPos = yPos;
    if (pin.priority) {
      doc.text("Priority:", margins.left, infoYPos);
      doc.setFont(typography.fonts.body, "normal");
      doc.text(pin.priority.toUpperCase(), margins.left + 25, infoYPos);
      infoYPos += 6;
    }
    
    if (pin.assigned_contractor) {
      doc.setFont(typography.fonts.heading, "bold");
      doc.text("Contractor:", margins.left, infoYPos);
      doc.setFont(typography.fonts.body, "normal");
      doc.text(pin.assigned_contractor, margins.left + 30, infoYPos);
      infoYPos += 6;
    }
    
    if (pin.stakeholders) {
      doc.setFont(typography.fonts.heading, "bold");
      doc.text("Stakeholders:", margins.left, infoYPos);
      doc.setFont(typography.fonts.body, "normal");
      doc.text(pin.stakeholders, margins.left + 35, infoYPos);
      infoYPos += 6;
    }
    
    if (pin.package) {
      doc.setFont(typography.fonts.heading, "bold");
      doc.text("Package:", margins.left, infoYPos);
      doc.setFont(typography.fonts.body, "normal");
      doc.text(pin.package, margins.left + 25, infoYPos);
      infoYPos += 6;
    }
    
    if (pin.due_date) {
      doc.setFont(typography.fonts.heading, "bold");
      doc.text("Due Date:", margins.left, infoYPos);
      doc.setFont(typography.fonts.body, "normal");
      doc.text(new Date(pin.due_date).toLocaleDateString(), margins.left + 27, infoYPos);
      infoYPos += 6;
    }
    
    yPos = infoYPos + 5;

    // Title
    if (pin.title) {
      doc.setFillColor(...RGB_COLORS.bgCard);
      doc.rect(margins.left, yPos, pageWidth - 2 * margins.left, 12, "F");
      doc.setFont(typography.fonts.heading, "bold");
      doc.setFontSize(typography.scale.h4);
      doc.text("Title", margins.left + 2, yPos + 8);
      yPos += 14;
      doc.setFont(typography.fonts.body, "normal");
      doc.setFontSize(typography.scale.body);
      const titleLines = doc.splitTextToSize(pin.title, pageWidth - (2 * margins.left) - 4);
      doc.text(titleLines, margins.left + 2, yPos);
      yPos += 5 * titleLines.length + 8;
    }

    // Before/After Photo Comparison
    if (pin.photo_url || pin.rectification_photo_url) {
      if (pin.photo_url && pin.rectification_photo_url) {
        // Side-by-side comparison
        doc.setFont(typography.fonts.heading, "bold");
        doc.setFontSize(typography.scale.body);
        doc.text("Before / After Comparison", margins.left, yPos);
        yPos += 5;
        
        const halfWidth = (pageWidth - (2 * margins.left) - 5) / 2;
        const imgHeight = 70;
        
        // Before label and image
        doc.setFontSize(typography.scale.caption);
        doc.setTextColor(...RGB_COLORS.error);
        doc.text("BEFORE", margins.left, yPos);
        doc.setTextColor(...RGB_COLORS.success);
        doc.text("AFTER", margins.left + halfWidth + 5, yPos);
        doc.setTextColor(...RGB_COLORS.textPrimary);
        yPos += 3;
        
        doc.setDrawColor(...RGB_COLORS.error);
        doc.setLineWidth(1);
        doc.rect(margins.left, yPos, halfWidth, imgHeight);
        try {
          doc.addImage(pin.photo_url, 'JPEG', margins.left + 1, yPos + 1, halfWidth - 2, imgHeight - 2, undefined, 'FAST');
        } catch (error) {
          console.error('Error adding before photo:', error);
        }
        
        doc.setDrawColor(...RGB_COLORS.success);
        doc.rect(margins.left + halfWidth + 5, yPos, halfWidth, imgHeight);
        try {
          doc.addImage(pin.rectification_photo_url, 'JPEG', margins.left + halfWidth + 6, yPos + 1, halfWidth - 2, imgHeight - 2, undefined, 'FAST');
        } catch (error) {
          console.error('Error adding after photo:', error);
        }
        
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        yPos += imgHeight + 5;
        
        // Rectification notes
        if (pin.rectification_notes) {
          doc.setFillColor(232, 245, 233);
          doc.rect(margins.left, yPos, pageWidth - 2 * margins.left, 10, "F");
          doc.setFont(typography.fonts.heading, "bold");
          doc.setFontSize(typography.scale.body);
          doc.text("Rectification Notes:", margins.left + 2, yPos + 7);
          yPos += 12;
          doc.setFont(typography.fonts.body, "normal");
          doc.setFontSize(typography.scale.caption);
          const rectNotes = doc.splitTextToSize(pin.rectification_notes, pageWidth - (2 * margins.left) - 4);
          doc.text(rectNotes, margins.left + 2, yPos);
          yPos += 4 * rectNotes.length + 3;
        }
        
        if (pin.rectified_at) {
          doc.setFontSize(typography.scale.caption);
          doc.setTextColor(...RGB_COLORS.textMuted);
          doc.text(`Rectified on ${new Date(pin.rectified_at).toLocaleString()}${pin.rectified_by ? ` by ${pin.rectified_by}` : ''}`, margins.left, yPos);
          doc.setTextColor(...RGB_COLORS.textPrimary);
          yPos += 8;
        }
      } else if (pin.photo_url) {
        // Original photo only
        try {
          doc.setFont(typography.fonts.heading, "bold");
          doc.setFontSize(typography.scale.body);
          doc.text("Photo", margins.left, yPos);
          yPos += 5;
          
          const imgWidth = pageWidth - (2 * margins.left);
          const imgHeight = 90;
          doc.setDrawColor(200);
          doc.setLineWidth(0.5);
          doc.rect(margins.left, yPos, imgWidth, imgHeight);
          doc.addImage(pin.photo_url, 'JPEG', margins.left + 1, yPos + 1, imgWidth - 2, imgHeight - 2, undefined, 'FAST');
          yPos += imgHeight + 10;
        } catch (error) {
          console.error('Error adding photo:', error);
          doc.text('Error loading photo', margins.left, yPos);
          yPos += 10;
        }
      }
    }

    // Detailed Description
    if (pin.detailed_description) {
      doc.setFillColor(...RGB_COLORS.bgCard);
      doc.rect(margins.left, yPos, pageWidth - 2 * margins.left, 12, "F");
      doc.setFont(typography.fonts.heading, "bold");
      doc.setFontSize(typography.scale.h4);
      doc.text("Detailed Description", margins.left + 2, yPos + 8);
      yPos += 14;
      doc.setFont(typography.fonts.body, "normal");
      doc.setFontSize(typography.scale.body);
      const descLines = doc.splitTextToSize(pin.detailed_description, pageWidth - (2 * margins.left) - 4);
      doc.text(descLines, margins.left + 2, yPos);
      yPos += 5 * descLines.length + 8;
    }

    // Notes
    if (pin.notes) {
      doc.setFillColor(255, 250, 240);
      doc.rect(margins.left, yPos, pageWidth - 2 * margins.left, 12, "F");
      doc.setFont(typography.fonts.heading, "bold");
      doc.setFontSize(typography.scale.h4);
      doc.text("Notes", margins.left + 2, yPos + 8);
      yPos += 14;
      doc.setFont(typography.fonts.body, "normal");
      doc.setFontSize(typography.scale.body);
      const notesLines = doc.splitTextToSize(pin.notes, pageWidth - (2 * margins.left) - 4);
      doc.text(notesLines, margins.left + 2, yPos);
      yPos += 5 * notesLines.length + 8;
    }

    // Comments section
    if (pin.comments && pin.comments.length > 0) {
      if (yPos > pageHeight - 50) {
        doc.addPage();
        pageNum++;
        yPos = margins.top;
      }
      
      doc.setFillColor(245, 245, 245);
      doc.rect(margins.left, yPos, pageWidth - 2 * margins.left, 12, "F");
      doc.setFont(typography.fonts.heading, "bold");
      doc.setFontSize(typography.scale.h4);
      doc.text(`Comments (${pin.comments.length})`, margins.left + 2, yPos + 8);
      yPos += 14;
      
      doc.setFontSize(typography.scale.caption);
      pin.comments.forEach((comment) => {
        if (yPos > pageHeight - 30) {
          doc.addPage();
          pageNum++;
          yPos = margins.top;
        }
        
        doc.setFont(typography.fonts.heading, "bold");
        doc.text(`${comment.user_name || 'User'}`, margins.left + 2, yPos);
        doc.setFont(typography.fonts.body, "normal");
        doc.setTextColor(...RGB_COLORS.textMuted);
        doc.text(new Date(comment.created_at).toLocaleDateString(), margins.left + 50, yPos);
        doc.setTextColor(...RGB_COLORS.textPrimary);
        yPos += 5;
        
        const commentLines = doc.splitTextToSize(comment.comment, pageWidth - (2 * margins.left) - 4);
        doc.text(commentLines, margins.left + 2, yPos);
        yPos += 4 * commentLines.length + 6;
      });
    }

    // Edit History
    if (pin.edit_history && Array.isArray(pin.edit_history) && pin.edit_history.length > 0) {
      if (yPos > pageHeight - 50) {
        doc.addPage();
        pageNum++;
        yPos = margins.top;
      }
      
      doc.setFillColor(250, 245, 255);
      doc.rect(margins.left, yPos, pageWidth - 2 * margins.left, 12, "F");
      doc.setFont(typography.fonts.heading, "bold");
      doc.setFontSize(typography.scale.h4);
      doc.text("Edit History", margins.left + 2, yPos + 8);
      yPos += 14;
      
      doc.setFontSize(typography.scale.caption);
      doc.setFont(typography.fonts.body, "normal");
      
      pin.edit_history.slice(-5).forEach((edit: any) => {
        if (yPos > pageHeight - 20) {
          doc.addPage();
          pageNum++;
          yPos = margins.top;
        }
        
        const timestamp = new Date(edit.timestamp).toLocaleString();
        doc.setTextColor(...RGB_COLORS.textMuted);
        doc.text(timestamp, margins.left + 2, yPos);
        doc.setTextColor(...RGB_COLORS.textPrimary);
        yPos += 4;
        
        if (edit.changes?.status) {
          doc.text(`Status: ${edit.changes.status.from} → ${edit.changes.status.to}`, margins.left + 4, yPos);
          yPos += 4;
        }
        if (edit.changes?.priority) {
          doc.text(`Priority: ${edit.changes.priority.from} → ${edit.changes.priority.to}`, margins.left + 4, yPos);
          yPos += 4;
        }
        if (edit.changes?.assigned_contractor) {
          doc.text(`Contractor: ${edit.changes.assigned_contractor.from || 'None'} → ${edit.changes.assigned_contractor.to}`, margins.left + 4, yPos);
          yPos += 4;
        }
        yPos += 3;
      });
    }
  }

  // Add standardized footers to all pages (skip cover page)
  addFootersToAllPages(doc, true);
  
  // Log compliance
  logComplianceCheck('floorPlanReportGenerator', {
    hasCoverPage: true,
    logoPlacement: true,
    standardMargins: true,
    typographyScale: true,
    brandColors: true,
    pageHeaders: true,
    pageFooters: true,
    tableStyles: true,
    pageBreaks: true,
  });

  return doc;
};